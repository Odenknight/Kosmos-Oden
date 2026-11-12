/**
 * Personal Notes (0.9.0) — in-memory corpus of raw Markdown records.
 *
 * Built from a PersonalVaultSource on startup and kept current from vault
 * events. Disposable: nothing is persisted. Records are frozen and shared by
 * reference (search worker client, graph, read service), so an edit replaces
 * one record without rebuilding unrelated ones.
 *
 * Limits (PERSONAL_LIMITS): 4 concurrent reads, files over 5 MiB UTF-8 are
 * skipped whole (`too_large`), the aggregate budget is 128 MiB (`budget`),
 * unreadable files are recorded. A prefix is never stored.
 */
import { utf8Length } from "./fulltext";
import {
  PERSONAL_LIMITS,
  type CorpusOmission,
  type CorpusState,
  type PersonalCorpus,
  type PersonalFileStat,
  type PersonalNoteRecord,
  type PersonalVaultSource,
} from "./types";

/** Injected timers so debounce behaviour is deterministic in tests. */
export interface CorpusTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realTimers: CorpusTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Trailing debounce with a maximum wait: fires `debounceMs` after the last poke, and at most `maxWaitMs` after the first. */
export class EditScheduler {
  private trailing: unknown = null;
  private maxWait: unknown = null;
  constructor(
    private readonly run: () => void,
    private readonly timers: CorpusTimers = realTimers,
    private readonly debounceMs: number = PERSONAL_LIMITS.editDebounceMs,
    private readonly maxWaitMs: number = PERSONAL_LIMITS.editMaxWaitMs,
  ) {}

  poke(): void {
    if (this.trailing !== null) this.timers.clearTimeout(this.trailing);
    this.trailing = this.timers.setTimeout(() => this.fire(), this.debounceMs);
    if (this.maxWait === null) this.maxWait = this.timers.setTimeout(() => this.fire(), this.maxWaitMs);
  }

  get pending(): boolean { return this.trailing !== null; }

  cancel(): void {
    if (this.trailing !== null) this.timers.clearTimeout(this.trailing);
    if (this.maxWait !== null) this.timers.clearTimeout(this.maxWait);
    this.trailing = this.maxWait = null;
  }

  private fire(): void {
    this.cancel();
    this.run();
  }
}

export interface CorpusChange {
  created?: readonly string[];
  modified?: readonly string[];
  deleted?: readonly string[];
  renamed?: readonly { from: string; to: string }[];
}

export interface CorpusOmitted { path: string; reason: CorpusOmission }

/** One published revision. `reset` = complete snapshot in `upserts` (path order). */
export interface CorpusDelta {
  revision: number;
  reset: boolean;
  upserts: readonly PersonalNoteRecord[];
  deletes: readonly string[];
  state: CorpusState;
  omitted: readonly CorpusOmitted[];
}

export interface MemoryCorpusOptions {
  /** Paths the corpus may hold at all (e.g. not Kosmos operational files). Default: everything. */
  include?: (path: string) => boolean;
  timers?: CorpusTimers;
  limits?: Partial<Pick<typeof PERSONAL_LIMITS, "maxFileBytes" | "maxCorpusBytes" | "readConcurrency" | "editDebounceMs" | "editMaxWaitMs">>;
}

type ReadResult =
  | { path: string; kind: "gone" }
  | { path: string; kind: "omit"; reason: CorpusOmission }
  | { path: string; kind: "ok"; record: PersonalNoteRecord; bytes: number };

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

async function pool<T, R>(items: readonly T[], width: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const lane = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } };
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, lane));
  return out;
}

function freezeRecord(stat: PersonalFileStat, raw: string, bytes: number, meta: PersonalNoteRecord["meta"]): PersonalNoteRecord {
  for (const value of Object.values(meta)) if (Array.isArray(value)) Object.freeze(value);
  Object.freeze(meta);
  return Object.freeze({ path: stat.path, mtimeMs: stat.mtimeMs, sizeBytes: bytes, raw, meta });
}

export class MemoryCorpus implements PersonalCorpus {
  private _revision = 0;
  private _state: CorpusState = "indexing";
  private byPath = new Map<string, PersonalNoteRecord>();
  private bytes = new Map<string, number>();
  private totalBytes = 0;
  private omissions = new Map<string, CorpusOmission>();
  private uids = new Map<string, Set<string>>();
  private sorted: string[] | null = [];
  private omittedList: CorpusOmitted[] | null = [];
  private readonly listeners = new Set<(delta: CorpusDelta) => void>();
  private readonly pending = new Set<string>();
  /** path -> tick of its last invalidation; a read started before that tick is discarded. */
  private invalidated = new Map<string, number>();
  private tick = 0;
  private chain: Promise<void> = Promise.resolve();
  private disposed = false;
  private building = false;
  private readonly include: (path: string) => boolean;
  private readonly limits: Required<NonNullable<MemoryCorpusOptions["limits"]>>;
  private readonly scheduler: EditScheduler;

