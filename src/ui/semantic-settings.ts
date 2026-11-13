/**
 * Semantic search (0.9.5) — the settings section.
 *
 * Three steps, top to bottom: turn it on, choose a model (download one from
 * the list, or pick your own files), and watch the index build. Everything
 * runs inside Obsidian; the only thing that ever uses the internet is the
 * Download button.
 */
import { Notice, Setting } from "obsidian";
import { ALLOWED_MODEL_LICENSES, CUSTOM_MODEL_ID, MODEL_CATALOG, catalogModel, modelDownloadBytes } from "../semantic/catalog";
import type { SemanticOverview } from "../semantic/controller";
import type { SemanticSettings } from "../semantic/settings";

/** What the section needs from the plugin. */
export interface SemanticSettingsHost {
  semanticSettings(): SemanticSettings;
  updateSemantic(change: (draft: SemanticSettings) => void): Promise<void>;
  semanticOverview(): SemanticOverview;
  /** Which models are on this device (`custom` = the user's own files are in place). */
  semanticInstalled(): Promise<Record<string, boolean>>;
  downloadSemanticModel(modelId: string): Promise<void>;
  cancelSemanticDownload(): void;
  importSemanticModel(files: ReadonlyArray<{ name: string; data: ArrayBuffer }>): Promise<{ saved: string[]; ignored: string[] }>;
  removeSemanticModel(modelId: string): Promise<void>;
  rebuildSemanticIndex(): Promise<void>;
  setSemanticPaused(paused: boolean): void;
  /** Called whenever the overview changes; returns the unsubscribe. */
  onSemanticStatus(listener: () => void): () => void;
}

/** Decimal megabytes, as the catalog labels and the model host state them. */
const megabytes = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;
const message = (e: unknown) => String((e as { message?: unknown })?.message ?? e);

/**
 * Render the section into `el`. Returns a function that stops its live
 * updates; call it when the settings page is closed or drawn again.
 */
