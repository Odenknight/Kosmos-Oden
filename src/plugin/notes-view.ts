import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import { NotesWorkspaceHost } from "../workspace/host";
import { mountNotesWorkspace } from "../workspace/view";
import type { KosmosAgentServer } from "./agent-server";

export const NOTES_VIEW_TYPE = "kosmos-oden-notes";

export class KosmosNotesView extends ItemView {
  private workspace: ReturnType<typeof mountNotesWorkspace> | undefined;
  constructor(leaf: WorkspaceLeaf, private readonly api: KosmosAgentServer, private readonly openKosmos: () => void) { super(leaf); }
  getViewType(): string { return NOTES_VIEW_TYPE; }
  getDisplayText(): string { return "Kosmos-Oden Notes"; }
  getIcon(): string { return "notebook-pen"; }
  async onOpen(): Promise<void> {
    this.workspace = mountNotesWorkspace(this.contentEl, new NotesWorkspaceHost(this.api), {
      openSource: path => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) void this.app.workspace.getLeaf("tab").openFile(file);
      },
      openKosmos: this.openKosmos,
    });
    this.registerEvent(this.app.vault.on("modify", () => this.refresh()));
    this.registerEvent(this.app.vault.on("create", () => this.refresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.refresh()));
    this.registerEvent(this.app.vault.on("rename", () => this.refresh()));
  }
  refresh(): void { this.workspace?.refresh(); }
  async onClose(): Promise<void> { this.workspace?.close(); this.workspace = undefined; }
}
