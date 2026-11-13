/**
 * Personal Notes (0.9.0) — "Add notes".
 *
 * Add notes → source → official guide → Open Importer → review results →
 * choose folders → search. Conversion is done by the Obsidian Importer
 * plugin; this window writes no note. Choosing a source changes neither the
 * active profile, sensitivity nor sharing.
 */
import { Modal, Notice, Setting, TFile } from "obsidian";
import type { PersonalPluginHost } from "../personal-notes/plugin-host";
import type { PersonalNotesStatus } from "../personal-notes/status";
import { normalizeFolder, PERSONAL_WHOLE_VAULT } from "../personal-notes/scope";
import {
  IMPORTER_INSTALL_URI, IMPORTER_PALETTE_FALLBACK, IMPORTER_TESTED_VERSION, PERSONAL_NOTES_PROMISES,
  PERSONAL_PROFILE_EXPLAINER, REIMPORT_ADVICE, SOURCE_GUIDES, type SourceGuide,
} from "../personal-notes/guides";
import { FilePickerModal } from "./note-picker";

type Step = "choose" | "guide" | "review";

/** Plain-language Importer state. Never throws. */
export function importerGuidance(host: PersonalPluginHost): { ready: boolean; text: string; install: boolean } {
  let info: ReturnType<PersonalPluginHost["importer"]>;
  try { info = host.importer(); } catch { return { ready: false, install: false, text: "Could not check whether the Importer plugin is installed. You can still try Open Importer." }; }
  const version = info.version ? ` (version ${info.version})` : "";
  switch (info.state) {
    case "enabled":
      return info.tested
        ? { ready: true, install: false, text: `The Importer plugin${version} is installed and turned on.` }
        : { ready: true, install: false, text: `The Importer plugin${version} is turned on. These steps were checked with version ${IMPORTER_TESTED_VERSION}; its screens may look different.` };
    case "installed":
      return { ready: false, install: false, text: "The Importer plugin is installed but turned off. Turn it on in Settings → Community plugins, then come back." };
    case "missing":
      return { ready: false, install: true, text: "The Importer plugin is not installed. Install it from Community plugins (it is made by Obsidian), turn it on, then come back." };
    default:
      return { ready: false, install: false, text: "Could not check whether the Importer plugin is installed. You can still try Open Importer." };
  }
}

export class AddNotesModal extends Modal {
  private step: Step = "choose";
  private guide: SourceGuide | null = null;
  private folder = "";
  private folderError = "";
  private importerMessage = "";
  private reportMessage = "";

  constructor(private host: PersonalPluginHost) { super(host.app); }

  onOpen(): void { this.render(); }
  onClose(): void { this.renderSeq++; this.contentEl.empty(); }

  private go(step: Step): void { this.step = step; this.render(); }

  private renderSeq = 0;

  private render(): void {
    const el = this.contentEl;
    this.renderSeq++;
    el.empty();
    el.addClass("kosmos-personal-modal");
    if (this.step === "choose") this.renderChoose(el);
    else if (this.step === "guide") this.renderGuide(el);
    else void this.renderReview(el);
  }

  /* ------------------------------------------------------------- choose */