export function renderSemanticSettings(el: HTMLElement, host: SemanticSettingsHost): () => void {
  let installed: Record<string, boolean> = {};
  let live = true;
  let busy = false;
  /** A text box has the cursor: the section is not drawn again until it is left, so typing is never interrupted. */
  let typing = false;
  let stale = false;

  el.createEl("h3", { text: "Semantic search" });
  el.createEl("p", {
    cls: "setting-item-description",
    text: "Find notes by meaning, not only by the words in them: “how do I restore the server” also finds a note titled “Recovery runbook”. A small embedding model runs inside Obsidian on this computer. Nothing else needs to be installed, and no note text leaves this device. Your AI then searches by words and by meaning together.",
  });
  const body = el.createDiv({ cls: "kosmos-semantic" });

  const run = async (work: () => Promise<void>, failure: string): Promise<void> => {
    if (busy) return;
    busy = true;
    try { await work(); }
    catch (e) { new Notice(`Kosmos-Oden: ${failure}: ${message(e)}`); }
    finally { busy = false; }
    await refresh();
  };

  /** The status line and progress bar change often; they are updated in place so the controls keep focus. */
  let statusEl: HTMLElement | null = null;
  let barEl: HTMLElement | null = null;
  let drawnPhase = "";
  const paint = (o: SemanticOverview): void => {
    if (!statusEl || !barEl) return;
    statusEl.setText(o.message);
    statusEl.toggleClass("kosmos-personal-warning", o.phase === "error");
    const fraction = o.download ? (o.download.totalBytes ? o.download.receivedBytes / o.download.totalBytes : 0)
      : (o.phase === "indexing" || o.phase === "paused") && o.totalNotes ? o.indexedNotes / o.totalNotes : -1;
    barEl.toggleClass("kosmos-semantic-hidden", fraction < 0);
    if (fraction >= 0) {
      const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
      barEl.setAttribute("value", String(pct));
      barEl.setAttribute("aria-valuenow", String(pct));
    }
  };

  /** A text box that saves when it is left (or Enter is pressed), not on every key: each saved change restarts the model. */
  const field = (setting: Setting, value: string, placeholder: string, commit: (value: string) => void): void => {
    setting.addText((t) => {
      t.setPlaceholder(placeholder).setValue(value);
      t.inputEl.addEventListener("focus", () => { typing = true; });
      t.inputEl.addEventListener("blur", () => {
        typing = false;
        if (t.inputEl.value !== value) commit(t.inputEl.value);
        else if (stale) draw();
      });
      t.inputEl.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter") t.inputEl.blur(); });
    });
  };

  const draw = (): void => {
    if (!live) return;
    if (typing) { stale = true; return; }
    stale = false;
    const s = host.semanticSettings();
    const o = host.semanticOverview();
    drawnPhase = `${o.phase}|${o.download?.modelId ?? ""}`;
    body.empty();

    // 1. On / off.
    new Setting(body).setName("Search by meaning")
      .setDesc("Off: search uses words only, exactly as before. On: the chosen model reads your notes in the background and search uses both.")
      .addToggle((t) => t.setValue(s.enabled).onChange((v) => void run(() => host.updateSemantic((d) => { d.enabled = v; }), "could not change semantic search")));

    // 2. The model.
    const entry = catalogModel(s.modelId);
    const custom = s.modelId === CUSTOM_MODEL_ID;
    const here = installed[s.modelId] === true;
    const model = new Setting(body).setName("Embedding model")
      .setDesc(custom
        ? "Use an embedding model you already have: an ONNX feature-extraction export (BERT-style) with its tokenizer. Nothing is downloaded. Its licence is yours to check."
        : entry ? `${entry.summary} Licence: ${entry.license}. ${megabytes(modelDownloadBytes(entry))} download, once.${here ? " On this device." : ""}` : "")
      .addDropdown((d) => {
        for (const m of MODEL_CATALOG) d.addOption(m.id, `${m.label} · ${m.license}${installed[m.id] ? " · downloaded" : ""}`);
        d.addOption(CUSTOM_MODEL_ID, "Use my own model files…");
        d.setValue(s.modelId).onChange((v) => void run(() => host.updateSemantic((draft) => { draft.modelId = v; }), "could not change the model"));
      });
    if (entry) {
      if (o.download?.modelId === entry.id) model.addButton((b) => b.setButtonText("Cancel download").onClick(() => host.cancelSemanticDownload()));
      else if (!here) {
        model.addButton((b) => b.setButtonText(`Download (${megabytes(modelDownloadBytes(entry))})`).setCta().setDisabled(o.download !== null)
          .onClick(() => void run(async () => {
            await host.downloadSemanticModel(entry.id);
            new Notice(`Kosmos-Oden: ${entry.label.split(" — ")[0]} is downloaded and verified.`);
          }, "the download did not finish")));
      } else {
        model.addButton((b) => b.setButtonText("Delete model").onClick(() => void run(() => host.removeSemanticModel(entry.id), "could not delete the model")));
      }
      const src = body.createEl("p", { cls: "setting-item-description kosmos-semantic-source" });
      src.createSpan({ text: `Every model in this list is published under ${ALLOWED_MODEL_LICENSES.join(" or ")}. This one comes from ` });
      src.createEl("a", { text: `huggingface.co/${entry.repo}`, href: entry.licenseUrl });
      src.createSpan({ text: `, fixed at revision ${entry.revision.slice(0, 12)}; each file is checked against its published SHA-256 before it is used.` });
    }

    if (custom) {
      const pick = new Setting(body).setName("Your model files")
        .setDesc(here
          ? "Your model is in place. Choose files again to replace it."
          : "Choose the model (.onnx), tokenizer.json and, if you have it, tokenizer_config.json. Select them together; they are copied into the plugin's folder.");
      const input = pick.controlEl.createEl("input", { type: "file", cls: "kosmos-semantic-file", attr: { multiple: "true", accept: ".onnx,.json", "aria-label": "Choose model files" } }) as HTMLInputElement;
      input.addEventListener("change", () => {
        const files = Array.from(input.files ?? []);
        if (!files.length) return;
        void run(async () => {
          const picked = await Promise.all(files.map(async (f) => ({ name: f.name, data: await f.arrayBuffer() })));
          const result = await host.importSemanticModel(picked);
          const parts = [result.saved.length ? `saved ${result.saved.join(", ")}` : "nothing was saved"];
          if (result.ignored.length) parts.push(`ignored ${result.ignored.join(", ")}`);
          new Notice(`Kosmos-Oden: ${parts.join("; ")}.`);
        }, "could not use those files");
      });
      if (here) pick.addButton((b) => b.setButtonText("Delete model").onClick(() => void run(() => host.removeSemanticModel(CUSTOM_MODEL_ID), "could not delete the model")));

      const change = (apply: (c: SemanticSettings["custom"]) => void) => run(() => host.updateSemantic((d) => { apply(d.custom); }), "could not save the model settings");
      field(new Setting(body).setName("Name").setDesc("Shown in the status and to your AI."), s.custom.name, "Your own model", (v) => void change((c) => { c.name = v; }));
      new Setting(body).setName("Pooling").setDesc("How the model's output becomes one vector. The model's card says which; most sentence-transformers models use mean, BGE and Arctic use CLS. A wrong choice still works but ranks worse.")
        .addDropdown((d) => d.addOption("mean", "Mean of all tokens").addOption("cls", "First token (CLS)").setValue(s.custom.pooling).onChange((v) => void change((c) => { c.pooling = v === "cls" ? "cls" : "mean"; })));
      field(new Setting(body).setName("Longest input (tokens)").setDesc("The model's maximum sequence length; 512 for most. Longer passages are cut."), String(s.custom.maxTokens), "512", (v) => {
        const n = Number(v);
        if (Number.isInteger(n) && n >= 16 && n <= 8192) void change((c) => { c.maxTokens = n; });
        else { new Notice("Kosmos-Oden: the longest input must be a whole number from 16 to 8192."); draw(); }
      });
      field(new Setting(body).setName("Question prefix").setDesc("Text some models expect before a question, for example “query: ”. Leave empty if the model's card names none."), s.custom.queryPrefix, "", (v) => void change((c) => { c.queryPrefix = v; }));
      field(new Setting(body).setName("Passage prefix").setDesc("Text some models expect before a note passage, for example “passage: ”. Usually empty."), s.custom.passagePrefix, "", (v) => void change((c) => { c.passagePrefix = v; }));
      body.createEl("p", { cls: "setting-item-description", text: "Changing the files or any of these four settings builds a new index, because the vectors change." });
    }

    // 3. The index.
    const status = new Setting(body).setName("Index");
    statusEl = status.descEl;
    statusEl.setAttribute("role", "status");
    statusEl.setAttribute("aria-live", "polite");
    barEl = body.createEl("progress", { cls: "kosmos-semantic-progress", attr: { max: "100", value: "0", "aria-label": "Progress" } });
    if (o.phase === "indexing") status.addButton((b) => b.setButtonText("Pause").onClick(() => { host.setSemanticPaused(true); draw(); }));
    if (o.phase === "paused") status.addButton((b) => b.setButtonText("Resume").setCta().onClick(() => { host.setSemanticPaused(false); draw(); }));
    if (o.phase === "ready" || o.phase === "indexing" || o.phase === "paused") {
      let armed = false;
      status.addButton((b) => b.setButtonText("Rebuild index").onClick(() => {
        if (!armed) { armed = true; b.setButtonText("Rebuild: embed every note again?").setWarning(); return; }
        void run(() => host.rebuildSemanticIndex(), "could not rebuild the index");
      }));
    }
    paint(o);
    body.createEl("p", {
      cls: "setting-item-description",
      text: "The index is one SQLite file in the plugin's folder, made by Kosmos-Oden itself. It holds note paths and numbers, never note text (no passage, heading or title), and it is built for one model: choosing another model builds another index. Sharing rules are unchanged: an assistant is only ever shown notes in the Folders shared with agents.",
    });
  };

  async function refresh(): Promise<void> {
    try { installed = await host.semanticInstalled(); } catch { /* keep the last answer */ }
    draw();
  }

  const unsubscribe = host.onSemanticStatus(() => {
    if (!live) return;
    const o = host.semanticOverview();
    // Progress only: repaint in place. A different phase changes which buttons
    // exist (Download becomes Cancel while it runs), so draw again — at once
    // when an action of this page caused it; that action refreshes when it ends.
    if (`${o.phase}|${o.download?.modelId ?? ""}` === drawnPhase) paint(o);
    else if (busy) draw();
    else void refresh();
  });
  draw();
  void refresh();
  return () => { live = false; unsubscribe(); };
}
