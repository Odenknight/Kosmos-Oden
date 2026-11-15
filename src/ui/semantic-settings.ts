/**
 * Semantic search (0.9.5) — the settings section.
 *
 * Three steps, top to bottom: turn it on, choose where embeddings are made
 * (a model inside the plugin — download one from the list, or pick your own
 * files — or an embedding server you run), and watch the index build. With
 * the built-in model everything runs inside Obsidian and the only thing that
 * uses the internet is the Download button; with an embedding server, note
 * text goes to the address typed here and nowhere else.
 */
import { Notice, Setting } from "obsidian";
import { ALLOWED_MODEL_LICENSES, CUSTOM_MODEL_ID, MODEL_CATALOG, catalogModel, modelDownloadBytes } from "../semantic/catalog";
import type { SemanticOverview, ServerTestResult } from "../semantic/controller";
import { validateEmbeddingAddress } from "../semantic/endpoint";
import { DEFAULT_SERVER_URL, SERVER_BATCH_LIMITS, type EmbeddingServerSettings, type SemanticSettings } from "../semantic/settings";

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
  /** Embedding server: one probe with the saved settings. Never rejects. */
  testEmbeddingServer(): Promise<ServerTestResult>;
  /** Embedding server: ask again now. */
  retrySemantic(): Promise<void>;
  /** Whether an API key is stored on this device. */
  embeddingKeySaved(): boolean;
  /** Store (or, with "", forget) the API key on this device only. */
  setEmbeddingKey(key: string): Promise<void>;
}