  private renderChoose(el: HTMLElement): void {
    el.createEl("h2", { text: "Add notes" });
    for (const line of PERSONAL_NOTES_PROMISES) el.createEl("p", { text: line, cls: "setting-item-description" });
    el.createEl("h3", { text: "Where are your notes now?" });
    for (const guide of SOURCE_GUIDES) {
      const row = new Setting(el).setName(guide.title).setDesc(guide.summary);
      if (guide.guideUrl) row.addButton((b) => b.setButtonText("Official guide").onClick(() => window.open(guide.guideUrl!)));
      row.addButton((b) => b.setButtonText("Choose").setCta().onClick(() => this.choose(guide)));
    }
    new Setting(el).setName("Already imported?").setDesc("Review what is in your import folders and the Importer's report.")
      .addButton((b) => b.setButtonText("Review results").onClick(() => this.go("review")));

    if (this.host.settings().activeProfile !== "personal") {
      el.createEl("h3", { text: "Profile" });
      el.createEl("p", { text: PERSONAL_PROFILE_EXPLAINER, cls: "setting-item-description" });
      new Setting(el).setName("Use the Personal Notes profile").setDesc("Optional. You can switch back in Settings → Kosmos-Oden.")
        .addButton((b) => b.setButtonText("Switch to Personal Notes").onClick(async () => {
          try { await this.host.setActiveProfile("personal"); new Notice("Kosmos-Oden: Personal Notes profile is on. Nothing is shared until you choose folders."); }
          catch (error: any) { new Notice(`Kosmos-Oden: could not switch: ${String(error?.message || error)}`); }
          this.render();
        }));
    }
  }

  private choose(guide: SourceGuide): void {
    this.guide = guide;
    this.folder = guide.suggestedFolder;
    this.folderError = "";
    this.importerMessage = "";
    this.go(guide.usesImporter ? "guide" : "review");
  }

  /* -------------------------------------------------------------- guide */

  private renderGuide(el: HTMLElement): void {
    const guide = this.guide!;
    el.createEl("h2", { text: guide.title });
    if (guide.guideUrl) {
      const p = el.createEl("p", { cls: "setting-item-description", text: "Official step-by-step guide: " });
      const a = p.createEl("a", { text: guide.guideUrl, href: guide.guideUrl });
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    }

    new Setting(el).setName("Destination folder")
      .setDesc("A separate folder for this source, with its pictures and attachments inside it. Use the same folder in the Importer.")
      .addText((t) => {
        t.setPlaceholder(guide.suggestedFolder).setValue(this.folder);
        t.inputEl.setAttribute("aria-label", "Destination folder");
        t.onChange((v) => { this.folder = v; });
      });
    if (this.folderError) el.createEl("p", { cls: "kosmos-personal-warning", text: this.folderError });

    const steps = el.createEl("ol", { cls: "kosmos-personal-steps" });
    for (const step of guide.steps) steps.createEl("li", { text: step.replace("{folder}", this.folder.trim() || guide.suggestedFolder) });
    if (guide.notes.length) {
      el.createEl("h3", { text: "Good to know" });
      const notes = el.createEl("ul");
      for (const note of guide.notes) notes.createEl("li", { text: note });
    }
    el.createEl("h3", { text: "Importing again later" });
    for (const line of REIMPORT_ADVICE) el.createEl("p", { text: line, cls: "setting-item-description" });

    const state = importerGuidance(this.host);
    const importer = new Setting(el).setName("Importer").setDesc(state.text);
    if (state.install) importer.addButton((b) => b.setButtonText("Get the Importer").onClick(() => window.open(IMPORTER_INSTALL_URI)));
    importer.addButton((b) => b.setButtonText("Open Importer").setCta().onClick(() => void this.openImporter()));
    if (this.importerMessage) el.createEl("p", { cls: "kosmos-personal-warning", text: this.importerMessage }).setAttribute("role", "status");

    new Setting(el)
      .addButton((b) => b.setButtonText("Back").onClick(() => this.go("choose")))
      .addButton((b) => b.setButtonText("Review results").setCta().onClick(() => this.go("review")));
  }

  /** Validated destination folder, or null with folderError set. */
  private destination(): string | null {
    const folder = normalizeFolder(this.folder);
    if (!folder || folder === PERSONAL_WHOLE_VAULT) {
      this.folderError = "Enter a folder inside the vault, for example Import/Google Keep (use / between folder names).";
      return null;
    }
    this.folderError = "";
    return folder;
  }

