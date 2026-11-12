/**
 * Personal Notes (0.9.0) — optional deterministic tags.
 *
 * Settings for the write selection (separate from sharing), a frozen preview
 * from host.previewTagging(), and Apply through host.applyTagging(). Cancel
 * or closing writes nothing. No model, no format conversion.
 */
import { Modal, Notice, Setting } from "obsidian";
import type { PersonalPluginHost } from "../personal-notes/plugin-host";
import type { TaggingFinding, TaggingPlan } from "../personal-notes/tagging";
import type { TaggingApplyResult } from "../personal-notes/tagging-writer";
import type { PersonalTaggingSettings } from "../personal-notes/types";
import type { RejectedFolder } from "../personal-notes/scope";
import { TAGGING_INTRO } from "../personal-notes/guides";
import { describeRejectedFolder, parseFolderLines } from "./connect-ai-modal";

/** Notes listed in a preview; the rest are counted. */
export const PREVIEW_NOTE_LIMIT = 100;

export function describeFinding(f: TaggingFinding): string {
  switch (f.kind) {
    case "duplicate_uid":
      return `The ID ${f.uid} is used by more than one note: ${f.paths.join(", ")}. ${f.repairing.length ? `New IDs are planned for: ${f.repairing.join(", ")}.` : "They all keep it; nothing is changed automatically. If one is a copy, delete the uid line in that copy, then preview again to give it a new ID."}`;
    case "invalid_uid":
      return `${f.path}: its uid “${f.value}” is not a valid ID, so it is left as it is.`;
    case "invalid_timestamp":
      return `${f.path}: ${f.key} “${f.value}” is not a valid time, so it is left as it is.`;
    case "frontmatter_error":
      return `${f.path}: the properties at the top of the note could not be read safely (${f.message}). This note will not be changed.`;
    case "supersedes_rejected":
      return f.reason === "disabled"
        ? `${f.path}: “supersedes” is turned off in Optional tags.`
        : f.reason === "not_selected"
          ? `${f.path}: this note is outside the folders chosen for tagging, so it cannot be changed.`
          : `${f.path} → ${f.target}: ${f.detail}.`;
  }
}

const SKIP_REASONS: Record<string, string> = {
  changed: "changed after the preview, so it was not overwritten — preview again",
  missing: "could not be read; it may have been moved or deleted",
  no_changes: "nothing to change",
};

/** Render a bounded per-note diff. Returns the selected-path set the toggles edit. */
export function renderPlan(el: HTMLElement, plan: TaggingPlan, selectable: boolean, keep?: Set<string>): Set<string> {
  const changing = plan.notes.filter((n) => n.proposedRaw != null && n.changes.length);
  const selected = keep ?? new Set(changing.map((n) => n.path));
  const unchanged = plan.notes.length - changing.length;
  el.createEl("p", { cls: "kosmos-personal-result", text: changing.length
    ? `${changing.length} ${changing.length === 1 ? "note would change" : "notes would change"}. ${unchanged} ${unchanged === 1 ? "needs" : "need"} no change. Nothing has been written yet.`
    : `No changes needed in ${plan.notes.length} ${plan.notes.length === 1 ? "note" : "notes"}. Nothing will be written.` }).setAttribute("role", "status");

  if (plan.findings.length) {
    el.createEl("h4", { text: "Needs your attention" });
    const ul = el.createEl("ul", { cls: "kosmos-tagging-findings" });
    for (const f of plan.findings) ul.createEl("li", { text: describeFinding(f) });
  }

  for (const note of changing.slice(0, PREVIEW_NOTE_LIMIT)) {
    const box = el.createDiv({ cls: "kosmos-tagging-note" });
    const row = new Setting(box).setName(note.path).setDesc(note.reasons.join(" · "));
    if (selectable) row.addToggle((t) => t.setValue(selected.has(note.path)).onChange((v) => { if (v) selected.add(note.path); else selected.delete(note.path); }));
    const details = box.createEl("details");
    details.createEl("summary", { text: "Show properties before and after" });
    const grid = details.createDiv({ cls: "kosmos-tagging-diff" });
    const before = grid.createDiv();
    before.createEl("div", { cls: "kosmos-tagging-diff-label", text: "Before" });
    before.createEl("pre", { text: note.previewBefore || "(no properties)" });
    const after = grid.createDiv();
    after.createEl("div", { cls: "kosmos-tagging-diff-label", text: "After" });
    after.createEl("pre", { text: note.previewAfter });
    if (note.skips.length) {
      const skips = details.createEl("ul");
      for (const s of note.skips) skips.createEl("li", { text: `${s.field}: ${s.reason}` });
    }
  }
  if (changing.length > PREVIEW_NOTE_LIMIT) {
    el.createEl("p", { cls: "setting-item-description", text: `…and ${changing.length - PREVIEW_NOTE_LIMIT} more notes, which are included when you apply.` });
  }
  return selected;
}

