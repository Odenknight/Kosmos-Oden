import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import { NotesWorkspaceHost } from "../workspace/host";
import { validReadableGraph } from "../workspace/spatial";
import { validateRendererOpenMessage, wrap } from "./protocol";

export const READABLE_VIEW_TYPE = "kosmos-oden-readable-view";

/** Native owner of the readable projection; old Kosmos layouts keep their own view. */
export class KosmosReadableView extends ItemView {
  private frame?: HTMLIFrameElement;
  private loaded = false;
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private path?: string;
  private status?: HTMLElement;
  private snapshot?: Awaited<ReturnType<NotesWorkspaceHost["graph"]>>;
  private rendererState?: { generation: number; selectedId: string | null; error: "render" | "selection" | null };
  constructor(leaf: WorkspaceLeaf, private host: NotesWorkspaceHost, private html: () => string) { super(leaf); }
  getViewType() { return READABLE_VIEW_TYPE; }
  getDisplayText() { return "Kosmos-Oden readable notes"; }
  getIcon() { return "orbit"; }
  async onOpen() {
    this.contentEl.replaceChildren();
    this.contentEl.classList.add("kosmos-oden-root");
    this.contentEl.style.display = "flex"; this.contentEl.style.flexDirection = "column";
    this.status = document.createElement("p"); this.status.setAttribute("role", "status");
    const frame = document.createElement("iframe"); this.frame = frame;
    frame.style.flex = "1"; frame.style.minHeight = "0"; frame.style.height = "0";
    frame.title = "Kosmos-Oden readable notes";
    frame.setAttribute("sandbox", "allow-scripts allow-pointer-lock allow-downloads");
    frame.addEventListener("load", () => { if (this.frame === frame) { this.loaded = true; this.refresh(); } });
    frame.srcdoc = this.html(); this.contentEl.append(this.status, frame);
    this.registerEvent(this.app.vault.on("modify", () => this.refresh()));
    this.registerEvent(this.app.vault.on("create", () => this.refresh()));
    this.registerEvent(this.app.vault.on("delete", file => {
      if (this.path === file.path || this.path?.startsWith(file.path + "/")) this.path = undefined;
      this.refresh();
    }));
    this.registerEvent(this.app.vault.on("rename", (file, old) => {
      if (this.path === old || this.path?.startsWith(old + "/")) this.path = file.path + this.path.slice(old.length);
      this.refresh();
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.syncVisibility()));
    this.registerDomEvent(window, "message", event => {
      if (event.source !== this.frame?.contentWindow || !this.snapshot) return;
      const message = validateRendererOpenMessage(event.data);
      if (message.ok && message.message?.type === "readable-state") {
        const state = message.message.payload;
        if (state.generation !== this.generation || (state.selectedId && !this.snapshot.value.nodes.some((node: any) => node.id === state.selectedId))) return;
        this.rendererState = state;
        const unavailable = this.path && !this.snapshot.value.nodes.some((node: any) => node.path === this.path);
        this.status!.textContent = unavailable ? "Selected note is unavailable in the current scope." : state.error ? "Renderer could not display the requested note." : state.selectedId ? "Selected note displayed · current policy" : "Readable graph displayed · current policy";
        return;
      }
      if (!message.ok || message.message?.type !== "open-note") return;
      const path = message.message.payload.path, snapshot = this.snapshot, generation = this.generation;
      if (!snapshot.value.nodes.some((node: any) => node.path === path)) return;
      void snapshot.publish(() => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) void this.app.workspace.getLeaf("tab").openFile(file);
      }, () => generation === this.generation && !!this.frame).catch(() => this.refresh());
    });
  }
  private post(message: unknown) { this.frame?.contentWindow?.postMessage(message, "*"); }
  syncVisibility() { this.post(wrap("visibility", { visible: !!this.containerEl.offsetParent })); }
  locate(path: string) { this.path = path; this.refresh(); }
  refresh() {
    const generation = ++this.generation;
    this.snapshot = undefined;
    this.rendererState = undefined;
    if (this.timer) clearTimeout(this.timer);
    if (!this.loaded || !this.frame) return;
    this.status!.textContent = "Refreshing readable notes…";
    this.post(wrap("readable-graph", { generation, graph: { builtAt: "", nodes: [], links: [] } }));
    this.timer = setTimeout(() => { this.timer = undefined; void this.publish(generation); }, 180);
  }
  private async publish(invalidated: number) {
    try {
      const snapshot = await this.host.graph();
      if (!validReadableGraph(snapshot.value)) throw new Error("projection budget or shape");
      const current = () => invalidated === this.generation && !!this.frame && this.loaded;
      const published = await snapshot.publish(value => {
        this.snapshot = snapshot;
        const generation = ++this.generation;
        this.post(wrap("readable-graph", { generation, graph: value }));
        const selected = value.nodes.find((node: any) => node.path === this.path);
        if (selected) this.post(wrap("select-readable-note", { generation, id: selected.id }));
        this.status!.textContent = this.path && !selected ? "Selected note is unavailable in the current scope." : "Readable notes · current policy";
        this.syncVisibility();
      }, current);
      if (!published && current()) this.status!.textContent = "Scope changed. Reopen from Notes to retry.";
    } catch {
      if (invalidated === this.generation && this.frame) this.status!.textContent = "Readable graph unavailable. Reopen from Notes to retry.";
    }
  }
  async onClose() {
    this.generation++; this.loaded = false; this.snapshot = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.frame = undefined; this.contentEl.replaceChildren();
  }
}
