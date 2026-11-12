/**
 * Personal Notes (0.9.0) — the plugin-side runtime and device-local state.
 *
 * PersonalRuntime owns the in-memory corpus, the search worker client, the
 * policy generation, the lazily cached read policy, the query service and the
 * PersonalAgentRuntime handed to the Agent API server. Nothing here is
 * persisted; dispose() releases the worker, its Blob URL and every listener.
 *
 * PersonalDeviceState keeps the Personal bearer token and the "Start when
 * Obsidian opens" choice on this device only (secret storage / vault-scoped
 * localStorage), namespaced by plugin id and canonical vault identity. Never
 * in data.json, vault notes or copied settings.
 */
import { SENSITIVITY_RANK } from "gkos-engine";
import { MemoryCorpus } from "../personal-notes/corpus";
import { lineageView } from "../personal-notes/lineage";
import { PolicyGeneration, createPersonalReadPolicy, decidePersonalRead } from "../personal-notes/policy";
import { PersonalQueryService, type PersonalProtocolInfo } from "../personal-notes/query-service";
import type { PersonalSearchStatus } from "../personal-notes/plugin-host";
import type { PersonalReadPolicy, PersonalSearch, PersonalVaultSource } from "../personal-notes/types";
import { PersonalSearchClient, type WorkerLike } from "../personal-notes/worker-client";
import { isKosmosOperationalPath } from "../operational-paths";
import { PERSONAL_REST_ROUTES, type AgentSettings, type PersonalAgentRuntime } from "./agent-server";
import { advertisedMcpProtocolVersions } from "./mcp-compat";
import type { SearchWorkerFactory } from "./personal-search-worker-url";

/** MCP revisions per transport and REST routes, as served with the current Personal settings. */
export function personalProtocols(settings: AgentSettings): PersonalProtocolInfo {
  const older = settings.personalNotes?.connection?.acceptOlderMcp !== false;
  return {
    mcp: { "streamable-http": advertisedMcpProtocolVersions("http", older), stdio: advertisedMcpProtocolVersions("stdio", older) },
    rest: Object.keys(PERSONAL_REST_ROUTES),
  };
}

export interface PersonalRuntimeOptions {
  source: PersonalVaultSource;
  /** Live settings (read on every use, so a change needs only a generation bump). */
  settings: () => AgentSettings;
  /** The vault's configuration directory (`vault.configDir`). */
  configDir: string;
  workers: SearchWorkerFactory;
  onDiagnostic?: (message: string) => void;
}

/** Forwards a worker unchanged and reports a failure (error, message error, fatal) to status listeners after the client has handled it. */
class NotifyingWorker implements WorkerLike {
  onmessage: WorkerLike["onmessage"] = null;
  onerror: WorkerLike["onerror"] = null;
  onmessageerror: ((event: unknown) => void) | null = null;
  constructor(private readonly inner: WorkerLike, notify: () => void) {
    inner.onmessage = (event) => { this.onmessage?.(event); if (event.data?.type === "fatal") notify(); };
    inner.onerror = (event) => { this.onerror?.(event); notify(); };
    inner.onmessageerror = (event) => { this.onmessageerror?.(event); notify(); };
  }
  postMessage(message: Parameters<WorkerLike["postMessage"]>[0]): void { this.inner.postMessage(message); }
  terminate(): void { this.inner.terminate(); }
}

const sameSet =(a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x));

export class PersonalRuntime {
  readonly generation = new PolicyGeneration();
  readonly corpus: MemoryCorpus;
  readonly search: PersonalSearchClient;
  readonly service: PersonalQueryService;
  private cachedPolicy: PersonalReadPolicy | null = null;
  /** Allowed-path Set reused while the policy generation and corpus revision are unchanged, so the worker keeps one scope. */
  private allowed: { key: string; set: ReadonlySet<string> } | null = null;
  private shared: { key: string; count: number } | null = null;
  private readonly statusListeners = new Set<() => void>();
  private readonly unsubscribe: () => void;
  private agent: PersonalAgentRuntime | null = null;
  private disposed = false;

  constructor(private readonly options: PersonalRuntimeOptions) {
    this.corpus = new MemoryCorpus(options.source, { include: (p) => !isKosmosOperationalPath(p) });
    this.search = new PersonalSearchClient({ corpus: this.corpus, createWorker: () => new NotifyingWorker(options.workers.create(), () => this.notify()), release: () => options.workers.release() });
    const scoped: PersonalSearch = {
      search: (req) => this.search.search(req.allowedPaths ? { ...req, allowedPaths: this.canonical(req.allowedPaths) } : req),
    };
    this.service = new PersonalQueryService({
      source: options.source,
      corpus: this.corpus,
      search: scoped,
      policy: () => this.policy(),
      sensitivityRank: SENSITIVITY_RANK,
      ceiling: () => options.settings().agentSensitivityCeiling,
      lineage: lineageView,
      protocols: () => personalProtocols(options.settings()),
      onDiagnostic: options.onDiagnostic,
    });
    this.unsubscribe = this.corpus.subscribe(() => this.notify());
  }

  /** The read policy for the current generation. Built lazily and cached per generation (the server bumps it too). */
  policy(): PersonalReadPolicy {
    const generation = this.generation.current;
    if (!this.cachedPolicy || this.cachedPolicy.generation !== generation) {
      this.cachedPolicy = createPersonalReadPolicy({
        settings: this.options.settings().personalNotes,
        generation,
        configDir: this.options.configDir,
        isOperationalPath: isKosmosOperationalPath,
      });
    }
    return this.cachedPolicy;
  }

