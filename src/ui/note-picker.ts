/** A keyboard-friendly file picker (Obsidian's fuzzy suggester) over vault files. */
import { FuzzySuggestModal, type App, type TFile } from "obsidian";

export class FilePickerModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, private files: TFile[], placeholder: string, private chosen: (file: TFile) => void) {
    super(app);
    this.setPlaceholder(placeholder);
  }
  getItems(): TFile[] { return this.files; }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.chosen(file); }
}