export function renderApplyResult(el: HTMLElement, r: TaggingApplyResult): void {
  const head = el.createEl("p", { cls: "kosmos-personal-result", text: `Written: ${r.written.length}. Skipped: ${r.skipped.filter((s) => s.reason !== "no_changes").length}. Failed: ${r.failed.length}.` });
  head.setAttribute("role", "status");
  const backups = r.written.map((w) => w.backupRef).filter((ref): ref is string => !!ref);
  if (backups.length) {
    el.createEl("p", { cls: "setting-item-description", text: `The exact earlier text of each changed note was saved first. Backup: ${backups.slice(0, 3).join(", ")}${backups.length > 3 ? ` and ${backups.length - 3} more` : ""}.` });
  }
  const problems = [
    ...r.skipped.filter((s) => s.reason !== "no_changes").map((s) => `${s.path}: ${SKIP_REASONS[s.reason] ?? s.detail}`),
    ...r.failed.map((f) => `${f.path}: not written — ${f.error}`),
  ];
  if (problems.length) {
    const ul = el.createEl("ul", { cls: "kosmos-tagging-findings" });
    for (const line of problems) ul.createEl("li", { text: line });
  }
}

export class TaggingModal extends Modal {
  private foldersText: string;
  private rejected: RejectedFolder[] = [];
  private plan: TaggingPlan | null = null;
  private selected = new Set<string>();
  private result: TaggingApplyResult | null = null;
  private message = "";
  private busy = false;

  constructor(private host: PersonalPluginHost) {
    super(host.app);
    this.foldersText = host.settings().personalNotes.tagging.folders.join("\n");
  }

  onOpen(): void { this.render(); }
  onClose(): void { this.plan = null; this.contentEl.empty(); }

  private tagging(): Readonly<PersonalTaggingSettings> { return this.host.settings().personalNotes.tagging; }

  private render(): void {
    const el = this.contentEl;
    el.empty();
    el.addClass("kosmos-personal-modal");
    el.createEl("h2", { text: "Optional tags" });
    for (const line of TAGGING_INTRO) el.createEl("p", { cls: "setting-item-description", text: line });
    const t = this.tagging();

    new Setting(el).setName("Use optional tags").setDesc("Master switch. Off by default; while off, Kosmos-Oden never adds tags.")
      .addToggle((c) => c.setValue(t.enabled).onChange((v) => void this.change((d) => { d.tagging.enabled = v; })));

    if (t.enabled) {
      new Setting(el).setName("Folders to tag").setDesc("One folder per line, or / for the whole vault. Separate from the folders shared with agents.")
        .addTextArea((c) => {
          c.setValue(this.foldersText).onChange((v) => { this.foldersText = v; });
          c.inputEl.setAttribute("aria-label", "Folders to tag, one per line");
        })
        .addButton((b) => b.setButtonText("Save folders").onClick(() => void this.saveFolders()));
      for (const r of this.rejected) el.createEl("p", { cls: "kosmos-personal-warning", text: describeRejectedFolder(r) });

      const field = (name: string, desc: string, value: boolean, set: (d: PersonalTaggingSettings, v: boolean) => void) =>
        new Setting(el).setName(name).setDesc(desc).addToggle((c) => c.setValue(value).onChange((v) => void this.change((d) => set(d.tagging, v))));
      field("Time stamps", "Adds created_at and updated_at when missing. Existing valid times are kept; a rerun never refreshes them.", t.timestamps, (d, v) => { d.timestamps = v; });
      field("Unique IDs", "Adds a permanent uid once. Existing IDs are never replaced; duplicates are shown for you to decide.", t.uniqueIds, (d, v) => { d.uniqueIds = v; });
      field("“Supersedes” links", "Lets you record, one note at a time, that a note replaces an older one (This note supersedes…).", t.supersession, (d, v) => { d.supersession = v; });
      field("Automatic time stamps", "Updates updated_at after you really edit a note in these folders. Never on opening, reading or indexing. Needs Time stamps.", t.automaticTimestamps, (d, v) => { d.automaticTimestamps = v; });
      this.renderPendingImports(el);
    }

    if (this.message) el.createEl("p", { cls: "kosmos-personal-warning", text: this.message }).setAttribute("role", "status");

    const canPreview = t.enabled && t.folders.length > 0 && (t.timestamps || t.uniqueIds);
    const actions = new Setting(el).setName("Preview deterministic tags")
      .setDesc(canPreview ? "Shows every change first. Nothing is written until you press Apply selected tags."
        : t.enabled && t.supersession && !t.timestamps && !t.uniqueIds ? "Supersedes links are added one note at a time: open the newer note and run This note supersedes…."
          : "Turn on optional tags, choose folders and at least Time stamps or Unique IDs.");
    actions.addButton((b) => b.setButtonText("Preview deterministic tags").setCta().setDisabled(!canPreview || this.busy).onClick(() => void this.preview()));
    if (t.enabled && t.supersession) actions.addButton((b) => b.setButtonText("This note supersedes…").onClick(() => { this.close(); this.host.openSupersedes(); }));

    if (this.plan) {
      const box = el.createDiv({ cls: "kosmos-tagging-preview" });
      this.selected = renderPlan(box, this.plan, true, this.selected);
      new Setting(box)
        .addButton((b) => b.setButtonText("Cancel").onClick(() => { this.plan = null; this.message = "Cancelled. Nothing was written."; this.render(); }))
        .addButton((b) => b.setButtonText("Apply selected tags").setCta().setDisabled(this.busy || !this.selected.size).onClick(() => void this.apply()));
    }
    if (this.result) renderApplyResult(el.createDiv({ cls: "kosmos-tagging-result" }), this.result);
  }

