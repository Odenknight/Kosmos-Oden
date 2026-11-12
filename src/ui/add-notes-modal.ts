/**
 * Personal Notes (0.9.0) — "Add notes": Where are your notes?
 *
 * Guides the user into the Obsidian Importer community plugin and then shows
 * a plain status of what arrived. Kosmos-Oden converts nothing itself and
 * never writes to a note from this window.
 *
 * Obsidian imports are limited to names the test stubs export
 * (see test/source-events.test.mjs): Modal, Notice, Setting.
 */
import { Modal, Notice, Setting } from "obsidian";
import type { PersonalNotesHost } from "../personal-notes/host";
import { normalizeFolder } from "../personal-notes/scope";
import {
  DEFAULT_IMPORT_FOLDER,
  GKX_TAGGING_AFTER,
  GKX_TAGGING_CONVERT_DESC,
  GKX_TAGGING_INTRO,
  GKX_TAGGING_LINEAGE_DESC,
  GKX_TAGGING_STAMP_DESC,
  IMPORTER_COMMAND_ID,
  IMPORTER_INSTALL_URI,
  IMPORTER_PLUGIN_ID,
  IMPORTER_TESTED_VERSION,
  PERSONAL_NOTES_MODE_NOTICE,
  PERSONAL_NOTES_PROMISES,
  REIMPORT_ADVICE,
  SOURCE_GUIDES,
  type SourceGuide,
} from "../personal-notes/guides";

type Step = "choose" | "guide" | "status";

export class AddNotesModal extends Modal {
  private step: Step = "choose";
  private guide: SourceGuide | null = null;

  constructor(private host: PersonalNotesHost) { super(host.app); }

  onOpen(): void { this.render(); }
  onClose(): void { this.contentEl.empty(); }

  private importFolder(): string {
    return this.host.agentSettings.personalNotesImportFolders[0] || DEFAULT_IMPORT_FOLDER;
  }

  /** Importer presence through Obsidian internals. Any failure reads as "unknown". */
  private importerState(): "enabled" | "installed" | "missing" | "unknown" {
    try {
      const plugins: any = (this.app as any).plugins;
      if (!plugins) return "unknown";
      if (plugins.enabledPlugins?.has?.(IMPORTER_PLUGIN_ID)) return "enabled";
      if (plugins.manifests && Object.prototype.hasOwnProperty.call(plugins.manifests, IMPORTER_PLUGIN_ID)) return "installed";
      return "missing";
    } catch (_) { return "unknown"; }
  }

  /** Try to open the Importer. Returns false when Obsidian would not run the command. */
  private openImporter(): boolean {
    try {
      const commands: any = (this.app as any).commands;
      return commands?.executeCommandById?.(IMPORTER_COMMAND_ID) === true;
    } catch (_) { return false; }
  }

  private render(): void {
    const el = this.contentEl;
    el.empty();
    el.addClass("kosmos-personal-modal");
    if (this.step === "choose") this.renderChoose(el);
    else if (this.step === "guide") this.renderGuide(el);
    else void this.renderStatus(el);
  }

  private renderChoose(el: HTMLElement): void {
    el.createEl("h2", { text: "Where are your notes?" });
    for (const line of PERSONAL_NOTES_PROMISES) el.createEl("p", { text: line, cls: "setting-item-description" });
    if (!this.host.agentSettings.personalNotesEnabled) el.createEl("p", { text: PERSONAL_NOTES_MODE_NOTICE, cls: "setting-item-description" });
    for (const guide of SOURCE_GUIDES) {
      new Setting(el).setName(guide.title).setDesc(guide.summary)
        .addButton((b) => b.setButtonText("Choose").setCta().onClick(() => void this.choose(guide)));
    }
    new Setting(el).setName("Already imported?").setDesc("See what arrived and what needs attention.")
      .addButton((b) => b.setButtonText("Show status").onClick(() => { this.step = "status"; this.render(); }));
  }

  private async choose(guide: SourceGuide): Promise<void> {
    this.guide = guide;
    // Personal Notes mode must be on BEFORE an import starts, so imported notes
    // are never timestamp-stamped by Kosmos-Oden.
    if (!this.host.agentSettings.personalNotesEnabled) {
      await this.host.setPersonalNotesMode(true);
      new Notice("Kosmos-Oden: Personal Notes is now on for this vault.");
    }
    this.step = guide.usesImporter ? "guide" : "status";
    this.render();
  }