  constructor(private readonly source: PersonalVaultSource, options: MemoryCorpusOptions = {}) {
    this.include = options.include ?? (() => true);
    this.limits = {
      maxFileBytes: PERSONAL_LIMITS.maxFileBytes,
      maxCorpusBytes: PERSONAL_LIMITS.maxCorpusBytes,
      readConcurrency: PERSONAL_LIMITS.readConcurrency,
      editDebounceMs: PERSONAL_LIMITS.editDebounceMs,
      editMaxWaitMs: PERSONAL_LIMITS.editMaxWaitMs,
      ...options.limits,
    };
    this.scheduler = new EditScheduler(() => void this.flush(), options.timers ?? realTimers, this.limits.editDebounceMs, this.limits.editMaxWaitMs);
  }

  /* ------------------------------------------------------------ PersonalCorpus */

  get revision(): number { return this._revision; }
  get state(): CorpusState { return this._state; }
  get(path: string): PersonalNoteRecord | undefined { return this.byPath.get(path); }

  paths(): string[] {
    if (!this.sorted) this.sorted = [...this.byPath.keys()].sort(byCodeUnit);
    return this.sorted.slice();
  }

  /** Records in path order, by reference (frozen). */
  *records(): IterableIterator<PersonalNoteRecord> {
    if (!this.sorted) this.sorted = [...this.byPath.keys()].sort(byCodeUnit);
    for (const p of this.sorted) yield this.byPath.get(p)!;
  }

  omitted(): ReadonlyArray<CorpusOmitted> {
    if (!this.omittedList) this.omittedList = [...this.omissions].map(([path, reason]) => ({ path, reason })).sort((a, b) => byCodeUnit(a.path, b.path));
    return this.omittedList;
  }

  pathsByUid(uid: string): string[] {
    return [...(this.uids.get(uid) ?? [])].sort(byCodeUnit);
  }