  /** The runtime injected into the Agent API server. Same object on every call. */
  agentRuntime(token: () => string): PersonalAgentRuntime {
    return (this.agent ??= { service: this.service, policy: () => this.policy(), generation: this.generation, token });
  }

  /** After a generation bump: reject in-flight searches from older generations. */
  syncSearchGeneration(): void { this.search.setPolicyGeneration(this.generation.current); }

  private key(): string { return `${this.generation.current}:${this.corpus.revision}`; }

  private canonical(set: ReadonlySet<string>): ReadonlySet<string> {
    const key = this.key();
    if (this.allowed && this.allowed.key === key && sameSet(this.allowed.set, set)) return this.allowed.set;
    this.allowed = { key, set };
    return set;
  }

  /** Notes an assistant can read now: the same policy + decidePersonalRead the service applies. */
  sharedNoteCount(): number {
    const key = this.key();
    if (this.shared?.key === key) return this.shared.count;
    const policy = this.policy();
    const ctx = { policy, source: this.options.source, sensitivityRank: SENSITIVITY_RANK, ceiling: this.options.settings().agentSensitivityCeiling };
    let count = 0;
    for (const record of this.corpus.records()) if (decidePersonalRead(record.path, record.meta, ctx).allowed) count++;
    this.shared = { key, count };
    return count;
  }

  /** First shared note in path order, for the connection self-test canary. */
  firstSharedNote(): { path: string; title: string } | null {
    const policy = this.policy();
    const ctx = { policy, source: this.options.source, sensitivityRank: SENSITIVITY_RANK, ceiling: this.options.settings().agentSensitivityCeiling };
    for (const record of this.corpus.records()) {
      if (decidePersonalRead(record.path, record.meta, ctx).allowed) return { path: record.path, title: record.meta.title };
    }
    return null;
  }

  build(): Promise<void> {
    const done = this.corpus.build().catch(() => undefined);
    this.notify(); // a rebuild is "indexing" until its revision is published
    return done;
  }

  status(): PersonalSearchStatus {
    if (this.search.status === "failed") return { state: "failed", notes: this.corpus.paths().length, omitted: this.corpus.omitted().length, error: this.search.error ?? "search stopped" };
    return { state: this.corpus.state, notes: this.corpus.paths().length, omitted: this.corpus.omitted().length };
  }

  onStatus(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => { this.statusListeners.delete(listener); };
  }

  notify(): void {
    for (const listener of [...this.statusListeners]) { try { listener(); } catch (e) { console.warn("Kosmos-Oden: search status listener failed", e); } }
  }

  retry(): void {
    if (this.disposed) return;
    void this.search.retry().catch(() => undefined).finally(() => this.notify());
    this.notify();
  }

  /** Terminate the worker, revoke its Blob URL, drop corpus timers and every listener. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.statusListeners.clear();
    this.search.dispose();
    this.corpus.dispose();
    this.agent = null;
  }
}

/* ----------------------------------------------------------- device-local */

/** The parts of Obsidian's App used for device-local state. */
export interface DeviceStorageHost {
  secretStorage?: { getSecret(id: string): string | null; setSecret(id: string, secret: string): void };
  loadLocalStorage?(key: string): unknown;
  saveLocalStorage?(key: string, data: unknown): void;
}

/** 64-bit FNV-1a (two 32-bit lanes) as 16 hex characters: a stable, non-secret namespace. */
export function deviceNamespace(pluginId: string, vaultIdentity: string): string {
  const source = `${pluginId}\0${vaultIdentity}`;
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < source.length; i++) {
    const c = source.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 16777619) ^ (a >>> 7);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

export class PersonalDeviceState {
  constructor(private readonly host: DeviceStorageHost, private readonly namespace: string) {}

  /** Secret storage id: lowercase alphanumeric with dashes, as SecretStorage requires. */
  get secretId(): string { return `kosmos-oden-personal-token-${this.namespace}`; }
  private localKey(name: string): string { return `kosmos-oden:${this.namespace}:${name}`; }

  private load(name: string): unknown {
    try { return this.host.loadLocalStorage?.(this.localKey(name)) ?? null; } catch { return null; }
  }
  private save(name: string, value: unknown): void {
    if (!this.host.saveLocalStorage) throw new Error("device-local storage is unavailable");
    this.host.saveLocalStorage(this.localKey(name), value);
  }

  /** The Personal token on this device, or "" when none exists yet. */
  token(): string {
    try {
      if (this.host.secretStorage) return this.host.secretStorage.getSecret(this.secretId) ?? "";
    } catch { return ""; }
    const v = this.load("personal-token");
    return typeof v === "string" ? v : "";
  }

  /** Secret storage where available; vault-scoped localStorage otherwise. */
  setToken(token: string): void {
    if (this.host.secretStorage) { this.host.secretStorage.setSecret(this.secretId, token); return; }
    this.save("personal-token", token || null);
  }

  /** "Start when Obsidian opens" on this device. Absent (fresh or synced device) = off. */
  autoStart(): boolean { return this.load("personal-autostart") === true; }
  setAutoStart(on: boolean): void { this.save("personal-autostart", on ? true : null); }
}
