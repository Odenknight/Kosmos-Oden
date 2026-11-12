/**
 * Kosmos plugin — Obsidian entry (§22).
 *
 * The 3D view renders inside an isolated iframe whose page (Three.js + Kosmos
 * Core + renderer) is generated at build time from the SAME modular source as
 * the standalone viewer, then embedded here as base64 — local and
 * self-contained, no CDN, works on desktop and mobile.
 *
 * The plugin streams the vault into the iframe: one full snapshot on open,
 * then debounced deltas; the iframe's shared GkxIndex re-parses only what
 * changed (§10). The Agent API answers from the same core index (§33).
 */
import { ItemView, Notice, Plugin, TFile, TFolder, WorkspaceLeaf, normalizePath, parseYaml } from "obsidian";
import EMBED_HTML_B64 from "../../dist/kosmos-embed.html";
import { KOSMOS_VERSION } from "../kosmos-version";
import { GRAPHITI_INGEST_SCRIPT, graphitiIngestionProfile } from "gkos-engine";
import type { GkxMigrationMode } from "gkos-engine";
import { DEFAULT_AGENT_SETTINGS, KosmosAgentServer, getProfileSettingsMigration, makeToken, migrateAgentSettings, type AgentSettings } from "./agent-server";
import { PersonalError, type ActiveProfile, type LineageInputNote, type PersonalNotesSettings, type SearchResponse } from "../personal-notes/types";
import type {
  ConnectionTestResult, ImporterState, PersonalConnectionStatus, PersonalPluginHost, PersonalSearchStatus, PersonalSettingsView, SupersedesCheck,
} from "../personal-notes/plugin-host";
import type { PersonalNotesHost } from "../personal-notes/host";
import { isUnderAnyFolder, normalizeFolder, parseFolderList, type RejectedFolder } from "../personal-notes/scope";
import { autoTimestampDecision, importReviewed, importStarted, planAutoTimestamp, planTagging, type TaggingImportState, type TaggingNoteInput, type TaggingPlan } from "../personal-notes/tagging";
import { applyTaggingPlan, type TaggingApplyResult, type TaggingWriterHost } from "../personal-notes/tagging-writer";
import { checkSupersedesProposal } from "../personal-notes/lineage";
import { sha256Hex } from "../personal-notes/hash";
import { PersonalDeviceState, PersonalRuntime, deviceNamespace } from "./personal-runtime";
import { ObsidianPersonalSource, strictYaml } from "./personal-source";
import { testPersonalConnection, waitForListener } from "./personal-connection";
import { personalSearchWorkerFactory } from "./personal-search-worker-url";
import { advertisedMcpProtocolVersions } from "./mcp-compat";
import { KosmosSettingTab, buildAgentGuide, installedBridgePath } from "./settings";
import { applyNoteTimestamps, formatTimestamp, makeGkxUuidV7, stripFrontmatter, timestampEligible } from "gkos-engine";
import { openGkxMigrationWorkflow } from "./gkx-migration";
import { openGkxEnrichmentWorkflow } from "./gkx-enrichment";
import { validateRendererMessage, wrap } from "./protocol";
import { VaultDataProvider, attachmentListFrom, folderListFrom, nodeRequire } from "./vault-provider";
import { isKosmosOperationalPath } from "../operational-paths";
import { readBatches } from "./read-batches";
import { deadline, ProviderError, readVaultText, VAULT_BUILD_TIMEOUT_MS } from "./vault-operations";
import { summarizePersonalNotes, type PersonalNotesStatus } from "../personal-notes/status";
import { PERSONAL_SEARCH_VIEW, PersonalSearchView } from "../ui/personal-search-view";
import { AddNotesModal } from "../ui/add-notes-modal";
import { ConnectAiModal } from "../ui/connect-ai-modal";
import { SupersedesModal } from "../ui/supersedes-modal";
import {
  DEFAULT_NEXTCLOUD_SETTINGS,
  NextcloudSyncEngine,
  NextcloudWebDavClient,
  emptyNextcloudState,
  migrateNextcloudSettings,
  migrateNextcloudState,
  syncScope,
  type NextcloudSettings,
  type NextcloudSyncState,
  type SyncSummary,
} from "./nextcloud-sync";

const VIEW_TYPE = "kosmos-oden-view";
/** The view type used by builds before the Kosmos-Oden rename. Still
 *  registered, and still consulted when locating an existing leaf, so a
 *  workspace saved by an earlier build restores its Kosmos pane instead of
 *  dropping it. New leaves are always created as VIEW_TYPE, so a restored
 *  legacy leaf migrates the next time the workspace is written.
 *
 *  DO NOT REBRAND THIS LITERAL. It names data written by shipped builds, not
 *  this product. scripts/check-artifacts.mjs asserts it survives into main.js. */
const LEGACY_VIEW_TYPE = "vault-kosmos-view";

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

export class KosmosView extends ItemView {
  private viewEpoch = 0;
  private revision = 0;
  private fullWork: Promise<void> | null = null;
  private flushing = false;
  private retryTimer = 0;

