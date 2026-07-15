/**
 * Kosmos plugin — Obsidian entry (§22).
 *
 * The 3D view renders inside an isolated iframe whose page (Three.js + Kosmos
 * Core + renderer) is generated at build time from the SAME modular source as
 * the standalone viewer, then embedded here as base64 — local and
 * self-contained, no CDN, works on desktop and mobile.
 *
 * The plugin streams the vault into the iframe: one full snapshot on open,
 * then debounced deltas; the iframe's shared KosmosIndex re-parses only what
 * changed (§10). The Agent API answers from the same core index (§33).
 */
import { ItemView, Notice, Plugin, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import EMBED_HTML_B64 from "../../dist/kosmos-embed.html";
import { KOSMOS_VERSION } from "../core/version";
import type { OkfMigrationMode } from "../core/okf-migration";
import { DEFAULT_AGENT_SETTINGS, KosmosAgentServer, makeToken, migrateAgentSettings, type AgentSettings } from "./agent-server";
import { KosmosSettingTab, buildAgentGuide, installedBridgePath } from "./settings";
import { openOkfMigrationWorkflow } from "./okf-migration";
import { validateRendererMessage, wrap } from "./protocol";
import { VaultDataProvider, attachmentListFrom, folderListFrom, nodeRequire } from "./vault-provider";

const VIEW_TYPE = "vault-kosmos-view";

/** Decode the self-contained constellation page (Three.js + core + renderer). */
function kosmosHtml(): string {
  const bin = atob(EMBED_HTML_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

/** Fast non-cryptographic content hash (FNV-1a, 32-bit) for change detection. */
function hashContent(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

class KosmosView extends ItemView {
  private frame: HTMLIFrameElement | null = null;
  private ready = false;                       // iframe loaded + initial snapshot sent
  private hashes = new Map<string, string>();  // path -> last-sent content hash
  private dirty = new Set<string>();           // changed/created paths awaiting a flush
  private removed = new Set<string>();
  private renames: { from: string; to: string }[] = [];
  private structural = false;                  // create/delete/rename happened
  private fileCount = 0;
  private trailing = 0;
  private maxwaitId = 0;
  private deferred = false;                    // a flush was skipped because the view was hidden

  constructor(leaf: WorkspaceLeaf) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return "Vault Kosmos"; }
  getIcon(): string { return "orbit"; }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("vault-kosmos-root");
    const frame = document.createElement("iframe");
    frame.setAttribute("title", "Vault Kosmos");
    // Defense-in-depth: the renderer is treated as a distinct, opaque-origin
    // context. It needs scripts (WebGL/Three.js), pointer lock (fly mode) and
    // downloads (exports); it does NOT get allow-same-origin, so it cannot reach
    // this window's storage/DOM. Note opening is mediated purely via postMessage.
    // See docs/RENDERER-PROTOCOL.md for the bounded sandbox compatibility result.
    frame.setAttribute("sandbox", "allow-scripts allow-pointer-lock allow-downloads");
    frame.addEventListener("load", () => { void this.sendFull(); });
    frame.srcdoc = kosmosHtml();
    root.appendChild(frame);
    this.frame = frame;
    // open-note / open-folder requests coming back from the 3D view (right-click)
    this.registerDomEvent(window, "message", (ev: MessageEvent) => this.onMessage(ev));
  }

  private onMessage(ev: MessageEvent): void {
    if (!this.frame || ev.source !== this.frame.contentWindow) return;     // only our own iframe
    const data: any = ev.data;
    // Preferred path: versioned, structurally validated envelope.
    const v = validateRendererMessage(data);
    let type: "open-note" | "open-folder" | null = null;
    let path: string | undefined;
    if (v.ok && v.message) {
      type = v.message.type;
      path = (v.message.payload as any).path;
    } else if (data && data.type === "kosmos:open" && typeof data.path === "string") {
      type = "open-note"; path = data.path;               // legacy flat shape (older renderer builds)
    } else if (data && data.type === "kosmos:folder" && typeof data.path === "string") {
      type = "open-folder"; path = data.path;
    } else {
      return;
    }
    if (!path) return;
    const file = this.app.vault.getAbstractFileByPath(path);
    // Folder galaxies must never open or create a note — expand in the file explorer instead.
    if (type === "open-folder" || file instanceof TFolder) {
      if (file instanceof TFolder) this.revealFolder(file);
      return;
    }
    if (file instanceof TFile) {
      void this.app.workspace.getLeaf("tab").openFile(file);               // open the note in a NEW tab
    } else {
      void this.app.workspace.openLinkText(path, "", "tab");               // fall back to link resolution
    }
  }

  /** Reveal + expand a folder in Obsidian's file explorer; silently do nothing if that is unavailable. */
  private revealFolder(folder: TFolder): void {
    try {
      const internal: any = (this.app as any).internalPlugins;
      const fe = internal?.getEnabledPluginById?.("file-explorer") ?? internal?.getPluginById?.("file-explorer")?.instance;
      if (fe && typeof fe.revealInFolder === "function") { fe.revealInFolder(folder); return; }
    } catch (e) { /* file-explorer internals vary by Obsidian version; fail silently */ }
    try {
      const leaf = this.app.workspace.getLeavesOfType("file-explorer")[0];
      const view: any = leaf?.view;
      if (view && typeof view.revealInFolder === "function") view.revealInFolder(folder);
    } catch (e) { /* same */ }
  }

  private post(msg: any): void {
    if (this.frame && this.frame.contentWindow) this.frame.contentWindow.postMessage(msg, "*");
  }

  /** Live AI-agent traversal (Agent API): light up visited bodies with the emerald trail. */
  agentTraversal(paths: string[], tool: string, agent?: string): void { if (this.ready) this.post(wrap("agent-traversal", { paths, tool, agent })); }

  /** Tell the iframe whether its leaf is visible so it can halt/resume its render loop (CPU/GPU/battery). */
  syncVisibility(): void { this.post(wrap("visibility", { visible: this.isVisible() })); }

  /** Read the whole vault once and send a full snapshot (initial load / large structural change). */
  async sendFull(): Promise<void> {
    if (!this.frame || !this.frame.contentWindow) return;
    const md = this.app.vault.getMarkdownFiles();
    const files: { relativePath: string; content: string }[] = [];
    this.hashes.clear();
    for (const f of md) {
      const c = await this.app.vault.cachedRead(f);
      files.push({ relativePath: f.path, content: c });
      this.hashes.set(f.path, hashContent(c));
    }
    this.fileCount = md.length;
    this.post(wrap("vault-snapshot", { files, folders: folderListFrom(md), attachments: attachmentListFrom(this.app.vault.getFiles()), label: "Vault" }));
    this.ready = true;
    this.dirty.clear(); this.removed.clear(); this.renames = []; this.structural = false; this.deferred = false;
    this.syncVisibility();
  }

  // --- change notifications from the plugin's event handlers ---
  noteChanged(path: string): void { if (!this.ready) return; this.dirty.add(path); this.schedule(); }
  noteCreated(path: string): void { if (!this.ready) return; this.dirty.add(path); this.structural = true; this.fileCount++; this.schedule(); }
  noteDeleted(path: string): void { if (!this.ready) return; this.removed.add(path); this.dirty.delete(path); this.structural = true; this.fileCount = Math.max(0, this.fileCount - 1); this.schedule(); }
  noteRenamed(path: string, oldPath: string): void { if (!this.ready) return; this.renames.push({ from: oldPath, to: path }); this.dirty.add(path); this.structural = true; this.schedule(); }

  /** Debounce + max-wait, both scaled to vault size so large vaults coalesce more but still update. */
  private delays(): { trailing: number; maxWait: number } {
    const n = this.fileCount;
    const trailing = n > 8000 ? 2500 : n > 3000 ? 1600 : n > 800 ? 1000 : 550;
    return { trailing, maxWait: Math.min(trailing * 5, 12000) };
  }
  private schedule(): void {
    const { trailing, maxWait } = this.delays();
    window.clearTimeout(this.trailing);
    this.trailing = window.setTimeout(() => void this.flush(), trailing);
    if (!this.maxwaitId) this.maxwaitId = window.setTimeout(() => void this.flush(), maxWait);
  }

  private isVisible(): boolean {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
    const el = this.containerEl as HTMLElement;
    return !!el && !!el.offsetParent;          // background tabs have no offsetParent
  }
  /** Called when a view becomes active/visible again. */
  flushIfDeferred(): void { if (this.deferred) void this.flush(); }

  private async flush(): Promise<void> {
    window.clearTimeout(this.trailing); window.clearTimeout(this.maxwaitId);
    this.trailing = 0; this.maxwaitId = 0;
    if (!this.ready || !this.frame || !this.frame.contentWindow) return;
    if (!this.isVisible()) { this.deferred = true; return; }   // do no work while hidden (§27)
    this.deferred = false;

    const md = this.app.vault.getMarkdownFiles();
    this.fileCount = md.length;

    // A big structural change (bulk import/delete, sync) is cheaper to rebuild than to diff (§10.2).
    if (this.structural && (this.removed.size + this.dirty.size) > Math.max(500, md.length * 0.25)) {
      await this.sendFull();
      return;
    }

    const byPath = new Map<string, TFile>();
    for (const f of md) byPath.set(f.path, f);

    const changed: { relativePath: string; content: string }[] = [];
    for (const p of this.dirty) {
      const f = byPath.get(p);
      if (!f) continue;                          // deleted or non-markdown
      const c = await this.app.vault.cachedRead(f);
      const h = hashContent(c);
      if (this.hashes.get(p) !== h) { this.hashes.set(p, h); changed.push({ relativePath: p, content: c }); }
    }
    const removed = Array.from(this.removed);
    for (const p of removed) this.hashes.delete(p);
    const renames = this.renames.map((r) => ({ from: r.from, to: r.to }));
    for (const r of renames) { const h = this.hashes.get(r.from); if (h != null) { this.hashes.delete(r.from); this.hashes.set(r.to, h); } }

    const wasStructural = this.structural;
    this.dirty.clear(); this.removed.clear(); this.renames = []; this.structural = false;

    if (!changed.length && !removed.length && !renames.length) return;   // content hashes proved nothing real changed

    const folders = (wasStructural || renames.length) ? folderListFrom(md) : undefined;
    const attachments = attachmentListFrom(this.app.vault.getFiles());
    this.post(wrap("vault-delta", { changed, removed, renames, folders, attachments, label: "Vault" }));
  }

  async onClose(): Promise<void> {
    window.clearTimeout(this.trailing); window.clearTimeout(this.maxwaitId);
    if (this.frame) { try { this.frame.srcdoc = "about:blank"; } catch (e) { /* iframe already detached */ } this.frame = null; }
    this.ready = false;
    this.contentEl.empty();
  }
}

export default class VaultKosmosPlugin extends Plugin {
  agentSettings: AgentSettings = { ...DEFAULT_AGENT_SETTINGS };
  agentApi!: KosmosAgentServer;
  provider!: VaultDataProvider;

  private eventsLive = false;

  agentLanUrls(): string[] {
    return this.provider.lanAddresses().map((ip) => `http://${ip}:${this.agentSettings.agentPort}`);
  }

  startAgentApi(): void {
    this.agentApi.start((msg) => new Notice("Vault Kosmos Agent API: " + msg));
    if (this.agentApi.status.startsWith("unavailable")) {
      new Notice("Vault Kosmos: the Agent API needs desktop Obsidian.");
    }
  }

  async onload(): Promise<void> {
    this.agentSettings = migrateAgentSettings(await this.loadData());
    let settingsChanged = false;
    if (!this.agentSettings.agentToken) {
      try {
        this.agentSettings.agentToken = makeToken();
        settingsChanged = true;
      } catch (e: any) {
        // No secure RNG: leave the token empty. With agentRequireToken on, the
        // server rejects every request rather than accepting a weak token (§16).
        console.error("Vault Kosmos:", e);
        new Notice("Vault Kosmos: could not create a secure Agent API token; the API will refuse requests until one exists.");
      }
    }
    if (!this.agentSettings.agentGraphNamespace) {
      try {
        this.agentSettings.agentGraphNamespace = makeToken().slice(0, 16);
        settingsChanged = true;
      } catch (_) { /* token failure above already leaves the API fail-closed */ }
    }
    if (settingsChanged) await this.saveAgentSettings();
    this.provider = new VaultDataProvider(this.app);
    this.agentApi = new KosmosAgentServer(nodeRequire("http"), this.agentSettings, this.provider);
    this.addSettingTab(new KosmosSettingTab(this.app, this));
    if (this.agentSettings.agentEnabled) this.startAgentApi();
    this.addCommand({ id: "write-agent-api-guide", name: "Write Agent API guide (AGENT-API.md) to vault", callback: () => void this.writeAgentGuide() });

    this.registerView(VIEW_TYPE, (leaf) => new KosmosView(leaf));
    this.addRibbonIcon("orbit", "Open Vault Kosmos", () => void this.activate());
    this.addCommand({ id: "open-vault-kosmos", name: "Open Vault Kosmos", callback: () => void this.activate() });
    this.addCommand({
      id: "mark-notes-okf-plus",
      name: "Mark notes in OKF+ format (scan, back up, and preview)",
      callback: () => void this.markNotesInOkf(),
    });
    this.addCommand({
      id: "upgrade-all-notes-okf-plus-2-2",
      name: "Upgrade all recoverable notes to OKF+ 2.2 (preview first)",
      callback: () => void this.markNotesInOkf("upgrade-all"),
    });
    this.addCommand({ id: "export-graphiti-episodes", name: "Export Graphiti episodes (OKF+)", callback: () => void this.exportGraphitiEpisodes() });

    // Don't react to the startup metadata-resolve storm; the view's initial load already
    // captures the fully-resolved vault. Only go live once the workspace has settled.
    this.app.workspace.onLayoutReady(() => { this.eventsLive = true; this.provider.markFullDirty(); });

    const views = (): KosmosView[] =>
      this.app.workspace.getLeavesOfType(VIEW_TYPE)
        .map((l) => l.view)
        .filter((v): v is KosmosView => v instanceof KosmosView);

    // Agent API -> Kosmos views: broadcast each query's touched notes so the traversal renders live.
    this.agentApi.onTraversal = (paths, tool, agent) => { for (const v of views()) v.agentTraversal(paths, tool, agent); };

    this.registerEvent(this.app.metadataCache.on("changed", (file: any) => {
      this.provider.markChanged(file.path);
      if (!this.eventsLive) return;
      for (const v of views()) v.noteChanged(file.path);
    }));
    this.registerEvent(this.app.vault.on("create", (file: any) => {
      this.provider.markChanged(file.path);
      if (!this.eventsLive || file.extension !== "md") return;
      for (const v of views()) v.noteCreated(file.path);
    }));
    this.registerEvent(this.app.vault.on("delete", (file: any) => {
      this.provider.markRemoved(file.path);
      if (!this.eventsLive) return;
      for (const v of views()) v.noteDeleted(file.path);
    }));
    this.registerEvent(this.app.vault.on("rename", (file: any, oldPath: string) => {
      this.provider.markRenamed(oldPath, file.path);
      if (!this.eventsLive) return;
      for (const v of views()) v.noteRenamed(file.path, oldPath);
    }));

    // When leaf visibility changes: flush deferred data AND gate the iframe's render loop.
    const onShow = () => { for (const v of views()) { v.flushIfDeferred(); v.syncVisibility(); } };
    this.registerEvent(this.app.workspace.on("active-leaf-change", onShow));
    this.registerEvent(this.app.workspace.on("layout-change", onShow));
  }

  async activate(): Promise<void> {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = ws.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    ws.revealLeaf(leaf);
  }

  async saveAgentSettings(): Promise<void> { await this.saveData(this.agentSettings); }

  /** Audit the vault and open the explicit backup/approval gate. No LLM or
   * network route is involved; the core planner refuses ambiguous metadata. */
  async markNotesInOkf(mode: OkfMigrationMode = "safe-onboarding"): Promise<void> {
    await openOkfMigrationWorkflow(this.app, mode, () => this.provider.markFullDirty());
  }

  async writeAgentGuide(): Promise<void> {
    const md = buildAgentGuide(
      this.agentSettings.agentPort,
      this.agentSettings.agentToken || "<enable the API to generate a token>",
      this.agentSettings.agentBindMode,
      this.agentLanUrls(),
      installedBridgePath(this.app, this)
    );
    await this.app.vault.adapter.write("AGENT-API.md", md);
    new Notice("Vault Kosmos: wrote AGENT-API.md to your vault root (with your address + token filled in)");
  }

  onunload(): void { this.agentApi?.stop(); }

  /** Export readable source assertions as a non-authoritative Graphiti projection.
   * Stable episode UUIDs make re-ingestion idempotent; later supersession state
   * is not back-propagated into earlier episodes. */
  async exportGraphitiEpisodes(): Promise<void> {
    const episodes = await this.agentApi.qEpisodes();
    await this.app.vault.adapter.write("graphiti-episodes.json", JSON.stringify(episodes, null, 2));
    await this.app.vault.adapter.write("graphiti-ingest-sample.py", SAMPLE_INGEST_PY);
    new Notice(`Vault Kosmos: exported ${episodes.length} Graphiti episodes → graphiti-episodes.json (+ sample ingest script)`);
  }
}

/** Sample Graphiti ingestion script written next to the export. */
const SAMPLE_INGEST_PY = `#!/usr/bin/env python3
# Ingest an Obsidian vault (exported by Vault Kosmos v${KOSMOS_VERSION}, OKF+) into Graphiti.
# Graphiti: https://github.com/getzep/graphiti
#
#   pip install "graphiti-core>=0.28.2"   # needs Python 3.10+; >=0.28.2 includes upstream security hardening
#   export OPENAI_API_KEY=...          # or configure another LLM per the Graphiti docs
#   export NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=password
#   python graphiti-ingest-sample.py graphiti-episodes.json
import asyncio, json, os, sys
from datetime import datetime
from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType

async def main(path: str) -> None:
    episodes = json.load(open(path, encoding="utf-8"))
    g = Graphiti(os.environ.get("NEO4J_URI", "bolt://localhost:7687"),
                 os.environ.get("NEO4J_USER", "neo4j"),
                 os.environ.get("NEO4J_PASSWORD", "password"))
    await g.build_indices_and_constraints()
    try:
        for e in episodes:  # chronological order preserves OKF+ knowledge chains
            await g.add_episode(
                uuid=e["uuid"],
                name=e["name"],
                episode_body=e["episode_body"],
                source=EpisodeType.json,
                source_description=e["source_description"],
                reference_time=datetime.fromisoformat(e["reference_time"].replace("Z", "+00:00")),
                group_id=e.get("group_id"),
            )
            print("ingested:", e["name"])
    finally:
        await g.close()

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "graphiti-episodes.json"))
`;