  private renderGuide(el: HTMLElement): void {
    const guide = this.guide!;
    el.createEl("h2", { text: guide.title });

    new Setting(el).setName("Folder for imported notes")
      .setDesc("Use the same name in the Importer's Output folder box. Kosmos-Oden never changes notes in this folder.")
      .addText((t) => t.setPlaceholder(DEFAULT_IMPORT_FOLDER).setValue(this.importFolder()).onChange(async (value) => {
        const folder = normalizeFolder(value);
        if (!folder || folder === "/") return; // keep the last good value
        const rest = this.host.agentSettings.personalNotesImportFolders.filter((f) => f.toLowerCase() !== folder.toLowerCase());
        this.host.agentSettings.personalNotesImportFolders = [folder, ...rest.slice(0, 19)];
        await this.host.saveAgentSettings();
      }));

    const steps = el.createEl("ol", { cls: "kosmos-personal-steps" });
    for (const step of guide.steps) steps.createEl("li", { text: step.replace("{folder}", this.importFolder()) });
    if (guide.notes.length) {
      el.createEl("h3", { text: "Good to know" });
      const notes = el.createEl("ul");
      for (const note of guide.notes) notes.createEl("li", { text: note });
    }
    el.createEl("h3", { text: "Importing again later" });
    for (const line of REIMPORT_ADVICE) el.createEl("p", { text: line, cls: "setting-item-description" });

    const state = this.importerState();
    const stateText = state === "enabled" ? "The Importer plugin is installed and turned on."
      : state === "installed" ? "The Importer plugin is installed but turned off. Turn it on in Settings, Community plugins."
      : state === "missing" ? "The Importer plugin is not installed yet."
      : "Could not check whether the Importer plugin is installed.";
    const importer = new Setting(el).setName("Importer").setDesc(`${stateText} These steps were written for Importer ${IMPORTER_TESTED_VERSION}.`);
    if (state !== "enabled") {
      importer.addButton((b) => b.setButtonText("Get the Importer").onClick(() => { window.open(IMPORTER_INSTALL_URI); }));
    }
    importer.addButton((b) => b.setButtonText("Open the Importer").setCta().onClick(() => {
      if (this.openImporter()) { this.close(); return; }
      new Notice("Kosmos-Oden: could not open the Importer. Open the command palette and run “Importer: Import notes”.", 10000);
    }));

    new Setting(el)
      .addButton((b) => b.setButtonText("Back").onClick(() => { this.step = "choose"; this.render(); }))
      .addButton((b) => b.setButtonText("I have finished importing").onClick(() => { this.step = "status"; this.render(); }));
  }

  private async renderStatus(el: HTMLElement): Promise<void> {
    el.createEl("h2", { text: "Your notes" });
    const body = el.createEl("div");
    body.createEl("p", { text: "Reading your notes…" });
    try {
      const status = await this.host.personalNotesStatus();
      body.empty();
      const folders = status.importFolders.length ? status.importFolders.join(", ") : "(none)";
      body.createEl("p", { text: `Import folder: ${folders}`, cls: "setting-item-description" });
      const list = body.createEl("ul", { cls: "kosmos-personal-status" });
      list.createEl("li", { text: `Files present: ${status.notesPresent} ${status.notesPresent === 1 ? "note" : "notes"}, ${status.otherFilesPresent} other ${status.otherFilesPresent === 1 ? "file" : "files"}` });
      list.createEl("li", { text: `Searchable: ${status.searchable}` });
      list.createEl("li", { text: `Needs attention: ${status.needsAttentionTotal}` });
      if (status.needsAttentionTotal > 0) {
        body.createEl("p", { text: "These notes hold only pictures, drawings or attachments. You can open and look at them. They are not searchable yet.", cls: "setting-item-description" });
        const attention = body.createEl("ul");
        for (const path of status.needsAttention) attention.createEl("li", { text: path });
        if (status.needsAttentionTotal > status.needsAttention.length) attention.createEl("li", { text: `…and ${status.needsAttentionTotal - status.needsAttention.length} more` });
      }
      if (status.reports.length) {
        body.createEl("p", { text: "Importer reports you selected (skipped or failed items are listed there):", cls: "setting-item-description" });
        const logs = body.createEl("ul");
        for (const report of status.reports) logs.createEl("li", { text: report.present ? report.path : `${report.path} (not found)` });
      }
      if (status.notesPresent === 0 &&this.guide?.usesImporter !== false) {
        body.createEl("p", { text: "No notes found in the import folder yet. If you imported into a different folder, go back and change the folder name.", cls: "setting-item-description" });
      }
    } catch (_) {
      body.empty();
      body.createEl("p", { text: "Could not read your notes just now. Close this window and try again." });
    }
    this.renderGkxTagging(el);
    new Setting(el)
      .addButton((b) => b.setButtonText("Back").onClick(() => { this.step = "choose"; this.render(); }))
      .addButton((b) => b.setButtonText("Search my notes").setCta().onClick(() => { this.close(); void this.host.openPersonalSearch(); }))
      .addButton((b) => b.setButtonText("Connect my AI").onClick(() => { this.close(); this.host.openConnectAi(); }));
  }
  /** Optional GKX tagging. Nothing here runs unless the user presses a control. */
  private renderGkxTagging(el: HTMLElement): void {
    el.createEl("h3", { text: "Optional: GKX tags" });
    for (const line of GKX_TAGGING_INTRO) el.createEl("p", { text: line, cls: "setting-item-description" });
    new Setting(el).setName("Time stamps on imported notes").setDesc(GKX_TAGGING_STAMP_DESC)
      .addToggle((t) => t.setValue(this.host.agentSettings.personalNotesStampImports).onChange(async (value) => {
        this.host.agentSettings.personalNotesStampImports = value;
        await this.host.saveAgentSettings();
      }));
    new Setting(el).setName("Unique IDs and time stamps").setDesc(GKX_TAGGING_CONVERT_DESC)
      .addButton((b) => b.setButtonText("Preview GKX tags").onClick(() => { this.close(); void this.host.runGkxTagging(); }));
    new Setting(el).setName("This note replaces another note").setDesc(GKX_TAGGING_LINEAGE_DESC)
      .addButton((b) => b.setButtonText("Record a replacement").onClick(() => { this.close(); this.host.openSupersedes(); }));
    el.createEl("p", { text: GKX_TAGGING_AFTER, cls: "setting-item-description" });
  }
}