  private retryDeferred(): void {
    if (this.retryTimer || !this.frame) return;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = 0;
      if (this.frame && this.deferred && this.isVisible()) void this.flush();
    }, 1500);
  }
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

  /** `cachedText` may return a file's current text from the Personal corpus (null = read the vault as usual). */
  constructor(leaf: WorkspaceLeaf, private navigationEnabled: () => boolean, private cachedText: (file: TFile) => string | null = () => null) { super(leaf); }

  private readText(file: TFile): Promise<string> {
    const cached = this.cachedText(file);
    return cached !== null ? Promise.resolve(cached) : readVaultText(this.app.vault, file);
  }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return "Kosmos-Oden"; }
  getIcon(): string { return "orbit"; }

  async onOpen(): Promise<void> {
    this.viewEpoch++;
    const root = this.contentEl;
    root.empty();
    root.addClass("kosmos-oden-root");
    const frame = document.createElement("iframe");
    frame.setAttribute("title", "Kosmos-Oden");
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
  agentTraversal(paths: string[], tool: string, agent?: string, agentId?: string): void { if (this.ready) this.post(wrap("agent-traversal", { paths, tool, agent, agentId })); }

  /** Tell the iframe whether its leaf is visible so it can halt/resume its render loop (CPU/GPU/battery). */
  syncVisibility(): void { this.post(wrap("visibility", { visible: this.isVisible() })); }

  /** Live vault-connectivity signal from the host probe: green/red dot in the header VAULT pill. */
  setVaultStatus(connected: boolean): void { if (this.ready) this.post(wrap("vault-status", { connected })); }

  /** Read the whole vault once and send a full snapshot (initial load / large structural change). */
  async sendFull(): Promise<void> {
    if (this.fullWork) return this.fullWork;
    const epoch = this.viewEpoch;
    const attempt = { active: true, until: performance.now() + VAULT_BUILD_TIMEOUT_MS };
    const work = deadline(this.readFull(epoch, attempt), VAULT_BUILD_TIMEOUT_MS, () => { attempt.active = false; }).catch(() => {
      if (epoch === this.viewEpoch && this.frame) { this.deferred = true; this.post(wrap("vault-status", { connected: false })); this.retryDeferred(); }
    });
    this.fullWork = work;
    try { await work; } finally { attempt.active = false; if (this.fullWork === work) this.fullWork = null; }
  }

  private async readFull(epoch: number, attempt: { active: boolean; until: number }): Promise<void> {
    const revision = this.revision;
    const frame = this.frame;
    const hashes = new Map<string, string>();
    const check = () => { if (!attempt.active || performance.now() >= attempt.until) throw new ProviderError("timeout"); };
    if (!this.frame || !this.frame.contentWindow) return;
    const md = this.app.vault.getMarkdownFiles().filter((file) => !isKosmosOperationalPath(file.path));

    const files = await readBatches(md, async (f) => {
      check();
      if (epoch !== this.viewEpoch || frame !== this.frame) throw new ProviderError("provider_unavailable");
      const path = f.path;
      const c = await this.readText(f);
      hashes.set(path, hashContent(c));
      return { relativePath: path, content: c };
    });
    check();
    if (epoch !== this.viewEpoch || frame !== this.frame || revision !== this.revision) throw new ProviderError("provider_unavailable");
    this.hashes = hashes;
    this.fileCount = md.length;
    this.post(wrap("vault-snapshot", { files, folders: folderListFrom(md), attachments: attachmentListFrom(this.app.vault.getFiles()), label: "Vault", navigationEnabled: this.navigationEnabled() }));
    this.ready = true;
    this.dirty.clear(); this.removed.clear(); this.renames = []; this.structural = false; this.deferred = false;
    this.syncVisibility();
  }

  // --- change notifications from the plugin's event handlers ---
  noteChanged(path: string): void { if (isKosmosOperationalPath(path)) return; this.revision++; if (!this.ready) { this.deferred = true; this.schedule(); return; } this.dirty.add(path); this.schedule(); }
  noteCreated(path: string): void { if (isKosmosOperationalPath(path)) return; this.revision++; if (!this.ready) { this.deferred = true; this.schedule(); return; } this.dirty.add(path); this.structural = true; this.fileCount++; this.schedule(); }
  noteDeleted(path: string): void { if (isKosmosOperationalPath(path)) return; this.revision++; if (!this.ready) { this.deferred = true; this.schedule(); return; } this.removed.add(path); this.dirty.delete(path); this.structural = true; this.fileCount = Math.max(0, this.fileCount - 1); this.schedule(); }
  noteRenamed(path: string, oldPath: string): void {
    const oldOperational = isKosmosOperationalPath(oldPath);
    const newOperational = isKosmosOperationalPath(path);
    if (oldOperational && newOperational) return;
    this.revision++;
    if (!this.ready) { this.deferred = true; this.schedule(); return; }
    if (oldOperational) { this.noteCreated(path); return; }
    if (newOperational) { this.noteDeleted(oldPath); return; }
    this.renames.push({ from: oldPath, to: path }); this.dirty.add(path); this.structural = true; this.schedule();
  }

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
    if (this.flushing) return;
    this.flushing = true;
    const epoch = this.viewEpoch;
    const attempt = { active: true, until: performance.now() + VAULT_BUILD_TIMEOUT_MS };
    try { await deadline(this.flushPending(attempt), VAULT_BUILD_TIMEOUT_MS, () => { attempt.active = false; }); } catch (_) {
      if (epoch === this.viewEpoch && this.frame) { this.deferred = true; this.post(wrap("vault-status", { connected: false })); this.retryDeferred(); }
    } finally { attempt.active = false; if (epoch === this.viewEpoch) this.flushing = false; }
  }

  private async flushPending(attempt: { active: boolean; until: number }): Promise<void> {
    const epoch = this.viewEpoch, revision = this.revision;
    const frame = this.frame;
    const hashes = new Map(this.hashes);
    const check = () => { if (!attempt.active || performance.now() >= attempt.until) throw new ProviderError("timeout"); };
    window.clearTimeout(this.trailing); window.clearTimeout(this.maxwaitId);
    this.trailing = 0; this.maxwaitId = 0;
    if (!this.frame || !this.frame.contentWindow) return;
    if (!this.isVisible()) { this.deferred = true; return; }   // do no work while hidden (§27)
    this.deferred = false;
    if (!this.ready) { await this.sendFull(); return; }

    const md = this.app.vault.getMarkdownFiles().filter((file) => !isKosmosOperationalPath(file.path));
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
      check();
      const f = byPath.get(p);
      if (!f) continue;                          // deleted or non-markdown
      if (epoch !== this.viewEpoch || frame !== this.frame) throw new ProviderError("provider_unavailable");
      const c = await this.readText(f);
      const h = hashContent(c);
      if (hashes.get(p) !== h) { hashes.set(p, h); changed.push({ relativePath: p, content: c }); }
    }
    check();
    if (epoch !== this.viewEpoch || frame !== this.frame || revision !== this.revision) throw new ProviderError("provider_unavailable");
    this.hashes = hashes;
    const removed = Array.from(this.removed);
    for (const p of removed) this.hashes.delete(p);
    const renames = this.renames.map((r) => ({ from: r.from, to: r.to }));
    for (const r of renames) { const h = this.hashes.get(r.from); if (h != null) { this.hashes.delete(r.from); this.hashes.set(r.to, h); } }

    const wasStructural = this.structural;
    this.dirty.clear(); this.removed.clear(); this.renames = []; this.structural = false;

    if (!changed.length && !removed.length && !renames.length) return;   // content hashes proved nothing real changed

    const folders = (wasStructural || renames.length) ? folderListFrom(md) : undefined;
    const attachments = attachmentListFrom(this.app.vault.getFiles());
    this.post(wrap("vault-delta", { changed, removed, renames, folders, attachments, label: "Vault", navigationEnabled: this.navigationEnabled() }));
  }

  async onClose(): Promise<void> {
    this.viewEpoch++;
    this.fullWork = null;
    this.flushing = false;
    window.clearTimeout(this.retryTimer); this.retryTimer = 0;
    window.clearTimeout(this.trailing); window.clearTimeout(this.maxwaitId);
    if (this.frame) { try { this.frame.srcdoc = "about:blank"; } catch (e) { /* iframe already detached */ } this.frame = null; }
    this.ready = false;
    this.contentEl.empty();
  }
}

const IMPORTER_ID = "obsidian-importer";
const IMPORTER_TESTED_VERSION = "3.1.17";
const AUTO_STAMP_DEBOUNCE_MS = 900;

/** Community-plugin and command registries. Not in Obsidian's public typings; reached only through guarded reads. */
interface AppRegistries {
  plugins?: { manifests?: Record<string, { version?: unknown } | undefined>; enabledPlugins?: Set<string>; plugins?: Record<string, unknown> };
  commands?: { executeCommandById?(id: string): boolean };
  setting?: { open?(): void; openTabById?(id: string): unknown };
}

export default class KosmosOdenPlugin extends Plugin implements PersonalPluginHost, PersonalNotesHost {
  agentSettings: AgentSettings = { ...DEFAULT_AGENT_SETTINGS };
  nextcloudSettings: NextcloudSettings = { ...DEFAULT_NEXTCLOUD_SETTINGS };
  nextcloudState: NextcloudSyncState = emptyNextcloudState();
  nextcloudStatus = "Not configured";
  agentApi!: KosmosAgentServer;
  provider!: VaultDataProvider;

  private eventsLive = false;
  private nextcloudSyncRunning = false;
  private timestampTimers = new Map<string, number>();
  private timestampWriteUntil = new Map<string, number>();
  private timestampWrites = new Set<object>();
  private startupSyncTimer: number | null = null;

  /* Personal Notes (0.9.0) runtime state. Nothing here is persisted. */
  private personal: PersonalRuntime | null = null;
  private personalSource: ObsidianPersonalSource | null = null;
  private device: PersonalDeviceState | null = null;
  private connecting = false;
  private pendingTagging: TaggingPlan | null = null;
  private pendingSupersedes: TaggingPlan | null = null;
  /** Content hashes Kosmos itself wrote, per path (stamp-loop guard). */
  private ownWrites = new Map<string, string[]>();
  /** Last content hash the automatic stamper knows per path. */
  private stampBaselines = new Map<string, string>();
  private autoStamps = new Map<string, { timer: number; prevRaw: string | undefined; kind: "create" | "modify" }>();
  private searchStatusListeners = new Set<() => void>();
  private readonly yaml = strictYaml(parseYaml);
  /**
   * Opens the Personal tagging view. The UI replaces it when its view is
   * registered; until then `openTagging()` opens this plugin's settings tab.
   */
  taggingUi: (() => void) | null = null;