  private renderPendingImports(el: HTMLElement): void {
    let pending: string[] = [];
    try { pending = this.host.pendingImportFolders(); } catch { pending = []; }
    if (!pending.length) return;
    el.createEl("p", { cls: "setting-item-description", text: "Automatic tags stay off in these import folders until you mark the import finished:" });
    for (const folder of pending) {
      new Setting(el).setName(folder).addButton((b) => b.setButtonText("Import finished — review tags").onClick(async () => {
        try { await this.host.importFinished(folder); } catch (error: any) { this.message = `Could not mark ${folder} finished: ${String(error?.message || error)}`; }
        this.render();
      }));
    }
  }

  private async change(fn: (d: Parameters<Parameters<PersonalPluginHost["updatePersonalNotes"]>[0]>[0]) => void): Promise<void> {
    this.plan = null; // settings changed: an older preview no longer matches
    try {
      const r = await this.host.updatePersonalNotes(fn);
      this.rejected = r.rejected;
      this.message = r.saved ? "" : "The change was not saved.";
    } catch (error: any) {
      this.message = `The change was not saved: ${String(error?.message || error)}`;
    }
    this.render();
  }

  private async saveFolders(): Promise<void> {
    const folders = parseFolderLines(this.foldersText);
    await this.change((d) => { d.tagging.folders = folders; });
  }

  private async preview(): Promise<void> {
    this.busy = true;
    this.result = null;
    this.message = "Preparing the preview…";
    this.render();
    try {
      this.plan = await this.host.previewTagging();
      this.selected = new Set(this.plan.notes.filter((n) => n.proposedRaw != null && n.changes.length).map((n) => n.path));
      this.message = "";
    } catch (error: any) {
      this.plan = null;
      this.message = `The preview could not be made: ${String(error?.message || error)}`;
    }
    this.busy = false;
    this.render();
  }

  private async apply(): Promise<void> {
    const plan = this.plan;
    if (!plan) return;
    const subset: TaggingPlan = { ...plan, notes: plan.notes.filter((n) => this.selected.has(n.path)) };
    this.busy = true;
    this.render();
    try {
      this.result = await this.host.applyTagging(subset);
      this.plan = null;
      this.message = "";
      new Notice(`Kosmos-Oden: tags written to ${this.result.written.length} ${this.result.written.length === 1 ? "note" : "notes"}.`);
    } catch (error: any) {
      this.message = `Nothing was applied: ${String(error?.message || error)}`;
    }
    this.busy = false;
    this.render();
  }
}