/** Address presets: the usual ports of two common servers on this computer. */
export const SERVER_PRESETS = [
  { label: "llama.cpp on this computer", url: "http://127.0.0.1:8080", api: "openai" },
  { label: "Ollama on this computer", url: "http://127.0.0.1:11434", api: "ollama" },
] as const;

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
  /** The last Test connection result, kept across redraws. */
  let tested: { ok: boolean; message: string } | null = null;
  let advancedOpen = false;

  el.createEl("h3", { text: "Semantic search" });
  el.createEl("p", {
    cls: "setting-item-description",
    text: "Find notes by meaning, not only by the words in them: “how do I restore the server” also finds a note titled “Recovery runbook”. By default a small embedding model runs inside Obsidian on this computer. Nothing else needs to be installed, and no note text leaves this device. If you already run an embedding server (llama.cpp, Ollama and others), you can use it instead. Your AI then searches by words and by meaning together.",
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
  const field = (setting: Setting, value: string, placeholder: string, commit: (value: string) => void, password = false): void => {
    setting.addText((t) => {
      t.setPlaceholder(placeholder).setValue(value);
      if (password) { t.inputEl.setAttribute("type", "password"); t.inputEl.setAttribute("autocomplete", "off"); }
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
    drawnPhase = `${o.phase}|${o.download?.modelId ?? ""}|${o.retry}`;
    body.empty();

    // 1. On / off.
    new Setting(body).setName("Search by meaning")
      .setDesc("Off: search uses words only, exactly as before. On: the chosen model reads your notes in the background and search uses both.")
      .addToggle((t) => t.setValue(s.enabled).onChange((v) => void run(() => host.updateSemantic((d) => { d.enabled = v; }), "could not change semantic search")));

    // 2. Where embeddings are made.
    new Setting(body).setName("Where embeddings are made")
      .setDesc(s.engine === "server"
        ? "An embedding server you run, on this computer or on your network, turns note text into numbers. Nothing is loaded inside Obsidian."
        : "A model inside the plugin, on this computer. Nothing else to install.")
      .addDropdown((d) => d.addOption("builtin", "Inside the plugin").addOption("server", "Embedding server").setValue(s.engine)
        .onChange((v) => void run(() => host.updateSemantic((draft) => { draft.engine = v === "server" ? "server" : "builtin"; }), "could not change where embeddings are made")));
    if (s.engine === "server") drawServer(s);
    else drawBuiltin(s, o);

    // 3. The index.
    const status = new Setting(body).setName("Index");
    statusEl = status.descEl;
    statusEl.setAttribute("role", "status");
    statusEl.setAttribute("aria-live", "polite");
    barEl = body.createEl("progress", { cls: "kosmos-semantic-progress", attr: { max: "100", value: "0", "aria-label": "Progress" } });
    if (o.retry) status.addButton((b) => b.setButtonText("Retry").setCta().onClick(() => void run(() => host.retrySemantic(), "could not reach the embedding server")));
    if (o.phase === "indexing") status.addButton((b) => b.setButtonText("Pause").onClick(() => { host.setSemanticPaused(true); draw(); }));
    if (o.phase === "paused" && !o.retry) status.addButton((b) => b.setButtonText("Resume").setCta().onClick(() => { host.setSemanticPaused(false); draw(); }));
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

  /** The embedding server panel. */
  const drawServer = (s: SemanticSettings): void => {
    const change = (apply: (c: EmbeddingServerSettings) => void) => run(() => host.updateSemantic((d) => { apply(d.server); }), "could not save the embedding server settings");
    const check = validateEmbeddingAddress(s.server.url);

    const address = new Setting(body).setName("Address");
    if (check.ok === false) {
      address.setDesc((check as { error: string }).error);
      address.descEl.addClass("kosmos-personal-warning");
    } else address.setDesc("Where your embedding server listens, with its port.");
    field(address, s.server.url, DEFAULT_SERVER_URL, (v) => void change((c) => { c.url = v.trim(); }));

    const presets = new Setting(body).setName("Common setups").setDesc("Fill in the usual address. Start the server first.");
    for (const preset of SERVER_PRESETS) {
      presets.addButton((b) => b.setButtonText(preset.label).onClick(() => void change((c) => { c.url = preset.url; c.api = preset.api; })));
    }

    new Setting(body).setName("Server type")
      .setDesc("Detect automatically tries the OpenAI-compatible route first, then Ollama's.")
      .addDropdown((d) => d.addOption("auto", "Detect automatically").addOption("openai", "OpenAI-compatible — llama.cpp, LM Studio, vLLM").addOption("ollama", "Ollama")
        .setValue(s.server.api).onChange((v) => void change((c) => { c.api = v === "openai" || v === "ollama" ? v : "auto"; })));

    field(new Setting(body).setName("Model name").setDesc("Optional for OpenAI-compatible servers; required for Ollama (for example bge-m3)."),
      s.server.model, s.server.api === "ollama" ? "bge-m3" : "Optional", (v) => void change((c) => { c.model = v.trim(); }));

    const saved = host.embeddingKeySaved();
    const key = new Setting(body).setName("API key")
      .setDesc(saved ? "A key is saved on this device. Type a new one to replace it." : "Optional. Only if your server asks for one. Kept on this device only: it is not saved in the plugin's settings and does not sync.");
    field(key, "", saved ? "Saved on this device" : "Optional", (v) => void run(async () => { await host.setEmbeddingKey(v); }, "could not save the API key"), true);
    if (saved) key.addButton((b) => b.setButtonText("Forget key").onClick(() => void run(() => host.setEmbeddingKey(""), "could not forget the API key")));

    const advanced = body.createEl("details", { cls: "kosmos-semantic-advanced" });
    if (advancedOpen) advanced.setAttribute("open", "");
    advanced.addEventListener("toggle", () => { advancedOpen = (advanced as unknown as { open?: boolean }).open === true; });
    advanced.createEl("summary", { text: "Advanced" });
    field(new Setting(advanced).setName("Question prefix").setDesc("Text the model expects before a question, if its card names one (E5: “query: ”). Type \\n for a line break."),
      s.server.queryPrefix, "", (v) => void change((c) => { c.queryPrefix = v; }));
    field(new Setting(advanced).setName("Passage prefix").setDesc("Text the model expects before a note passage, if its card names one (E5: “passage: ”)."),
      s.server.passagePrefix, "", (v) => void change((c) => { c.passagePrefix = v; }));
    field(new Setting(advanced).setName("Passages per request").setDesc(`How many passages are sent at once, ${SERVER_BATCH_LIMITS.min} to ${SERVER_BATCH_LIMITS.max}. Lower it if the server runs out of memory.`),
      String(s.server.batch), String(SERVER_BATCH_LIMITS.default), (v) => {
        const n = Number(v);
        if (Number.isInteger(n) && n >= SERVER_BATCH_LIMITS.min && n <= SERVER_BATCH_LIMITS.max) void change((c) => { c.batch = n; });
        else { new Notice(`Kosmos-Oden: passages per request must be a whole number from ${SERVER_BATCH_LIMITS.min} to ${SERVER_BATCH_LIMITS.max}.`); draw(); }
      });
    advanced.createEl("p", { cls: "setting-item-description", text: "Changing the model name or a prefix builds a new index, because the vectors change. Changing only the address keeps the index." });

    const test = new Setting(body).setName("Test connection")
      .setDesc(tested ? tested.message : "Sends the word “probe” and shows what comes back.")
      .addButton((b) => b.setButtonText("Test connection").onClick(() => void run(async () => {
        const result = await host.testEmbeddingServer();
        tested = { ok: result.ok, message: result.message };
        // Remember the route that answered, so later requests go straight to it.
        if (result.ok === true && host.semanticSettings().server.api === "auto") {
          const api = (result as { api: "openai" | "ollama" }).api;
          await host.updateSemantic((d) => { d.server.api = api; });
        }
      }, "could not test the embedding server")));
    if (tested && !tested.ok) test.descEl.addClass("kosmos-personal-warning");

    const privacy = body.createEl("p", { cls: "setting-item-description kosmos-semantic-privacy" });
    privacy.createSpan({ text: "Note text is sent to this address to be turned into numbers. Use a server you run." });
    if (check.ok === true) {
      const ok = check as { where: string; encrypted: boolean };
      if (ok.where === "network") {
        privacy.createSpan({ text: " This address is another computer on your network." });
        if (!ok.encrypted) privacy.createSpan({ text: " The text travels unencrypted." });
      } else privacy.createSpan({ text: " This address is this computer." });
    }
  };

  /** The model inside the plugin (unchanged from the built-in-only section). */
  const drawBuiltin = (s: SemanticSettings, o: SemanticOverview): void => {
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
    if (`${o.phase}|${o.download?.modelId ?? ""}|${o.retry}` === drawnPhase) paint(o);
    else if (busy) draw();
    else void refresh();
  });
  draw();
  void refresh();
  return () => { live = false; unsubscribe(); };
}
