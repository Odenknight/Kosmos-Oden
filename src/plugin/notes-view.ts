import { ItemView, TFile, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import { NotesWorkspaceHost } from "../workspace/host";
import { mountNotesWorkspace } from "../workspace/view";
import type { KosmosAgentServer } from "./agent-server";

export const NOTES_VIEW_TYPE = "kosmos-oden-notes";

export class KosmosNotesView extends ItemView {
  private workspace: ReturnType<typeof mountNotesWorkspace> | undefined;
  private savedState: unknown;
  constructor(leaf: WorkspaceLeaf, private readonly api: KosmosAgentServer, private readonly openKosmos: (path?: string) => void) { super(leaf); }
  getViewType(): string { return NOTES_VIEW_TYPE; }
  getDisplayText(): string { return "Kosmos-Oden Notes"; }
  getIcon(): string { return "notebook-pen"; }
  getState(): Record<string, unknown> { return this.workspace?.getState() ?? {}; }
  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    this.savedState = state;
    this.workspace?.restore(state);
    await super.setState(state, result);
  }
  async onOpen(): Promise<void> {
    this.workspace = mountNotesWorkspace(this.contentEl, new NotesWorkspaceHost(this.api), {
      openSource: path => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) void this.app.workspace.getLeaf("tab").openFile(file);
      },
      openKosmos: this.openKosmos,
      stateChanged: () => this.app.workspace.requestSaveLayout(),
    });
    this.workspace.restore(this.savedState);
    this.registerEvent(this.app.vault.on("modify", () => this.refresh()));
    this.registerEvent(this.app.vault.on("create", () => this.refresh()));
    this.registerEvent(this.app.vault.on("delete", file => this.workspace?.remove(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.workspace?.rename(oldPath, file.path)));
  }
  select(path: string) { return this.workspace?.select(path); }
  refresh(): void { this.workspace?.refresh(); }
  async onClose(): Promise<void> {
    this.savedState = this.workspace?.getState() ?? this.savedState;
    this.workspace?.close(); this.workspace = undefined;
  }
}