  private async openImporter(): Promise<void> {
    const folder = this.destination();
    if (!folder) { this.render(); return; }
    try {
      const r = await this.host.updatePersonalNotes((d) => { if (!d.importFolders.includes(folder)) d.importFolders = [...d.importFolders, folder]; });
      if (!r.saved) { this.folderError = "That folder name could not be saved. Use letters and / between folder names."; this.render(); return; }
    } catch (error: any) {
      this.folderError = `Could not save the folder: ${String(error?.message || error)}`;
      this.render();
      return;
    }
    let opened = false;
    try { opened = this.host.openImporter(folder); } catch { opened = false; }
    if (opened) {
      this.importerMessage = `The Importer is open. Import into ${folder}, then come back to Add notes and choose Review results.`;
      this.close();
      new Notice(`Kosmos-Oden: import into ${folder}. When the Importer has finished, open Add notes → Review results.`, 10000);
      return;
    }
    this.importerMessage = `The Importer could not be opened from here. ${IMPORTER_PALETTE_FALLBACK} Import into ${folder}.`;
    this.render();
  }

  /* ------------------------------------------------------------- review */

  private async renderReview(el: HTMLElement): Promise<void> {
    el.createEl("h2", { text: "Review results" });
    const body = el.createDiv();
    body.createEl("p", { text: "Reading your import folders…", cls: "setting-item-description" });
    const seq = this.renderSeq;
    let status: PersonalNotesStatus | null = null;
    try { status = await this.host.personalNotesStatus(); } catch { status = null; }
    if (seq !== this.renderSeq) return; // re-rendered or closed meanwhile
    body.empty();
    if (!status) body.createEl("p", { cls: "kosmos-personal-warning", text: "Could not read your import folders just now. Try again in a moment." });
    else this.renderInventory(body, status);
    this.renderReports(el, status);
    this.renderPending(el);
    this.renderSearchState(el);

    el.createEl("h3", { text: "Next" });
    new Setting(el).setName("Choose folders to share").setDesc("Assistants can read only the Folders shared with agents. Imported notes are not shared until you choose them.")
      .addButton((b) => b.setButtonText("Connect my AI").onClick(() => { this.close(); this.host.openConnectAi(); }));
    new Setting(el).setName("Find something").setDesc("Your own search covers the whole vault.")
      .addButton((b) => b.setButtonText("Search my notes").setCta().onClick(() => { this.close(); void this.host.openPersonalSearch(); }));
    new Setting(el).setName("Optional tags").setDesc("Time stamps, permanent IDs and “supersedes” links, off unless you choose them.")
      .addButton((b) => b.setButtonText("Optional tags").onClick(() => { this.close(); this.host.openTagging(); }));
    new Setting(el).addButton((b) => b.setButtonText("Back").onClick(() => this.go(this.guide?.usesImporter ? "guide" : "choose")));
  }

  private renderInventory(body: HTMLElement, status: PersonalNotesStatus): void {
    if (!status.importFolders.length) {
      body.createEl("p", { cls: "setting-item-description", text: "No import folder is recorded yet. Choose a source and press Open Importer to record one." });
      return;
    }
    body.createEl("p", { cls: "setting-item-description", text: `Import folders: ${status.importFolders.join(", ")}` });
    const list = body.createEl("ul", { cls: "kosmos-personal-status" });
    list.createEl("li", { text: `Files present: ${status.notesPresent} ${status.notesPresent === 1 ? "note" : "notes"} and ${status.otherFilesPresent} other ${status.otherFilesPresent === 1 ? "file" : "files"} (pictures, attachments). This counts what is in the folders now, not what the last import created.` });
    list.createEl("li", { text: `Notes with searchable words: ${status.searchable}` });
    list.createEl("li", { text: `Notes with no words (pictures, drawings or attachments only): ${status.needsAttentionTotal}` });
    list.createEl("li", { text: "Items the Importer skipped or could not convert: unknown to Kosmos-Oden. The Importer's report lists them; select it below." });
    if (status.needsAttention.length) {
      const details = body.createEl("details");
      details.createEl("summary", { text: "Notes with no words" });
      const ul = details.createEl("ul");
      for (const path of status.needsAttention) ul.createEl("li", { text: path });
      if (status.needsAttentionTotal > status.needsAttention.length) ul.createEl("li", { text: `…and ${status.needsAttentionTotal - status.needsAttention.length} more` });
    }
    if (status.notesPresent === 0) body.createEl("p", { cls: "setting-item-description", text: "No notes are in the import folders yet. If the Importer used a different folder, choose the source again and enter that folder." });
  }

