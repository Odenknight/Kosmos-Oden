/**
 * Semantic search (0.9.5) — the main-thread service.
 *
 * Owns the worker, keeps the index in step with the notes, and answers
 * "which notes are close in meaning to this question?" for the Librarian.
 *
 * It decides nothing about access: every question arrives with the set of
 * notes the requester may see, and that set is passed to the worker, which
 * compares nothing outside it. The Librarian then drops any candidate that is
 * not in the requester's pool a second time.
 *
 * Pure apart from the injected worker, files and clock, so it is tested in
 * Node with a fake worker.
 */
import type { ActiveModel } from "./catalog";
import { contentKey } from "./chunker";
import type { NoteInput, RelatedHit } from "./engine";
import { STANDS_OUT, type SemanticHit } from "./store";
import type { LoadResult, SemanticReply, SemanticRequest } from "./worker";

export interface SemanticWorkerLike {
  onmessage: ((event: { data: SemanticReply }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  postMessage(message: SemanticRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface SemanticNote { path: string; title: string; raw: string }

/** The notes to keep embedded. Implemented over the Personal Notes corpus. */
export interface SemanticNoteSource {
  notes(): Iterable<SemanticNote>;
  get(path: string): SemanticNote | null;
  /**
   * False while the notes are still being read (at start-up). Until it is
   * true nothing is compared with the stored index, so a vault that has not
   * loaded yet is never mistaken for an empty one. Absent = always ready.
   */
  ready?(): boolean;
}

export interface ModelBytes { model: ArrayBuffer; tokenizer: string; tokenizerConfig: string }

export interface SemanticServiceOptions {
  createWorker(): SemanticWorkerLike;
  source: SemanticNoteSource;
  /** The stored database for `modelKey`, or null. */
  readDatabase(modelKey: string): Promise<ArrayBuffer | null>;
  writeDatabase(modelKey: string, bytes: ArrayBuffer): Promise<void>;
  onChange?(): void;
  now?: () => number;
  /** Milliseconds between saves while indexing. Default 60 s. */
  saveEveryMs?: number;
  setTimeout?: (run: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export type SemanticState = "off" | "loading" | "indexing" | "ready" | "error";

export interface SemanticStatus {
  state: SemanticState;
  /** Display name of the loaded (or loading) model. */
  model: string;
  modelKey: string;
  dims: number;
  /** Notes embedded and stored. */
  indexedNotes: number;
  chunks: number;
  /** Notes waiting to be embedded. */
  pendingNotes: number;
  /** Notes in the source. */
  totalNotes: number;
  /** Set when state is "error". */
  error: string;
  /** True when a stored index was discarded on load (another model, or unreadable). */
  rebuilt: boolean;
  /** Notes that failed to embed; they are retried when they change. */
  failedNotes: number;
}

export const SERVICE_LIMITS = {
  /** Notes sent to the worker per request. */
  batchNotes: 6,
  batchChars: 120_000,
  /** Notes a question may bring back, at most. */
  candidates: 12,
  /** A candidate must come this close to the best one (see SemanticHit.lead). */
  minLead: STANDS_OUT,
  relatedPerSource: 3,
  relatedSources: 3,
} as const;

const EMPTY: SemanticStatus = { state: "off", model: "", modelKey: "", dims: 0, indexedNotes: 0, chunks: 0, pendingNotes: 0, totalNotes: 0, error: "", rebuilt: false, failedNotes: 0 };

export class SemanticService {
  private worker: SemanticWorkerLike | null = null;
  private nextId = 1;
  private readonly waiting = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  private _status: SemanticStatus = { ...EMPTY };
  /** path -> change key of what the worker has stored. */
  private manifest = new Map<string, string>();
  /** Paths to look at again. */
  private readonly dirty = new Set<string>();
  private fullScan = false;
  private pumping: Promise<void> | null = null;
  private session = 0;
  private lastSave = 0;
  private unsaved = false;
  private readonly failed = new Map<string, string>();
  private paused = false;
  /** The note source was not ready; wait for noteChanges() instead of spinning. */
  private waitingForNotes = false;

  constructor(private readonly options: SemanticServiceOptions) {}

  status(): SemanticStatus { return { ...this._status }; }

  /** True when a question can be answered by meaning now (the index may still be filling). */
  get searchable(): boolean { return this._status.state === "ready" || this._status.state === "indexing"; }

  private set(patch: Partial<SemanticStatus>): void {
    this._status = { ...this._status, ...patch };
    this.options.onChange?.();
  }

  private call<T>(request: Record<string, unknown> & { op: SemanticRequest["op"] }, transfer?: Transferable[]): Promise<T> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error("semantic search is not running"));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.waiting.set(id, { resolve: resolve as (value: unknown) => void, reject });
      try { worker.postMessage({ ...request, id } as SemanticRequest, transfer); }
      catch (error) { this.waiting.delete(id); reject(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  private failAll(message: string): void {
    for (const w of this.waiting.values()) w.reject(new Error(message));
    this.waiting.clear();
  }

  /**
   * Load a model and its stored index, then bring the index up to date.
   * Resolves once the model is loaded (indexing continues in the background);
   * rejects, with state "error", when the model cannot be used.
   */
  async start(model: ActiveModel, files: ModelBytes): Promise<void> {
    await this.stop();
    const session = ++this.session;
    this.set({ ...EMPTY, state: "loading", model: model.label, modelKey: model.key });
    try {
      const worker = this.options.createWorker();
      this.worker = worker;
      worker.onmessage = (event) => {
        const reply = event.data;
        const w = this.waiting.get(reply?.id);
        if (!w) return;
        this.waiting.delete(reply.id);
        if (reply.ok === true) w.resolve(reply.result); else w.reject(new Error(reply.error));
      };
      worker.onerror = (event) => {
        if (this.worker !== worker) return;
        const message = (event as { message?: string } | null)?.message || "the semantic search worker stopped unexpectedly";
        this.failAll(message);
        try { worker.terminate(); } catch { /* already gone */ }
        this.worker = null;
        this.set({ state: "error", error: message });
      };
      const database = await this.options.readDatabase(model.key).catch(() => null);
      if (session !== this.session) return;
      const transfer: Transferable[] = [files.model];
      if (database) transfer.push(database);
      const loaded = await this.call<LoadResult>({ op: "load", model: files.model, tokenizer: files.tokenizer, tokenizerConfig: files.tokenizerConfig, recipe: { dims: model.dims, pooling: model.pooling, maxTokens: model.maxTokens, queryPrefix: model.queryPrefix, passagePrefix: model.passagePrefix }, modelKey: model.key, database }, transfer);
      if (session !== this.session) return;
      this.manifest = new Map(Object.entries(await this.call<Record<string, string>>({ op: "manifest" })));
      if (session !== this.session) return;
      this.failed.clear();
      this.unsaved = loaded.rebuilt;
      this.lastSave = (this.options.now ?? Date.now)();
      this.set({ state: "indexing", dims: loaded.dims, indexedNotes: loaded.notes, chunks: loaded.chunks, rebuilt: loaded.rebuilt, error: "" });
      this.fullScan = true;
      this.pump();
    } catch (error) {
      if (session !== this.session) return;
      const message = error instanceof Error ? error.message : String(error);
      try { this.worker?.terminate(); } catch { /* already gone */ }
      this.worker = null;
      this.failAll(message);
      this.set({ state: "error", error: message });
      throw new Error(message);
    }
  }

  /** Save what is unsaved, then stop the worker. The stored index stays on disk. */
  async stop(): Promise<void> {
    const worker = this.worker;
    this.session++;
    if (worker) {
      if (this.searchable) await this.save().catch(() => undefined);
      this.worker = null;
      this.failAll("semantic search was stopped");
      try { worker.terminate(); } catch { /* already gone */ }
    }
    await this.pumping?.catch(() => undefined);
    this.manifest.clear();
    this.dirty.clear();
    this.failed.clear();
    this.fullScan = false;
    this.unsaved = false;
    this.waitingForNotes = false;
    this._status = { ...EMPTY };
    this.options.onChange?.();
  }

  /** Pause or resume embedding. Questions are still answered from what is indexed. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) this.pump();
    this.options.onChange?.();
  }
  get isPaused(): boolean { return this.paused; }

  /** Notes changed. `paths` null = look at every note again. */
  noteChanges(paths: readonly string[] | null): void {
    if (!this.searchable) return;
    this.waitingForNotes = false;
    if (paths === null) this.fullScan = true;
    else for (const p of paths) this.dirty.add(p);
    this.pump();
  }

  /** Discard every vector and embed the vault again. */
  async rebuild(): Promise<void> {
    if (!this.searchable) return;
    // Stop the current pass at its next batch instead of waiting for the whole vault.
    const wasPaused = this.paused;
    this.paused = true;
    try { await this.pumping?.catch(() => undefined); } finally { this.paused = wasPaused; }
    if (!this.searchable) return;
    const paths = [...this.manifest.keys()];
    if (paths.length) await this.call({ op: "remove", paths });
    this.manifest.clear();
    this.failed.clear();
    this.unsaved = true;
    this.fullScan = true;
    this.set({ state: "indexing", indexedNotes: 0, chunks: 0, failedNotes: 0 });
    this.pump();
  }

  /** Resolves when nothing is waiting to be embedded (or indexing is paused or stopped). */
  async idle(): Promise<void> {
    while (this.pumping) await this.pumping.catch(() => undefined);
  }

  private pump(): void {
    if (this.pumping || !this.searchable || this.paused) return;
    const session = this.session;
    this.pumping = this.run(session)
      .catch((error) => {
        if (session !== this.session) return;
        this.set({ state: "error", error: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        this.pumping = null;
        if (session === this.session && this.searchable && !this.paused && !this.waitingForNotes && (this.fullScan || this.dirty.size)) this.pump();
      });
  }

  private async run(session: number): Promise<void> {
    const live = () => session === this.session && this.worker !== null && !this.paused;
    const now = this.options.now ?? Date.now;
    while (live() && (this.fullScan || this.dirty.size)) {
      if (this.options.source.ready?.() === false) {
        // Everything is looked at once the notes have loaded.
        this.fullScan = true;
        this.dirty.clear();
        this.waitingForNotes = true;
        return;
      }
      /* What differs between the notes and the stored index. */
      const upserts: NoteInput[] = [];
      const deletes: string[] = [];
      let total = this._status.totalNotes;
      if (this.fullScan) {
        this.fullScan = false;
        this.dirty.clear();
        const present = new Set<string>();
        total = 0;
        for (const note of this.options.source.notes()) {
          total++;
          present.add(note.path);
          const key = contentKey(note.raw, note.title);
          if (this.manifest.get(note.path) !== key && this.failed.get(note.path) !== key) upserts.push({ path: note.path, key, title: note.title, raw: note.raw });
        }
        for (const path of this.manifest.keys()) if (!present.has(path)) deletes.push(path);
        for (const path of [...this.failed.keys()]) if (!present.has(path)) this.failed.delete(path);
      } else {
        const paths = [...this.dirty];
        this.dirty.clear();
        for (const path of paths) {
          const note = this.options.source.get(path);
          if (!note) { this.failed.delete(path); if (this.manifest.has(path)) { deletes.push(path); total = Math.max(0, total - 1); } continue; }
          if (!this.manifest.has(path)) total++;
          const key = contentKey(note.raw, note.title);
          if (this.manifest.get(path) !== key && this.failed.get(path) !== key) upserts.push({ path, key, title: note.title, raw: note.raw });
        }
      }
      /* A renamed note (same text, new path) keeps its vectors. */
      const gone = new Map<string, string>();
      for (const path of deletes) gone.set(this.manifest.get(path)!, path);
      const remaining: NoteInput[] = [];
      for (const note of upserts) {
        const from = this.manifest.has(note.path) ? undefined : gone.get(note.key);
        if (from !== undefined && await this.call<boolean>({ op: "rename", from, to: note.path })) {
          gone.delete(note.key);
          this.manifest.delete(from);
          this.manifest.set(note.path, note.key);
          deletes.splice(deletes.indexOf(from), 1);
          this.unsaved = true;
        } else remaining.push(note);
        if (!live()) return;
      }
      if (deletes.length) {
        await this.call({ op: "remove", paths: deletes });
        for (const path of deletes) this.manifest.delete(path);
        this.unsaved = true;
      }
      if (!live()) return;
      this.set({ state: remaining.length ? "indexing" : this._status.state, totalNotes: total, pendingNotes: remaining.length, indexedNotes: this.manifest.size, failedNotes: this.failed.size });

      /* Embed in small batches, so progress shows and a question never waits long. */
      let at = 0;
      while (at < remaining.length) {
        if (!live()) { for (const note of remaining.slice(at)) this.dirty.add(note.path); return; }
        const batch: NoteInput[] = [];
        let chars = 0;
        while (at < remaining.length && batch.length < SERVICE_LIMITS.batchNotes && (batch.length === 0 || chars + remaining[at].raw.length <= SERVICE_LIMITS.batchChars)) {
          chars += remaining[at].raw.length;
          batch.push(remaining[at++]);
        }
        let chunks = 0;
        try {
          chunks = (await this.call<{ chunks: number }>({ op: "index", notes: batch })).chunks;
          for (const note of batch) { this.manifest.set(note.path, note.key); this.failed.delete(note.path); }
        } catch (error) {
          if (!live()) return;
          // One bad note must not stop the rest: retry the batch note by note.
          for (const note of batch) {
            try {
              chunks += (await this.call<{ chunks: number }>({ op: "index", notes: [note] })).chunks;
              this.manifest.set(note.path, note.key);
              this.failed.delete(note.path);
            } catch (inner) {
              if (!live()) return;
              this.failed.set(note.path, note.key);
            }
          }
        }
        this.unsaved = true;
        this.set({ pendingNotes: remaining.length - at, indexedNotes: this.manifest.size, chunks: this._status.chunks + chunks, failedNotes: this.failed.size });
        if (now() - this.lastSave >= (this.options.saveEveryMs ?? 60_000)) await this.save().catch(() => undefined);
      }
    }
    if (!live()) return;
    const stats = await this.call<{ notes: number; chunks: number }>({ op: "stats" });
    if (this.unsaved) await this.save().catch(() => undefined);
    if (session !== this.session) return;
    this.set({ state: "ready", pendingNotes: 0, indexedNotes: stats.notes, chunks: stats.chunks, failedNotes: this.failed.size });
  }

  /** Write the database file. */
  async save(): Promise<void> {
    if (!this.worker || !this._status.modelKey) return;
    const key = this._status.modelKey;
    const bytes = await this.call<ArrayBuffer>({ op: "export" });
    await this.options.writeDatabase(key, bytes);
    this.unsaved = false;
    this.lastSave = (this.options.now ?? Date.now)();
  }

  /**
   * Notes closest in meaning to the question, best first, never outside
   * `allowed`: the best one and those near it, a dozen at most.
   *
   * "Closest" is all this can say. A question the notes do not answer still
   * has a closest note, and its score looks no different (see
   * SemanticHit.lead), so a caller must not present these as matches on
   * their own; the Librarian marks a note found this way only.
   */
  async candidates(question: string, allowed: ReadonlySet<string> | null): Promise<SemanticHit[]> {
    if (!this.searchable) return [];
    const hits = await this.call<SemanticHit[]>({ op: "query", question, allowed: allowed ? [...allowed] : null, limit: SERVICE_LIMITS.candidates });
    const kept = hits.filter((h) => h.lead >= SERVICE_LIMITS.minLead);
    // Defence in depth: the worker already compared only allowed notes.
    return allowed ? kept.filter((h) => allowed.has(h.path)) : kept;
  }

  /** Notes close in meaning to the given notes (which are excluded), never outside `allowed`. */
  async related(sources: readonly string[], allowed: ReadonlySet<string> | null, limit: number): Promise<RelatedHit[]> {
    if (!this.searchable || !sources.length) return [];
    const picked = sources.slice(0, SERVICE_LIMITS.relatedSources);
    const hits = await this.call<RelatedHit[]>({ op: "related", sources: picked, allowed: allowed ? [...allowed] : null, perSource: SERVICE_LIMITS.relatedPerSource, limit });
    return allowed ? hits.filter((h) => allowed.has(h.path)) : hits;
  }
}