  /** Called synchronously after every published revision. Returns an unsubscribe function. */
  subscribe(listener: (delta: CorpusDelta) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Full delta describing the current revision (for a new subscriber or a restarted worker). */
  snapshot(): CorpusDelta {
    return { revision: this._revision, reset: true, upserts: [...this.records()], deletes: [], state: this._state, omitted: this.omitted() };
  }

  /* ------------------------------------------------------------------ updates */

  /** Rebuild from the vault. Previous records stay readable until the new revision is published. */
  build(): Promise<void> {
    return this.enqueue(() => this.rebuild());
  }

  /**
   * Record vault events. Deleted and renamed-away paths are invalidated now;
   * created/modified/renamed-to paths are re-read after the edit debounce.
   */
  apply(change: CorpusChange): void {
    if (this.disposed) return;
    const gone = [...(change.deleted ?? []), ...(change.renamed ?? []).map((r) => r.from)];
    const reread = [...(change.created ?? []), ...(change.modified ?? []), ...(change.renamed ?? []).map((r) => r.to)];
    const deletes: string[] = [];
    for (const path of gone) {
      this.invalidated.set(path, ++this.tick);
      if (this.drop(path)) deletes.push(path);
    }
    if (deletes.length) this.publish(false, [], deletes);
    let queued = false;
    for (const path of reread) if (this.include(path)) { this.pending.add(path); queued = true; }
    if (queued) this.scheduler.poke();
  }

  /** Re-read pending paths now instead of waiting for the debounce. */
  flush(): Promise<void> {
    this.scheduler.cancel();
    return this.enqueue(() => this.refresh());
  }

  /** Resolves when every queued build/flush has finished. */
  whenIdle(): Promise<void> { return this.chain; }

  dispose(): void {
    this.disposed = true;
    this.scheduler.cancel();
    this.listeners.clear();
    this.pending.clear();
  }

  /* ---------------------------------------------------------------- internals */

  private enqueue(op: () => Promise<void>): Promise<void> {
    const next = this.chain.then(async () => {
      if (this.disposed) return;
      try { await op(); } finally { this.invalidated.clear(); }
    });
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async read(stat: PersonalFileStat, startTick: number): Promise<ReadResult> {
    const path = stat.path;
    if (stat.sizeBytes > this.limits.maxFileBytes) return { path, kind: "omit", reason: "too_large" };
    let raw: string;
    try { raw = await this.source.readRaw(path); } catch { return this.source.stat(path) ? { path, kind: "omit", reason: "unreadable" } : { path, kind: "gone" }; }
    if ((this.invalidated.get(path) ?? 0) > startTick) return { path, kind: "gone" };
    const bytes = utf8Length(raw);
    if (bytes > this.limits.maxFileBytes) return { path, kind: "omit", reason: "too_large" };
    const old = this.byPath.get(path);
    if (old && old.raw === raw) return { path, kind: "ok", record: old, bytes };
    let meta: PersonalNoteRecord["meta"];
    try { meta = this.source.meta(path, raw); } catch { return { path, kind: "omit", reason: "unreadable" }; }
    return { path, kind: "ok", record: freezeRecord(stat, raw, bytes, meta), bytes };
  }

  private async rebuild(): Promise<void> {
    this.building = true;
    try { await this.rebuildInner(); } finally { this.building = false; }
  }

  private async rebuildInner(): Promise<void> {
    this._state = "indexing";
    this.pending.clear(); // the rebuild reads everything; later events re-queue themselves
    const startTick = this.tick;
    const stats = this.source.listMarkdown().filter((s) => this.include(s.path)).sort((a, b) => byCodeUnit(a.path, b.path));
    // Reserve the budget from stat sizes in path order so peak memory stays bounded.
    let reserved = 0;
    const toRead: PersonalFileStat[] = [];
    const early = new Map<string, CorpusOmission>();
    for (const s of stats) {
      if (s.sizeBytes > this.limits.maxFileBytes) early.set(s.path, "too_large");
      else if (reserved + s.sizeBytes > this.limits.maxCorpusBytes) early.set(s.path, "budget");
      else { reserved += s.sizeBytes; toRead.push(s); }
    }
    const results = await pool(toRead, this.limits.readConcurrency, (s) => this.read(s, startTick));
    if (this.disposed) return;
    const readByPath = new Map(results.map((r) => [r.path, r]));
    const records = new Map<string, PersonalNoteRecord>();
    const bytes = new Map<string, number>();
    const omissions = new Map<string, CorpusOmission>();
    let total = 0;
    for (const s of stats) {
      if ((this.invalidated.get(s.path) ?? 0) > startTick) continue; // deleted while building
      const r = readByPath.get(s.path);
      if (!r) { omissions.set(s.path, early.get(s.path)!); continue; }
      if (r.kind === "gone") continue;
      if (r.kind === "omit") { omissions.set(r.path, r.reason); continue; }
      if (total + r.bytes > this.limits.maxCorpusBytes) { omissions.set(r.path, "budget"); continue; }
      total += r.bytes;
      records.set(r.path, r.record);
      bytes.set(r.path, r.bytes);
    }
    this.byPath = records;
    this.bytes = bytes;
    this.totalBytes = total;
    this.omissions = omissions;
    this.uids = new Map();
    for (const r of records.values()) this.indexUid(r, true);
    this.building = false;
    this.publish(true, [], []);
  }

  private async refresh(): Promise<void> {
    if (!this.pending.size) return;
    const paths = [...this.pending].sort(byCodeUnit);
    this.pending.clear();
    const startTick = this.tick;
    const results = await pool(paths, this.limits.readConcurrency, async (path): Promise<ReadResult> => {
      const stat = this.source.stat(path);
      return stat ? this.read(stat, startTick) : { path, kind: "gone" };
    });
    if (this.disposed) return;
    const upserts: PersonalNoteRecord[] = [];
    const deletes: string[] = [];
    let omissionsChanged = false;
    for (const r of results) {
      if ((this.invalidated.get(r.path) ?? 0) > startTick) continue;
      if (r.kind === "ok" && this.byPath.get(r.path) === r.record) continue; // same raw: no revision
      const had = this.drop(r.path);
      if (r.kind === "gone") { if (had) deletes.push(r.path); continue; }
      if (r.kind === "omit" || this.totalBytes + r.bytes > this.limits.maxCorpusBytes) {
        this.omissions.set(r.path, r.kind === "omit" ? r.reason : "budget");
        omissionsChanged = true;
        if (had) deletes.push(r.path);
        continue;
      }
      this.byPath.set(r.path, r.record);
      this.bytes.set(r.path, r.bytes);
      this.totalBytes += r.bytes;
      this.indexUid(r.record, true);
      this.sorted = null;
      upserts.push(r.record);
    }
    if (upserts.length || deletes.length || omissionsChanged) this.publish(false, upserts, deletes);
  }

  /** Remove a path's record and omission. True when anything was removed. */
  private drop(path: string): boolean {
    let changed = false;
    const old = this.byPath.get(path);
    if (old) {
      this.indexUid(old, false);
      this.byPath.delete(path);
      this.totalBytes -= this.bytes.get(path) ?? 0;
      this.bytes.delete(path);
      this.sorted = null;
      changed = true;
    }
    if (this.omissions.delete(path)) { this.omittedList = null; changed = true; }
    return changed;
  }

  private indexUid(record: PersonalNoteRecord, add: boolean): void {
    const uid = record.meta.uid;
    if (!uid) return;
    let set = this.uids.get(uid);
    if (add) { if (!set) this.uids.set(uid, (set = new Set())); set.add(record.path); }
    else if (set) { set.delete(record.path); if (!set.size) this.uids.delete(uid); }
  }

  /** Atomically publish one revision and notify subscribers synchronously. */
  private publish(reset: boolean, upserts: PersonalNoteRecord[], deletes: string[]): void {
    this.sorted = null;
    this.omittedList = null;
    this._revision++;
    this._state = this.building ? "indexing" : this.omissions.size ? "partial" : "ready";
    const delta: CorpusDelta = reset
      ? this.snapshot()
      : { revision: this._revision, reset: false, upserts, deletes, state: this._state, omitted: this.omitted() };
    for (const listener of [...this.listeners]) listener(delta);
  }
}