  scheduleTimestamp(file: any, delay = 350): void {
    // Obsidian emits create events for existing notes during startup discovery.
    // Those are not user edits and must not start frontmatter writes.
    if (!this.eventsLive || this.timestampWrites.has(file)) return;
    // Personal Notes (0.9.0): the legacy automatic stamper never writes while the Personal profile is active.
    if (this.agentSettings.activeProfile === "personal") return;
    if (isKosmosOperationalPath(file?.path) || !this.agentSettings.noteTimestampsEnabled || !timestampEligible(file?.path || "", file?.extension || "")) return;
    if ((this.timestampWriteUntil.get(file.path) ?? 0) > Date.now()) return;
    const previous = this.timestampTimers.get(file.path);
    if (previous != null) window.clearTimeout(previous);
    const timer = window.setTimeout(() => {
      this.timestampTimers.delete(file.path);
      void this.stampNote(file);
    }, delay);
    this.timestampTimers.set(file.path, timer);
  }

  async stampNote(file: any): Promise<void> {
    if (!this.eventsLive || this.timestampWrites.has(file)) return;
    // Personal Notes (0.9.0): the legacy automatic stamper never writes while the Personal profile is active.
    if (this.agentSettings.activeProfile === "personal") return;
    if (isKosmosOperationalPath(file?.path) || !this.agentSettings.noteTimestampsEnabled || !timestampEligible(file?.path || "", file?.extension || "")) return;
    this.timestampWrites.add(file);
    try {
      const created = Number(file.stat?.ctime) || Date.now();
      const modified = Number(file.stat?.mtime) || Date.now();
      this.timestampWriteUntil.set(file.path, Date.now() + 2500);
      await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        applyNoteTimestamps(fm, created, modified, {
          useLocalTimezone: this.agentSettings.timestampUseLocalTimezone,
          createdKey: this.agentSettings.timestampCreatedKey,
          updatedKey: this.agentSettings.timestampUpdatedKey,
        });
      });
    } catch (error) {
      console.warn("Kosmos-Oden: could not stamp note timestamps", file?.path, error);
    } finally {
      // A host write can outlast the debounce window while indexing. Keep
      // suppressing its own modify event until completion, including renames.
      this.timestampWriteUntil.set(file.path, Date.now() + 2500);
      this.timestampWrites.delete(file);
    }
  }

  agentLanUrls(): string[] {
    return this.provider.lanAddresses().map((ip) => `http://${ip}:${this.agentSettings.agentPort}`);
  }

  startAgentApi(): void {
    // Personal profile: the connection starts only through its own token and enable action.
    if (this.agentSettings.activeProfile === "personal") {
      void this.connect().then((s) => { if (s.error) new Notice(`Kosmos-Oden: ${s.error}`); });
      return;
    }
    this.agentApi.start((msg) => new Notice("Kosmos-Oden Agent API: " + msg));
    if (this.agentApi.status.startsWith("unavailable")) {
      new Notice("Kosmos-Oden: the Agent API needs desktop Obsidian.");
    }
  }

  async onload(): Promise<void> {
    const persisted = await this.loadData();
    this.agentSettings = migrateAgentSettings(persisted);
    this.nextcloudSettings = migrateNextcloudSettings(persisted?.nextcloud);
    if (!persisted?.nextcloud) this.nextcloudSettings.remoteFolder = `Kosmos-Oden/${this.app.vault.getName()}`;
    const scope = syncScope(this.nextcloudSettings);
    this.nextcloudState = migrateNextcloudState(persisted?.nextcloudState, scope);
    this.nextcloudStatus = this.nextcloudSettings.serverUrl ? "Ready" : "Not configured";
    let settingsChanged = false;
    if (!this.agentSettings.agentToken) {
      try {
        this.agentSettings.agentToken = makeToken();
        settingsChanged = true;
      } catch (e: any) {
        // No secure RNG: leave the token empty. With agentRequireToken on, the
        // server rejects every request rather than accepting a weak token (§16).
        console.error("Kosmos-Oden:", e);
        new Notice("Kosmos-Oden: could not create a secure Agent API token; the API will refuse requests until one exists.");
      }
    }
    if (!this.agentSettings.agentGraphNamespace) {
      try {
        this.agentSettings.agentGraphNamespace = makeToken().slice(0, 16);
        settingsChanged = true;
      } catch (_) { /* token failure above already leaves the API fail-closed */ }
    }
    if (settingsChanged) await this.saveAgentSettings();
    this.provider = new VaultDataProvider(this.app, this.agentSettings);
    this.agentApi = new KosmosAgentServer(nodeRequire("http"), this.agentSettings, this.provider);
    this.device = new PersonalDeviceState(this.app, deviceNamespace(this.manifest?.id ?? "kosmos-oden", this.vaultIdentity()));
    this.addSettingTab(new KosmosSettingTab(this.app, this));
    for (const notice of this.settingsNotices()) new Notice(`Kosmos-Oden: ${notice}`);
    if (this.agentSettings.activeProfile === "personal") {
      this.attachPersonal();
      // Synced settings never start sharing: only this device's own token and autostart choice do.
      if (this.device.autoStart() && this.device.token() && !getProfileSettingsMigration(this.agentSettings).connectorMustStayStopped) void this.connect();
    } else if (this.agentSettings.agentEnabled) this.startAgentApi();
    this.addCommand({ id: "write-agent-api-guide", name: "Write Agent API guide (AGENT-API.md) to vault", callback: () => void this.writeAgentGuide() });

    const kosmosView = (leaf: WorkspaceLeaf) => new KosmosView(leaf, () => this.agentSettings.navigationEnabled, (file) => this.corpusText(file));
    this.registerView(VIEW_TYPE, kosmosView);
    this.registerView(LEGACY_VIEW_TYPE, kosmosView);
    this.addRibbonIcon("orbit", "Open Kosmos-Oden", () => void this.activate());
    this.addCommand({ id: "open-kosmos-oden", name: "Open Kosmos-Oden", callback: () => void this.activate() });
    // Personal Notes (0.9.0). Only registerView, addRibbonIcon and addCommand
    // are used here: the plugin test stub implements nothing else.
    this.registerView(PERSONAL_SEARCH_VIEW, (leaf: WorkspaceLeaf) => new PersonalSearchView(leaf, this));
    this.addRibbonIcon("search", "Search my notes", () => void this.openPersonalSearch());
    this.addCommand({ id: "search-my-notes", name: "Search my notes", callback: () => void this.openPersonalSearch() });
    this.addCommand({ id: "add-notes", name: "Add notes from another app", callback: () => this.openAddNotes() });
    this.addCommand({ id: "connect-my-ai", name: "Connect my AI", callback: () => this.openConnectAi() });
    this.addCommand({ id: "note-supersedes", name: "This note replaces another note (GKX supersedes)", callback: () => this.openSupersedes() });
    this.addCommand({ id: "personal-tagging", name: "Optional tagging: preview deterministic tags", callback: () => this.openTagging() });
    this.addCommand({
      id: "mark-notes-gkx",
      name: "Scan and repair human-editable GKX formatting (back up and preview)",
      callback: () => void this.markNotesInGkx(),
    });
    this.addCommand({ id: "propose-gkx-enrichment", name: "Re-scan editable GKX notes for label and relationship proposals", callback: () => void this.proposeGkxEnrichment() });
    this.addCommand({
      id: "upgrade-all-notes-gkx-2-2",
      name: "Convert recoverable notes to editable GKX 2.2 (preview first)",
      callback: () => void this.markNotesInGkx("upgrade-all"),
    });
    this.addCommand({
      id: "upgrade-all-notes-gkx-2-3",
      name: "Convert recoverable notes to native GKX 2.3 (preview first)",
      callback: () => void this.markNotesInGkx("convert-to-23"),
    });
    this.addCommand({ id: "export-graphiti-episodes", name: "Export Graphiti episodes (GKX)", callback: () => void this.exportGraphitiEpisodes() });
    this.addCommand({ id: "sync-nextcloud-now", name: "Sync vault with Nextcloud now", callback: () => void this.runNextcloudSync(true) });

    // Don't react to the startup metadata-resolve storm; the view's initial load already
    // captures the fully-resolved vault. Only go live once the workspace has settled.
    this.app.workspace.onLayoutReady(() => {
      this.eventsLive = true;
      this.provider.markFullDirty();
      if (this.personal) void this.personal.build();
      if (this.nextcloudSettings.enabled && this.nextcloudSettings.syncOnStartup) {
        this.startupSyncTimer = window.setTimeout(() => {
          this.startupSyncTimer = null;
          void this.runNextcloudSync(false);
        }, 1500);
      }
    });

    if (this.nextcloudSettings.enabled && this.nextcloudSettings.intervalMinutes > 0) {
      this.registerInterval(window.setInterval(
        () => void this.runNextcloudSync(false),
        this.nextcloudSettings.intervalMinutes * 60_000,
      ));
    }

    const views = (): KosmosView[] =>
      this.kosmosLeaves()
        .map((l) => l.view)
        .filter((v): v is KosmosView => v instanceof KosmosView);

    // Agent API -> Kosmos views: broadcast each query's touched notes so the traversal renders live.
    this.agentApi.onTraversal = (paths, tool, agent, agentId) => { for (const v of views()) v.agentTraversal(paths, tool, agent, agentId); };

    // Live vault-connectivity indicator: a cheap read probe (no network stack) —
    // readability of the vault files IS the signal. Green when the adapter can
    // stat the vault root within a short timeout, red on failure/timeout.
    const probeVaultConnectivity = async (): Promise<void> => {
      const leaves = views();
      if (!leaves.length) return; // nothing to paint
      let connected = false;
      try {
        const adapter: any = this.app.vault.adapter;
        const probe = Promise.resolve().then(() => adapter.stat ? adapter.stat(".") : adapter.list?.("."));
        const timeout = new Promise((_, reject) => window.setTimeout(() => reject(new Error("probe timeout")), 2000));
        await Promise.race([probe, timeout]);
        connected = true;
      } catch (_) { connected = false; }
      for (const v of leaves) v.setVaultStatus(connected);
    };
    void probeVaultConnectivity();
    this.registerInterval(window.setInterval(() => void probeVaultConnectivity(), 10_000));

    // The engine projects source bytes, not Obsidian's metadata cache. Cache
    // refreshes can fire during cachedRead without a source edit; invalidating
    // here would repeatedly discard a cold build during host indexing.
    this.registerEvent(this.app.vault.on("create", (file: any) => {
      this.provider.markChanged(file.path);
      this.scheduleTimestamp(file, 150);
      this.personalVaultEvent("create", file);
      if (!this.eventsLive || file.extension !== "md") return;
      for (const v of views()) v.noteCreated(file.path);
    }));
    this.registerEvent(this.app.vault.on("modify", (file: any) => {
      this.provider.markChanged(file.path);
      this.scheduleTimestamp(file, 900);
      this.personalVaultEvent("modify", file);
      if (!this.eventsLive || file.extension !== "md") return;
      for (const v of views()) v.noteChanged(file.path);
    }));
    this.registerEvent(this.app.vault.on("delete", (file: any) => {
      this.provider.markRemoved(file.path);
      this.personalVaultEvent("delete", file);
      if (!this.eventsLive) return;
      for (const v of views()) v.noteDeleted(file.path);
    }));
    this.registerEvent(this.app.vault.on("rename", (file: any, oldPath: string) => {
      this.provider.markRenamed(oldPath, file.path);
      this.personalVaultEvent("rename", file, oldPath);
      if (!this.eventsLive) return;
      for (const v of views()) v.noteRenamed(file.path, oldPath);
    }));
    // Metadata can change without a text change (a link target appears, the
    // cache catches up). Only the Personal corpus listens; the Engine
    // provider deliberately ignores these (see above).
    const metadataChanged = (file: any) => { if (file?.extension === "md") this.personal?.corpus.apply({ modified: [file.path] }); };
    this.registerEvent(this.app.metadataCache.on("changed", metadataChanged));
    this.registerEvent(this.app.metadataCache.on("resolve", metadataChanged));

    // When leaf visibility changes: flush deferred data AND gate the iframe's render loop.
    const onShow = () => { for (const v of views()) { v.flushIfDeferred(); v.syncVisibility(); } };
    this.registerEvent(this.app.workspace.on("active-leaf-change", onShow));
    this.registerEvent(this.app.workspace.on("layout-change", onShow));
  }

  /** Leaves holding a Kosmos view under either the current or the pre-rename
   *  view type, so an upgraded workspace is never treated as having no pane. */
  private kosmosLeaves(): WorkspaceLeaf[] {
    const ws = this.app.workspace;
    return [...ws.getLeavesOfType(VIEW_TYPE), ...ws.getLeavesOfType(LEGACY_VIEW_TYPE)];
  }

  async activate(): Promise<void> {
    const ws = this.app.workspace;
    let leaf = this.kosmosLeaves()[0];
    if (!leaf) {
      leaf = ws.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    ws.revealLeaf(leaf);
  }

  /* ---------------- Personal Notes (0.9.0) ---------------- */

  /** Switch the profile that serves agents. Changes nothing else: the
   *  existing profile's settings (defaultSensitivity included) stay as saved.
   *  The listener stops; each profile then starts only by its own rules. */
  async setActiveProfile(profile: ActiveProfile): Promise<void> {
    if (this.agentSettings.activeProfile === profile) return;
    this.agentApi.stop();
    this.agentSettings.activeProfile = profile;
    await this.saveAgentSettings();
    if (profile === "personal") this.attachPersonal(); else this.detachPersonal();
    this.invalidatePersonal();
    if (profile === "existing" && this.agentSettings.agentEnabled) this.startAgentApi();
    if (profile === "personal" && this.device?.autoStart() && this.device.token()) await this.connect();
  }

  /** Canonical vault identity for device-local namespacing: the real vault folder on desktop, else the vault name. */
  private vaultIdentity(): string {
    const base = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.();
    if (!base) return this.app.vault.getName();
    try { return nodeRequire("fs")?.realpathSync(base) ?? base; } catch { return base; }
  }

  /** The local Personal runtime (corpus + search worker), created on first use in either profile. */
  private local(): PersonalRuntime {
    if (this.personal) return this.personal;
    this.personalSource ??= new ObsidianPersonalSource(this.app, {
      parse: this.yaml,
      fs: nodeRequire("fs"),
      path: nodeRequire("path"),
      timestampKeys: () => ({ createdKey: this.agentSettings.timestampCreatedKey, updatedKey: this.agentSettings.timestampUpdatedKey }),
    });
    const runtime = new PersonalRuntime({
      source: this.personalSource,
      settings: () => this.agentSettings,
      configDir: this.app.vault.configDir,
      workers: personalSearchWorkerFactory(),
      onDiagnostic: (message) => console.debug("Kosmos-Oden Personal Notes:", message),
    });
    runtime.onStatus(() => this.emitSearchStatus());
    this.personal = runtime;
    if (this.eventsLive) void runtime.build();
    this.emitSearchStatus();
    return runtime;
  }

  /** Hand the Personal runtime to the Agent API server (idempotent). */
  private attachPersonal(): void {
    const runtime = this.local();
    const agent = runtime.agentRuntime(() => this.device?.token() ?? "");
    if (this.agentApi.personal !== agent) this.agentApi.setPersonalRuntime(agent);
    runtime.syncSearchGeneration();
  }

  /** Remove and dispose the Personal runtime: nothing from it keeps serving. */
  private detachPersonal(): void {
    if (this.agentApi?.personal) this.agentApi.setPersonalRuntime(null);
    for (const pending of this.autoStamps.values()) window.clearTimeout(pending.timer);
    this.autoStamps.clear();
    this.pendingTagging = this.pendingSupersedes = null;
    this.personal?.dispose();
    this.personal = null;
    this.emitSearchStatus();
  }

  /**
   * The one invalidation path for profile, scope, token, bind and
   * accept-older changes: bump the policy generation (the server does it when
   * the runtime is attached), end held requests, reject stale searches and
   * restart the listener when its address changed.
   */
  private invalidatePersonal(): void {
    const { restartRequired } = this.agentApi.reconfigureAccess();
    const runtime = this.personal;
    if (runtime && this.agentApi.personal?.generation !== runtime.generation) runtime.generation.bump();
    runtime?.syncSearchGeneration();
    if (restartRequired && this.agentApi.server) void this.startListener();
  }

  private async startListener(): Promise<void> {
    this.connecting = true;
    try {
      this.agentApi.start();
      await waitForListener(this.agentApi.server);
    } finally { this.connecting = false; }
  }

  /** Corpus text for the Kosmos view, only while the Personal runtime is active and the record matches the file on disk. */
  private corpusText(file: TFile): string | null {
    if (this.agentSettings.activeProfile !== "personal") return null;
    const record = this.personal?.corpus.get(file.path);
    return record && record.mtimeMs === file.stat?.mtime && record.sizeBytes === file.stat?.size ? record.raw : null;
  }

  /** Vault event → corpus, containment cache, and (opted in) automatic timestamps. */
  private personalVaultEvent(kind: "create" | "modify" | "delete" | "rename", file: any, oldPath?: string): void {
    const path = file?.path;
    if (typeof path !== "string") return;
    if (kind !== "modify") this.personalSource?.invalidate();
    if (kind === "delete") { this.stampBaselines.delete(path); this.ownWrites.delete(path); }
    if (kind === "rename" && oldPath) {
      const baseline = this.stampBaselines.get(oldPath);
      this.stampBaselines.delete(oldPath); this.ownWrites.delete(oldPath);
      if (baseline) this.stampBaselines.set(path, baseline);
    }
    const corpus = this.personal?.corpus;
    if (corpus) {
      if (kind === "create") corpus.apply({ created: [path] });
      else if (kind === "modify") corpus.apply({ modified: [path] });
      else if (kind === "delete") corpus.apply({ deleted: [path] });
      else if (oldPath) corpus.apply({ renamed: [{ from: oldPath, to: path }] });
    }
    if ((kind === "create" || kind === "modify") && file.extension === "md") this.scheduleAutoStamp(kind, file);
  }

  private timestampKeys() {
    return { createdKey: this.agentSettings.timestampCreatedKey, updatedKey: this.agentSettings.timestampUpdatedKey, useLocalTimezone: this.agentSettings.timestampUseLocalTimezone };
  }

  /** Opted-in automatic timestamps (Personal profile only). Tagging off = nothing is scheduled or read. */
  private scheduleAutoStamp(kind: "create" | "modify", file: TFile): void {
    if (this.agentSettings.activeProfile !== "personal" || !this.eventsLive) return;
    const t = this.agentSettings.personalNotes.tagging;
    if (!(t.enabled && t.timestamps && t.automaticTimestamps)) return;
    const eventTimeMs = Date.now(); // the content-event time, captured once
    const previous = this.autoStamps.get(file.path);
    if (previous) window.clearTimeout(previous.timer);
    // The corpus still holds the text from before this burst of edits.
    const prevRaw = previous ? previous.prevRaw : this.personal?.corpus.get(file.path)?.raw;
    const firstKind = previous?.kind ?? kind;
    const timer = window.setTimeout(() => {
      this.autoStamps.delete(file.path);
      void this.runAutoStamp(firstKind, file, eventTimeMs, prevRaw).catch((e) => console.warn("Kosmos-Oden: automatic timestamp skipped", file.path, e));
    }, AUTO_STAMP_DEBOUNCE_MS);
    this.autoStamps.set(file.path, { timer, prevRaw, kind: firstKind });
  }

  private async runAutoStamp(kind: "create" | "modify", file: TFile, eventTimeMs: number, prevRaw: string | undefined): Promise<void> {
    if (!this.eventsLive || this.agentSettings.activeProfile !== "personal") return;
    const raw = await this.app.vault.read(file);
    const hash = await sha256Hex(raw).catch(() => null);
    const baseline = this.stampBaselines.get(file.path) ?? (prevRaw !== undefined ? await sha256Hex(prevRaw).catch(() => undefined) : undefined);
    const decision = autoTimestampDecision({ kind, path: file.path, contentHash: hash, eventTimeMs }, {
      tagging: this.agentSettings.personalNotes.tagging,
      eventsLive: this.eventsLive,
      isUnderAnyFolder,
      isExcludedPath: (p) => isKosmosOperationalPath(p) || !timestampEligible(p, file.extension),
      baselineHash: baseline,
      ownWriteHashes: new Set(this.ownWrites.get(file.path) ?? []),
      imports: this.importState(),
    });
    if (decision.recordHash) this.stampBaselines.set(file.path, decision.recordHash);
    if (decision.action !== "stamp" || hash === null) return;
    const plan = planAutoTimestamp({
      note: { path: file.path, raw, hash, ctimeMs: file.stat?.ctime, mtimeMs: file.stat?.mtime },
      eventTimeMs: decision.eventTimeMs, formatTimestamp, parse: this.yaml, timestamps: this.timestampKeys(),
    });
    const result = await applyTaggingPlan(plan, this.writerHost(null), { backup: false });
    for (const w of result.ownWrites) this.stampBaselines.set(w.path, w.hash);
  }

  private noteFile(path: string): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(path);
    return f && "stat" in f && (f as TFile).extension === "md" ? f as TFile : null;
  }

  private async ensureFolder(path: string): Promise<void> {
    const adapter = this.app.vault.adapter;
    let current = "";
    for (const part of normalizePath(path).split("/").filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      if (!(await adapter.exists(current))) await adapter.mkdir(current);
    }
  }

  /** Narrow writer for tagging: fresh reads, compare-and-write inside Vault.process, exact backups under `backupRoot`. */
  private writerHost(backupRoot: string | null): TaggingWriterHost {
    return {
      readRaw: async (path) => {
        const file = this.noteFile(path);
        if (!file) throw new Error("missing");
        return this.app.vault.read(file);
      },
      writeRaw: async (path, text, expectedRaw) => {
        const file = this.noteFile(path);
        if (!file) return false;
        let written = false;
        await this.app.vault.process(file, (current) => {
          if (current !== expectedRaw) return current;
          written = true;
          return text;
        });
        return written;
      },
      saveBackup: async (path, beforeText) => {
        if (!backupRoot) throw new Error("no backup location for this operation");
        const target = normalizePath(`${backupRoot}/files/${path}.bak`);
        await this.ensureFolder(target.slice(0, target.lastIndexOf("/")));
        if (await this.app.vault.adapter.exists(target)) throw new Error(`backup already exists: ${target}`);
        await this.app.vault.adapter.write(target, beforeText);
        return target;
      },
      sha256: (text) => sha256Hex(text),
      recordOwnWrite: (path, hash) => {
        const list = this.ownWrites.get(path) ?? [];
        list.push(hash);
        this.ownWrites.set(path, list.slice(-8));
      },
    };
  }

  /* ---- PersonalPluginHost: profile and settings ---- */

  /**
   * A property, not a method: Obsidian 1.13 declares `Plugin.settings?: unknown`
   * and a method cannot override a property. `host.settings()` is unchanged.
   * Obsidian's declarative setting definitions read `plugin.settings` by
   * default, so a settings tab using them must override getControlValue/setControlValue.
   */
  settings = (): PersonalSettingsView => ({
    activeProfile: this.agentSettings.activeProfile,
    personalNotes: structuredClone(this.agentSettings.personalNotes),
    port: this.agentSettings.agentPort,
  });

  settingsNotices(): string[] { return [...getProfileSettingsMigration(this.agentSettings).notices]; }

  async updatePersonalNotes(change: (draft: PersonalNotesSettings) => void): Promise<{ saved: boolean; rejected: RejectedFolder[] }> {
    const draft = structuredClone(this.agentSettings.personalNotes);
    change(draft);
    const rejected: RejectedFolder[] = [];
    const take = (value: unknown, allowRoot = true): string[] => {
      const parsed = parseFolderList(value);
      rejected.push(...parsed.rejected);
      if (!allowRoot && parsed.folders.includes("/")) rejected.push({ index: parsed.folders.indexOf("/"), value: "/", reason: "absolute" });
      return parsed.folders;
    };
    draft.includeFolders = take(draft.includeFolders);
    draft.excludeFolders = take(draft.excludeFolders);
    draft.importFolders = take(draft.importFolders);
    draft.importReportPaths = take(draft.importReportPaths, false);
    draft.tagging = {
      ...draft.tagging,
      folders: take(draft.tagging?.folders),
      enabled: draft.tagging?.enabled === true,
      timestamps: draft.tagging?.timestamps === true,
      uniqueIds: draft.tagging?.uniqueIds === true,
      supersession: draft.tagging?.supersession === true,
      automaticTimestamps: draft.tagging?.automaticTimestamps === true,
    };
    draft.connection = {
      ...draft.connection,
      bindMode: draft.connection?.bindMode === "lan" ? "lan" : "localhost",
      advertisedBaseUrl: typeof draft.connection?.advertisedBaseUrl === "string" ? draft.connection.advertisedBaseUrl : "",
      autoStart: draft.connection?.autoStart === true,
      acceptOlderMcp: draft.connection?.acceptOlderMcp !== false,
    };
    if (rejected.length) return { saved: false, rejected };
    this.agentSettings.personalNotes = draft;
    await this.saveAgentSettings();
    this.invalidatePersonal();
    return { saved: true, rejected: [] };
  }

  /* ---- PersonalPluginHost: local search ---- */

  async search(query: string, opts: { limit?: number; signal?: AbortSignal } = {}): Promise<SearchResponse> {
    const runtime = this.local();
    try {
      return await runtime.search.search({ query, limit: opts.limit, allowedPaths: null, signal: opts.signal });
    } catch (error) {
      if (error instanceof PersonalError && error.code === "search_unavailable") this.emitSearchStatus();
      throw error;
    }
  }

  searchStatus(): PersonalSearchStatus { return this.local().status(); }

  onSearchStatus(listener: () => void): () => void {
    this.searchStatusListeners.add(listener);
    return () => { this.searchStatusListeners.delete(listener); };
  }

  private emitSearchStatus(): void {
    for (const listener of [...this.searchStatusListeners]) { try { listener(); } catch (e) { console.warn("Kosmos-Oden: search status listener failed", e); } }
  }

  retrySearch(): void {
    const runtime = this.local();
    if (this.eventsLive && runtime.corpus.revision === 0) void runtime.build();
    runtime.retry();
  }

  sharedNoteCount(): number { return this.local().sharedNoteCount(); }

  /* ---- PersonalPluginHost: import ---- */

  /** Guarded Importer detection. Never throws. */
  importer(): { state: ImporterState; version: string | null; tested: boolean } {
    try {
      const plugins = (this.app as typeof this.app & AppRegistries).plugins;
      if (!plugins || typeof plugins !== "object") return { state: "unknown", version: null, tested: false };
      const manifest = plugins.manifests?.[IMPORTER_ID];
      if (!manifest) return { state: "missing", version: null, tested: false };
      const version = typeof manifest.version === "string" ? manifest.version : null;
      const enabled = plugins.enabledPlugins instanceof Set ? plugins.enabledPlugins.has(IMPORTER_ID) : !!plugins.plugins?.[IMPORTER_ID];
      return { state: enabled ? "enabled" : "installed", version, tested: version === IMPORTER_TESTED_VERSION };
    } catch {
      return { state: "unknown", version: null, tested: false };
    }
  }

  openImporter(destinationFolder: string): boolean {
    const folder = normalizeFolder(destinationFolder);
    // Kosmos cannot observe the Importer finishing, so the folder waits for "Import finished — review tags".
    if (folder) this.saveImportState(importStarted(this.importState(), folder, false));
    try {
      if (this.importer().state !== "enabled") return false;
      return (this.app as typeof this.app & AppRegistries).commands?.executeCommandById?.(`${IMPORTER_ID}:open-modal`) === true;
    } catch {
      return false;
    }
  }

  private importState(): TaggingImportState {
    const state = this.agentSettings.personalNotes.importState;
    return { running: parseFolderList(state?.running).folders, awaitingReview: parseFolderList(state?.awaitingReview).folders };
  }

  private saveImportState(state: TaggingImportState): void {
    this.agentSettings.personalNotes.importState = { running: [...state.running], awaitingReview: [...state.awaitingReview] };
    void this.saveAgentSettings();
  }

  pendingImportFolders(): string[] {
    const state = this.importState();
    return [...new Set([...state.running, ...state.awaitingReview])];
  }

  async importFinished(folder: string): Promise<void> {
    this.agentSettings.personalNotes.importState = importReviewed(this.importState(), folder);
    await this.saveAgentSettings();
  }

  /** Plain status of the import folders, computed from the Personal corpus (not the Engine graph). */
  async personalNotesStatus(): Promise<PersonalNotesStatus> {
    const runtime = this.local();
    await runtime.corpus.whenIdle();
    const { importFolders, importReportPaths } = this.agentSettings.personalNotes;
    const notes = [...runtime.corpus.records()]
      .filter((r) => isUnderAnyFolder(r.path, importFolders))
      .map((r) => ({ path: r.path, body: stripFrontmatter(r.raw) }));
    const files = this.app.vault.getFiles().map((f) => f.path);
    return summarizePersonalNotes({ notes, files, importFolders, importReportPaths });
  }

  /* ---- PersonalPluginHost: optional deterministic tagging ---- */

  private existingUids(): Map<string, string[]> {
    const uids = new Map<string, string[]>();
    for (const r of this.local().corpus.records()) if (r.meta.uid) (uids.get(r.meta.uid) ?? uids.set(r.meta.uid, []).get(r.meta.uid)!).push(r.path);
    return uids;
  }

  private async taggingInput(path: string): Promise<TaggingNoteInput | null> {
    const file = this.noteFile(path);
    if (!file || isKosmosOperationalPath(path)) return null;
    const raw = await this.app.vault.read(file);
    return { path, raw, hash: await sha256Hex(raw), ctimeMs: file.stat.ctime, mtimeMs: file.stat.mtime };
  }

  async previewTagging(paths?: string[]): Promise<TaggingPlan> {
    const t = this.agentSettings.personalNotes.tagging;
    this.local();
    const source = this.personalSource!;
    const selected = paths
      ? [...new Set(paths)]
      : this.app.vault.getMarkdownFiles().map((f) => f.path).filter((p) => isUnderAnyFolder(p, t.folders));
    const notes: TaggingNoteInput[] = [];
    // ponytail: sequential reads; batch them if previews of thousands of notes feel slow.
    for (const path of selected.sort()) {
      if (!source.physicallyContained(path)) continue;
      const input = await this.taggingInput(path);
      if (input) notes.push(input);
    }
    const plan = planTagging({
      notes,
      options: { timestamps: t.enabled && t.timestamps, uniqueIds: t.enabled && t.uniqueIds, supersession: false },
      proposalTimeMs: Date.now(),
      newUid: (nowMs) => makeGkxUuidV7(nowMs),
      formatTimestamp,
      parse: this.yaml,
      timestamps: this.timestampKeys(),
      existingUids: this.existingUids(),
      pending: this.pendingTagging,
    });
    this.pendingTagging = plan;
    return plan;
  }

  async applyTagging(plan: TaggingPlan): Promise<TaggingApplyResult> {
    const t = this.agentSettings.personalNotes.tagging;
    const allowed = t.enabled && (!plan.options.timestamps || t.timestamps) && (!plan.options.uniqueIds || t.uniqueIds) && (!plan.options.supersession || t.supersession);
    if (!allowed) throw new Error("Optional tagging or one of the previewed options is off; preview again.");
    const root = normalizePath(`.gkx/backup/tagging-${new Date().toISOString().replace(/[:.]/g, "-")}-${makeToken().slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, "0")}`);
    const result = await applyTaggingPlan(plan, this.writerHost(root));
    if (result.manifest) await this.app.vault.adapter.write(`${root}/manifest.json`, JSON.stringify(result.manifest, null, 2));
    for (const w of result.ownWrites) this.stampBaselines.set(w.path, w.hash);
    if (plan === this.pendingTagging) this.pendingTagging = null;
    if (plan === this.pendingSupersedes) this.pendingSupersedes = null;
    return result;
  }

  async previewSupersedes(replacement: TFile, targetLinkText: string): Promise<{ check: SupersedesCheck; plan: TaggingPlan | null }> {
    const runtime = this.local();
    const source = this.personalSource!;
    const input = await this.taggingInput(replacement.path);
    const notes: LineageInputNote[] = [];
    for (const r of runtime.corpus.records()) {
      if (r.path === replacement.path) continue;
      notes.push({ path: r.path, uid: r.meta.uid, updatedAt: r.meta.updatedAt, supersedes: [...r.meta.supersedes], supersededBy: [...r.meta.supersededBy] });
    }
    if (input) {
      const meta = source.meta(input.path, input.raw);
      notes.push({ path: input.path, uid: meta.uid, updatedAt: meta.updatedAt, supersedes: [...meta.supersedes], supersededBy: [...meta.supersededBy] });
    }
    const resolve = (text: string, from: string) => source.resolveLink(text, from);
    const check = checkSupersedesProposal(replacement.path, targetLinkText, notes, resolve);
    if (!check.ok || !input) return { check, plan: null };
    const t = this.agentSettings.personalNotes.tagging;
    const plan = planTagging({
      notes: [input],
      options: { timestamps: false, uniqueIds: t.enabled && t.uniqueIds, supersession: t.enabled && t.supersession },
      proposalTimeMs: Date.now(),
      newUid: (nowMs) => makeGkxUuidV7(nowMs),
      formatTimestamp,
      parse: this.yaml,
      timestamps: this.timestampKeys(),
      existingUids: this.existingUids(),
      supersedes: { requests: [{ path: replacement.path, target: targetLinkText }], notes, resolve },
      pending: this.pendingSupersedes,
    });
    this.pendingSupersedes = plan;
    return { check, plan };
  }

  /* ---- PersonalPluginHost: connection ---- */

  connection(): PersonalConnectionStatus {
    const s = this.agentSettings;
    const base = {
      bindMode: s.personalNotes.connection.bindMode === "lan" ? "lan" as const : "localhost" as const,
      port: s.agentPort,
      hasToken: !!this.device?.token(),
      autoStart: !!this.device?.autoStart(),
    };
    if (s.activeProfile !== "personal") return { ...base, state: "stopped", error: "The existing profile is active. Choose Personal Notes to use this connection." };
    const status = String(this.agentApi?.status ?? "stopped");
    if (this.connecting) return { ...base, state: "starting" };
    if (status.startsWith("unavailable")) return { ...base, state: "unavailable", error: "The connection needs desktop Obsidian." };
    if (status.startsWith("error")) return { ...base, state: "error", error: status.replace(/^error:\s*/, "") };
    if (status === "running") return { ...base, state: "running" };
    return { ...base, state: this.agentApi?.server ? "starting" : "stopped" };
  }

  /** Make sure this device has its own token; never copied from settings. */
  private ensureToken(): string {
    let token = this.device?.token() ?? "";
    if (!token && this.device) { token = makeToken(); this.device.setToken(token); }
    return token;
  }

  async connect(): Promise<PersonalConnectionStatus> {
    if (this.agentSettings.activeProfile !== "personal") return this.connection();
    try { this.ensureToken(); } catch (e: any) {
      return { ...this.connection(), state: "error", error: `Could not create a token on this device: ${e?.message || e}` };
    }
    this.attachPersonal();
    await this.startListener();
    return this.connection();
  }

  async disconnect(): Promise<void> {
    this.agentApi.stop();
    this.connecting = false;
  }

  async rotateToken(): Promise<void> {
    if (!this.device) throw new Error("device-local storage is unavailable");
    this.device.setToken(makeToken());
    this.invalidatePersonal();
  }

  async setAutoStart(on: boolean): Promise<void> { this.device?.setAutoStart(on); }

  reachableAddresses(): string[] {
    return [...new Set(this.provider.lanAddresses())].filter((ip) => ip && ip !== "0.0.0.0" && ip !== "::" && ip !== "::1" && !ip.startsWith("127.") && !ip.startsWith("169.254."));
  }

  async testConnection(baseUrl: string, canaryPath?: string): Promise<ConnectionTestResult> {
    const runtime = this.personal;
    let canary: { path: string; title: string } | null = null;
    if (canaryPath) canary = { path: canaryPath, title: runtime?.corpus.get(canaryPath)?.meta.title ?? canaryPath.replace(/^.*\//, "").replace(/\.md$/i, "") };
    else canary = runtime?.firstSharedNote() ?? null;
    return testPersonalConnection({ http: nodeRequire("http"), https: nodeRequire("https"), baseUrl, token: this.device?.token() ?? "", canary });
  }

  connectionToken(): string {
    try { return this.ensureToken(); } catch { return ""; }
  }

  /** Absolute path of the bundled stdio adapter, for quick connect blocks. */
  bridgePath(): string { return installedBridgePath(this.app, this); }

  mcpProtocols(): { http: string[]; stdio: string[] } {
    const s = this.agentSettings;
    const older = s.activeProfile === "personal" ? s.personalNotes.connection.acceptOlderMcp !== false : s.agentLegacyMcp !== false;
    return { http: advertisedMcpProtocolVersions("http", older), stdio: advertisedMcpProtocolVersions("stdio", older) };
  }

  /* ---- navigation ---- */

  openTagging(): void {
    if (this.taggingUi) { this.taggingUi(); return; }
    try {
      const setting = (this.app as typeof this.app & AppRegistries).setting;
      if (setting?.open && setting.openTabById) { setting.open(); setting.openTabById(this.manifest.id); return; }
    } catch { /* settings internals vary by Obsidian version */ }
    new Notice("Kosmos-Oden: open Settings → Kosmos-Oden → Personal Notes → Optional tagging.");
  }

  async openPersonalSearch(): Promise<void> {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(PERSONAL_SEARCH_VIEW)[0];
    if (!leaf) {
      leaf = ws.getLeaf(true);
      await leaf.setViewState({ type: PERSONAL_SEARCH_VIEW, active: true });
    }
    ws.revealLeaf(leaf);
  }

  openAddNotes(): void { new AddNotesModal(this).open(); }
  openConnectAi(): void { new ConnectAiModal(this).open(); }

  /** @deprecated Old PersonalNotesHost entry (removed after the UI branch merges).
   *  Opens the optional Personal tagging entry; it no longer runs the full GKX
   *  `upgrade-all` conversion. The full GKX workflow commands stay registered. */
  async runGkxTagging(): Promise<void> {
    this.openTagging();
  }

  /** Optional GKX lineage: record that the open note replaces another note. */
  openSupersedes(): void {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") { new Notice("Kosmos-Oden: open the newer note first, then run this again."); return; }
    new SupersedesModal(this, file).open();
  }

  async saveAgentSettings(): Promise<void> { await this.savePluginData(); }

  async saveNextcloudSettings(): Promise<void> {
    const scope = syncScope(this.nextcloudSettings);
    if (scope !== this.nextcloudState.scope) this.nextcloudState = emptyNextcloudState(scope);
    await this.savePluginData();
  }

  private async savePluginData(): Promise<void> {
    await this.saveData({ ...this.agentSettings, nextcloud: this.nextcloudSettings, nextcloudState: this.nextcloudState });
  }

  /** Stable per-vault suffix (FNV-1a over plugin id and vault name). The
   *  rename changed neither input, so a credential stored by an earlier build
   *  carries this same suffix and differs only in the key's brand prefix. */
  private nextcloudSecretHash(): string {
    const source = `${this.manifest.id}-${this.app.vault.getName()}`.toLowerCase();
    let hash = 2166136261;
    for (let i = 0; i < source.length; i++) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(16);
  }

  nextcloudSecretId(): string { return `kosmos-oden-nextcloud-${this.nextcloudSecretHash()}`; }

  /** Key written by builds before the Kosmos-Oden rename. Read only.
   *
   *  DO NOT REBRAND THIS LITERAL. It names an existing entry in the user's
   *  secret store; rebranding it silently disables the credential migration
   *  below. scripts/check-artifacts.mjs asserts it survives into main.js. */
  private legacyNextcloudSecretId(): string { return `vault-kosmos-nextcloud-${this.nextcloudSecretHash()}`; }

  /** Resolves the WebDAV secret, promoting a pre-rename credential to the
   *  current key on first read. Without this the rename would leave sync with
   *  an empty password and surface it as an authentication failure. An empty
   *  result means no credential was ever stored, not that one was lost. The
   *  legacy entry is left in place: this surface exposes no delete, and an
   *  orphaned key is inert. */
  getNextcloudPassword(): string {
    const current = this.app.secretStorage.getSecret(this.nextcloudSecretId());
    if (current) return current;
    const legacy = this.app.secretStorage.getSecret(this.legacyNextcloudSecretId());
    if (!legacy) return "";
    this.app.secretStorage.setSecret(this.nextcloudSecretId(), legacy);
    return legacy;
  }

  setNextcloudPassword(value: string): void { this.app.secretStorage.setSecret(this.nextcloudSecretId(), value); }

  async testNextcloudConnection(): Promise<void> {
    this.nextcloudStatus = "Testing…";
    try {
      await new NextcloudWebDavClient(this.nextcloudSettings, this.getNextcloudPassword()).test();
      this.nextcloudStatus = "Connection successful";
      new Notice("Kosmos-Oden: Nextcloud connection successful");
    } catch (e: any) {
      this.nextcloudStatus = `Connection failed: ${e?.message || String(e)}`;
      new Notice(`Kosmos-Oden: ${this.nextcloudStatus}`);
    }
  }

  async runNextcloudSync(showNotice = true): Promise<SyncSummary | null> {
    if (this.nextcloudSyncRunning) {
      if (showNotice) new Notice("Kosmos-Oden: a Nextcloud sync is already running");
      return null;
    }
    this.nextcloudSyncRunning = true;
    this.nextcloudStatus = "Syncing…";
    try {
      const engine = new NextcloudSyncEngine(
        this.app, this.nextcloudSettings, this.nextcloudState, this.getNextcloudPassword(),
        async (state) => { this.nextcloudState = state; await this.savePluginData(); },
        this.manifest.dir,
      );
      const result = await engine.run();
      this.provider.markFullDirty();
      this.nextcloudStatus = result.errors.length
        ? `Completed with ${result.errors.length} error(s)`
        : `Synced: ${result.uploaded} up, ${result.downloaded} down, ${result.conflicts.length} conflict(s)`;
      if (showNotice || result.errors.length || result.conflicts.length) new Notice(`Kosmos-Oden: ${this.nextcloudStatus}`);
      return result;
    } catch (e: any) {
      this.nextcloudStatus = `Sync failed: ${e?.message || String(e)}`;
      if (showNotice) new Notice(`Kosmos-Oden: ${this.nextcloudStatus}`);
      return null;
    } finally { this.nextcloudSyncRunning = false; }
  }

  /** Audit the vault and open the explicit backup/approval gate. No LLM or
   * network route is involved; the core planner refuses ambiguous metadata. */
  async markNotesInGkx(mode: GkxMigrationMode = "safe-onboarding", onlyFolders?: readonly string[]): Promise<void> {
    await openGkxMigrationWorkflow(this.app, mode, () => this.provider.markFullDirty(), this.agentSettings, onlyFolders);
  }

  async proposeGkxEnrichment(): Promise<void> {
    await openGkxEnrichmentWorkflow(this.app, this.agentSettings, () => this.provider.markFullDirty());
  }

  async writeAgentGuide(): Promise<void> {
    if (this.agentSettings.activeProfile === "personal") {
      // Personal tokens are device-local: never export one into a note.
      const md = buildAgentGuide(
        this.agentSettings.agentPort,
        "<copy the token from Connect my AI; it is not written to notes>",
        this.agentSettings.personalNotes.connection.bindMode,
        this.agentLanUrls(),
        installedBridgePath(this.app, this),
      );
      await this.app.vault.adapter.write("AGENT-API.md", md);
      new Notice("Kosmos-Oden: wrote AGENT-API.md to your vault root (without a token; copy it from Connect my AI)");
      return;
    }
    const md = buildAgentGuide(
      this.agentSettings.agentPort,
      this.agentSettings.agentToken || "<enable the API to generate a token>",
      this.agentSettings.agentBindMode,
      this.agentLanUrls(),
      installedBridgePath(this.app, this)
    );
    await this.app.vault.adapter.write("AGENT-API.md", md);
    new Notice("Kosmos-Oden: wrote AGENT-API.md to your vault root (with your address + token filled in)");
  }

  onunload(): void {
    this.eventsLive = false;
    this.agentApi?.stop();
    this.detachPersonal();
    this.searchStatusListeners.clear();
    // Cancel pending note-stamp debounce timers so no frontmatter write fires after teardown.
    for (const timer of this.timestampTimers.values()) window.clearTimeout(timer);
    this.timestampTimers.clear();
    // Cancel the one-shot startup Nextcloud sync if it hasn't fired yet.
    if (this.startupSyncTimer != null) { window.clearTimeout(this.startupSyncTimer); this.startupSyncTimer = null; }
  }

  /** Export readable source assertions as a non-authoritative Graphiti projection.
   * Canonical episode UUIDs identify sources; ingestion receipts map derived IDs. Later supersession state
   * is not back-propagated into earlier episodes. */
  async exportGraphitiEpisodes(): Promise<void> {
    const episodes = await this.agentApi.qEpisodes();
    await this.app.vault.adapter.write("graphiti-episodes.json", JSON.stringify(episodes, null, 2));
    await this.app.vault.adapter.write("graphiti-ingestion-profile.json", JSON.stringify(graphitiIngestionProfile({ combinedExtraction: this.agentSettings.graphitiCombinedExtraction }), null, 2));
    await this.app.vault.adapter.write("graphiti-ingest-sample.py", GRAPHITI_INGEST_SCRIPT);
    new Notice(`Kosmos-Oden: exported ${episodes.length} KGCP/Graphiti episodes, ingestion profile, and pinned sample script`);
  }
}
