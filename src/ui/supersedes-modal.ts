/**
 * Personal Notes (0.9.0) — optional GKX lineage: "This note replaces another note".
 *
 * Writes exactly one property, `supersedes`, on the note the user has open,
 * and only when the user presses the button. The older note is not changed:
 * gkos-engine derives the reverse direction.
 *
 * Obsidian imports are limited to names the test stubs export
 * (see test/source-events.test.mjs): Modal, Notice, Setting, TFile.
 */
import { Modal, Notice, Setting, TFile } from "obsidian";
import type { PersonalNotesHost } from "../personal-notes/host";
import { mergeSupersedes } from "../personal-notes/lineage";

export class SupersedesModal extends Modal {
  private target = "";

  constructor(private host: PersonalNotesHost, private file: TFile) { super(host.app); }

  onOpen(): void {
    const el = this.contentEl;
    el.empty();
    el.addClass("kosmos-personal-modal");
    el.createEl("h2", { text: "This note replaces another note" });
    el.createEl("p", { text: `Newer note: ${this.file.path}`, cls: "setting-item-description" });
    el.createEl("p", { text: "Kosmos-Oden adds a supersedes property to the newer note that links to the older note. Nothing else changes, and the older note is not touched. This is optional GKX lineage.", cls: "setting-item-description" });
    new Setting(el).setName("Older note").setDesc("Type the name or path of the note this one replaces.")
      .addText((t) => t.setPlaceholder("Note name").onChange((value) => { this.target = value; }));
    new Setting(el)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText("Add supersedes").setCta().onClick(() => void this.apply()));
  }

  onClose(): void { this.contentEl.empty(); }

  private async apply(): Promise<void> {
    const name = this.target.trim().replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
    if (!name) { new Notice("Kosmos-Oden: type the name of the older note."); return; }
    const older = this.app.metadataCache.getFirstLinkpathDest(name, this.file.path);
    if (!(older instanceof TFile)) { new Notice(`Kosmos-Oden: no note named “${name}” was found.`); return; }
    if (older.path === this.file.path) { new Notice("Kosmos-Oden: a note cannot replace itself."); return; }
    const linkText = this.app.metadataCache.fileToLinktext(older, this.file.path);
    try {
      await this.app.fileManager.processFrontMatter(this.file, (fm: Record<string, unknown>) => {
        fm.supersedes = mergeSupersedes(fm.supersedes, linkText);
      });
      new Notice(`Kosmos-Oden: recorded that this note replaces “${older.basename}”.`);
      this.close();
    } catch (error: any) {
      new Notice(`Kosmos-Oden: could not update the note: ${String(error?.message || error)}`);
    }
  }
}