  private renderReports(el: HTMLElement, status: PersonalNotesStatus | null): void {
    el.createEl("h3", { text: "Importer report" });
    el.createEl("p", { cls: "setting-item-description", text: "The Importer can write a report of skipped and failed items. Select that file (whatever language it is in) to keep it one click away. Reports are never shared with assistants." });
    const reports = status?.reports ?? this.host.settings().personalNotes.importReportPaths.map((path) => ({ path, present: true }));
    for (const report of reports) {
      const row = new Setting(el).setName(report.path).setDesc(report.present ? "" : "This file is no longer in the vault.");
      if (report.present) row.addButton((b) => b.setButtonText("Open").onClick(() => this.openFile(report.path)));
      row.addButton((b) => b.setButtonText("Remove").onClick(() => void this.setReports((list) => list.filter((p) => p !== report.path))));
    }
    if (this.reportMessage) el.createEl("p", { cls: "kosmos-personal-warning", text: this.reportMessage });
    new Setting(el).addButton((b) => b.setButtonText("Select the Importer report").onClick(() => {
      const files = this.app.vault.getFiles();
      new FilePickerModal(this.app, files, "Type part of the report's file name", (file) => void this.setReports((list) => (list.includes(file.path) ? list : [...list, file.path]))).open();
    }));
  }

  private async setReports(change: (list: string[]) => string[]): Promise<void> {
    try {
      const r = await this.host.updatePersonalNotes((d) => { d.importReportPaths = change([...d.importReportPaths]); });
      this.reportMessage = r.saved ? "" : "The report selection was not saved.";
    } catch (error: any) {
      this.reportMessage = `The report selection was not saved: ${String(error?.message || error)}`;
    }
    this.render();
  }

  private openFile(path: string): void {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) { this.close(); void this.app.workspace.getLeaf("tab").openFile(file); }
    else new Notice("Kosmos-Oden: that file is no longer in the vault.");
  }

  private renderPending(el: HTMLElement): void {
    let pending: string[] = [];
    try { pending = this.host.pendingImportFolders(); } catch { pending = []; }
    if (!pending.length) return;
    el.createEl("h3", { text: "Imports not marked finished" });
    el.createEl("p", { cls: "setting-item-description", text: "Automatic tags stay off in these folders until you say the import is finished, so nothing is stamped while the Importer is still writing." });
    for (const folder of pending) {
      new Setting(el).setName(folder).addButton((b) => b.setButtonText("Import finished — review tags").setCta().onClick(async () => {
        try {
          await this.host.importFinished(folder);
          new Notice(`Kosmos-Oden: ${folder} is marked finished. Nothing was tagged; review optional tags if you want them.`);
        } catch (error: any) {
          new Notice(`Kosmos-Oden: could not mark ${folder} finished: ${String(error?.message || error)}`);
        }
        this.render();
      }));
    }
  }

  private renderSearchState(el: HTMLElement): void {
    let line = "";
    try {
      const s = this.host.searchStatus();
      line = s.state === "indexing" ? `Search is reading your notes (${s.notes} so far). New imports appear as they are read.`
        : s.state === "failed" ? "Search stopped working. Open Search my notes and press Retry."
        : s.omitted > 0 ? `Search covers ${s.notes} notes. ${s.omitted} files were skipped (too large or unreadable); they still open in Obsidian.`
        : `Search covers ${s.notes} notes.`;
    } catch { return; }
    el.createEl("p", { cls: "setting-item-description", text: line });
  }
}
