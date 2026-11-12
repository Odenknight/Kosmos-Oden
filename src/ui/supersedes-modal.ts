/**
 * Personal Notes (0.9.0) — "This note supersedes…".
 *
 * Pick the older note, see the check and the exact property change, then
 * write it on the replacement note only, through the hash-checked tagging
 * writer (host.applyTagging). The older note is never edited; the reverse
 * direction is derived for display.
 */
import { Modal, Notice, Setting, TFile } from "obsidian";
import type { PersonalPluginHost, SupersedesCheck } from "../personal-notes/plugin-host";
import type { TaggingPlan } from "../personal-notes/tagging";
import { FilePickerModal } from "./note-picker";
import { renderApplyResult, renderPlan } from "./tagging-modal";

/** Plain wording for a failed supersedes check. */
export function supersedesProblem(check: SupersedesCheck): string {
  if (!("reason" in check)) return "";
  switch (check.reason) {
    case "self": return "A note cannot supersede itself. Choose the older note.";
    case "cycle": return "The chosen note already supersedes this note (directly or through other notes). Recording this would make a loop.";
    case "ambiguous": return "More than one note matches that name. Choose the note again; its full path will be used.";
    case "unresolved": return "No matching note was found.";
    case "unknown_replacement": return "This note is not available for tagging. Check that it is inside the folders chosen for optional tags.";
    case "empty": return "Choose the older note first.";
    default: return check.detail;
  }
}

export class SupersedesModal extends Modal {
  private target: TFile | null = null;
  private check: SupersedesCheck | null = null;
  private plan: TaggingPlan | null = null;
  private message = "";
  private busy = false;

  constructor(private host: PersonalPluginHost, private file: TFile) { super(host.app); }

  onOpen(): void { this.render(); }
  onClose(): void { this.plan = null; this.contentEl.empty(); }

  private render(): void {
    const el = this.contentEl;
    el.empty();
    el.addClass("kosmos-personal-modal");
    el.createEl("h2", { text: "This note supersedes…" });
    el.createEl("p", { cls: "setting-item-description", text: `Newer note: ${this.file.path}` });
    el.createEl("p", { cls: "setting-item-description", text: "Adds the older note to this note's supersedes property. Only this note changes; the older note is not edited. Nothing is inferred: you choose the note." });

    new Setting(el).setName("Older note").setDesc(this.target ? this.target.path : "Not chosen yet.")
      .addButton((b) => {
        b.setButtonText(this.target ? "Choose another note" : "Choose note").onClick(() => this.pick());
        if (!this.target) b.setCta();
      });

    if (this.check && !this.check.ok) el.createEl("p", { cls: "kosmos-personal-warning", text: supersedesProblem(this.check) }).setAttribute("role", "status");
    if (this.message) el.createEl("p", { cls: "kosmos-personal-warning", text: this.message }).setAttribute("role", "status");

    const plan = this.plan;
    const writable = !!plan && plan.notes.some((n) => n.proposedRaw != null && n.changes.length);
    if (plan) {
      if (this.check && "alreadyDeclared" in this.check && this.check.alreadyDeclared) el.createEl("p", { cls: "kosmos-personal-result", text: "This note already records that it supersedes the chosen note." });
      const box = el.createDiv({ cls: "kosmos-tagging-preview" });
      renderPlan(box, plan, false);
      if (plan.findings.some((f) => f.kind === "supersedes_rejected" && f.reason === "disabled")) {
        new Setting(el).setName("Turn on “Supersedes” links").setDesc("This option is off in Optional tags.")
          .addButton((b) => b.setButtonText("Optional tags").onClick(() => { this.close(); this.host.openTagging(); }));
      }
    }
    new Setting(el)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText("Add supersedes").setCta().setDisabled(!writable || this.busy).onClick(() => void this.apply()));
  }

  private pick(): void {
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path !== this.file.path);
    new FilePickerModal(this.app, files, "Type the name of the older note", (file) => void this.choose(file)).open();
  }

  private async choose(file: TFile): Promise<void> {
    this.target = file;
    this.check = null;
    this.plan = null;
    this.message = "Checking…";
    this.render();
    const linkText = this.app.metadataCache.fileToLinktext(file, this.file.path, true);
    try {
      const r = await this.host.previewSupersedes(this.file, linkText);
      if (this.target !== file) return;
      this.check = r.check;
      this.plan = r.check.ok ? r.plan : null;
      this.message = r.check.ok && !r.plan ? "The change could not be prepared." : "";
    } catch (error: any) {
      this.message = `The check could not run: ${String(error?.message || error)}`;
    }
    this.render();
  }

  private async apply(): Promise<void> {
    if (!this.plan) return;
    this.busy = true;
    this.render();
    try {
      const result = await this.host.applyTagging(this.plan);
      this.plan = null;
      this.busy = false;
      if (result.written.length) {
        new Notice(`Kosmos-Oden: recorded that ${this.file.basename} supersedes ${this.target?.basename ?? "the chosen note"}.`);
        this.close();
        return;
      }
      this.render();
      renderApplyResult(this.contentEl.createDiv({ cls: "kosmos-tagging-result" }), result);
    } catch (error: any) {
      this.busy = false;
      this.message = `Nothing was written: ${String(error?.message || error)}`;
      this.render();
    }
  }
}
