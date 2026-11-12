/**
 * Personal Notes (0.9.0) — PersonalSearch implemented over the search worker.
 *
 * Mirrors a MemoryCorpus into the worker (a full snapshot once, then per-record
 * upserts/deletes, in chunks so no single postMessage blocks the UI thread),
 * sends each allowed-path set once and refers to it by id, and checks every
 * result against the active corpus revision and policy generation before
 * resolving. A worker failure rejects with PersonalError("search_unavailable");
 * `retry()` starts a fresh worker. There is no main-thread fallback scan.
 */
import type { CorpusDelta } from "./corpus";
import { parseQuery, resultLimit } from "./fulltext";
import { SCOPE_SLOTS, type FromWorker, type ToWorker, type WorkerDoc } from "./search-worker";
import { PersonalError, type PersonalNoteRecord, type PersonalSearch, type SearchRequest, type SearchResponse } from "./types";

/** The part of a Web Worker the client uses. A browser `Worker` satisfies it. */
export interface WorkerLike {
  postMessage(message: ToWorker): void;
  terminate(): void;
  onmessage: ((event: { data: FromWorker }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessageerror?: ((event: unknown) => void) | null;
}

/** What the client needs from the corpus (MemoryCorpus provides it). */
export interface CorpusFeed {
  readonly revision: number;
  subscribe(listener: (delta: CorpusDelta) => void): () => void;
  snapshot(): CorpusDelta;
}

export interface SearchClientOptions {
  corpus: CorpusFeed;
  createWorker: () => WorkerLike;
  /** Called once on dispose, e.g. to revoke the worker's Blob URL. */
  release?: () => void;
  /** Raw characters per mutation message. Default 1 Mi. */
  chunkChars?: number;
  /** Yield between chunks so the host thread stays responsive. Default setTimeout(0). */
  yieldToHost?: () => Promise<void>;
  /** Re-issues of one query after corpus changes before giving up. Default 8. */
  maxReissues?: number;
}

export type SearchClientStatus = "running" | "failed" | "disposed";

interface Pending {
  id: number;
  revision: number;
  generation: number;
  allowed: ReadonlySet<string> | null;
  query: string;
  limit: number;
  tag?: string;
  attempts: number;
  resolve(response: SearchResponse): void;
  reject(error: PersonalError): void;
}

const toWorkerDoc = (r: PersonalNoteRecord): WorkerDoc => {
  const doc: WorkerDoc = { path: r.path, title: r.meta.title, aliases: [...r.meta.aliases], tags: [...r.meta.tags], raw: r.raw };
  if (r.meta.uid !== undefined) doc.uid = r.meta.uid;
  if (r.meta.createdAt !== undefined) doc.createdAt = r.meta.createdAt;
  if (r.meta.updatedAt !== undefined) doc.updatedAt = r.meta.updatedAt;
  return doc;
};

const describe = (event: unknown): string => {
  if (event instanceof Error) return event.message;
  const message = (event as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : "search worker stopped";
};

export class PersonalSearchClient implements PersonalSearch {
  private worker: WorkerLike | null = null;
  private _status: SearchClientStatus = "running";
  private failure: string | null = null;
  private generation = 0;
  /** Last corpus revision fully posted to the current worker. Queries are tagged with it. */
  private sentRevision = -1;
  private appliedRevision = -1;
  private epoch = 0;
  private nextId = 1;
  private nextScopeId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly scopeIds = new Map<ReadonlySet<string>, number>();
  private waiters: { revision: number; resolve(): void; reject(e: PersonalError): void }[] = [];
  private sending: Promise<void> = Promise.resolve();
  private readonly unsubscribe: () => void;
  private readonly chunkChars: number;
  private readonly yieldToHost: () => Promise<void>;
  private readonly maxReissues: number;

  constructor(private readonly options: SearchClientOptions) {
    this.chunkChars = options.chunkChars ?? 1 << 20;
    this.yieldToHost = options.yieldToHost ?? (() => new Promise((resolve) => setTimeout(resolve, 0)));
    this.maxReissues = options.maxReissues ?? 8;
    this.start();
    this.unsubscribe = options.corpus.subscribe((delta) => this.enqueue(delta));
  }

  get status(): SearchClientStatus { return this._status; }
  /** Why the worker failed, when status is "failed". */
  get error(): string | null { return this.failure; }
  get policyGeneration(): number { return this.generation; }
  /** Corpus revision the worker will answer from. */
  get revision(): number { return this.sentRevision; }

  /** Move to a new policy generation: in-flight queries from older generations reject with "policy_changed". */
  setPolicyGeneration(generation: number): void {
    if (generation === this.generation) return;
    this.generation = generation;
    this.scopeIds.clear();
    for (const p of [...this.pending.values()]) {
      if (p.generation !== generation) this.settle(p, new PersonalError("policy_changed", "access policy changed while searching; repeat the query"), true);
    }
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    if (this._status !== "running") throw new PersonalError("search_unavailable", this.failure ?? "search is not running");
    const limit = resultLimit(request.limit);
    if (request.tag !== undefined && typeof request.tag !== "string") throw new PersonalError("invalid_argument", "tag must be a string");
    parseQuery(request.query); // reject a malformed query without a worker round trip
    const generation = request.policyGeneration ?? this.generation;
    if (generation !== this.generation) throw new PersonalError("policy_changed", "access policy changed; repeat the query");
    const signal = request.signal;
    if (signal?.aborted) throw new PersonalError("cancelled", "search cancelled");
    return new Promise<SearchResponse>((resolve, reject) => {
      const onAbort = () => { const p = this.pending.get(entry.id); if (p) this.settle(p, new PersonalError("cancelled", "search cancelled"), true); };
      const entry: Pending = {
        id: 0, revision: 0, generation, allowed: request.allowedPaths, query: request.query, limit, tag: request.tag || undefined, attempts: 0,
        resolve: (r) => { signal?.removeEventListener("abort", onAbort); resolve(r); },
        reject: (e) => { signal?.removeEventListener("abort", onAbort); reject(e); },
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.post(entry);
    });
  }

  /** Resolves once the worker has applied `revision` (default: the corpus's current one). */
  whenApplied(revision = this.options.corpus.revision): Promise<void> {
    if (this._status !== "running") return Promise.reject(new PersonalError("search_unavailable", this.failure ?? "search is not running"));
    if (this.appliedRevision >= revision) return Promise.resolve();
    return new Promise((resolve, reject) => this.waiters.push({ revision, resolve, reject }));
  }

  /** Start a fresh worker after a failure (or to force a rebuild) and wait until it holds the current corpus. */
  retry(): Promise<void> {
    if (this._status === "disposed") return Promise.reject(new PersonalError("search_unavailable", "search was shut down"));
    this.stopWorker(new PersonalError("search_unavailable", "search restarted"));
    this.failure = null;
    this.start();
    return this._status === "running" ? this.whenApplied() : Promise.reject(new PersonalError("search_unavailable", this.failure ?? "search worker failed to start"));
  }

  /** Terminate the worker, drop listeners and pending work, release the Blob URL. Idempotent. */
  dispose(): void {
    if (this._status === "disposed") return;
    this._status = "disposed";
    this.unsubscribe();
    this.stopWorker(new PersonalError("search_unavailable", "search was shut down"));
    this.options.release?.();
  }

  /* ---------------------------------------------------------------- internals */

  private start(): void {
    const epoch = ++this.epoch;
    let worker: WorkerLike;
    try { worker = this.options.createWorker(); } catch (error) { this.fail(describe(error)); return; }
    this.worker = worker;
    this._status = "running";
    this.sentRevision = -1;
    this.appliedRevision = -1;
    this.scopeIds.clear();
    worker.onmessage = (event) => { if (epoch === this.epoch) this.receive(event.data); };
    worker.onerror = (event) => { if (epoch === this.epoch) this.fail(describe(event)); };
    worker.onmessageerror = (event) => { if (epoch === this.epoch) this.fail(describe(event)); };
    this.sending = Promise.resolve();
    this.enqueue(this.options.corpus.snapshot());
  }

  private stopWorker(reason: PersonalError): void {
    this.epoch++;
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.onmessage = worker.onerror = null;
      if (worker.onmessageerror !== undefined) worker.onmessageerror = null;
      try { worker.terminate(); } catch { /* already gone */ }
    }
    for (const p of [...this.pending.values()]) this.settle(p, reason, false);
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w.reject(reason);
  }

  private fail(message: string): void {
    if (this._status === "disposed") return;
    this.failure = message;
    this._status = "failed";
    this.stopWorker(new PersonalError("search_unavailable", `search stopped: ${message}; use retry`));
  }

  private enqueue(delta: CorpusDelta): void {
    const epoch = this.epoch;
    this.sending = this.sending
      .then(() => this.send(delta, epoch))
      .catch((error) => { if (epoch === this.epoch) this.fail(describe(error)); });
  }

  private async send(delta: CorpusDelta, epoch: number): Promise<void> {
    const live = () => epoch === this.epoch && this._status === "running" && this.worker !== null;
    if (!live() || delta.revision <= this.sentRevision) return; // a later snapshot already covers it
    const chunks: PersonalNoteRecord[][] = [[]];
    let size = 0;
    for (const r of delta.upserts) {
      if (size >= this.chunkChars) { chunks.push([]); size = 0; }
      chunks[chunks.length - 1].push(r);
      size += r.raw.length;
    }
    for (let i = 0; i < chunks.length; i++) {
      const final = i === chunks.length - 1;
      this.worker!.postMessage({
        type: "mutate",
        revision: delta.revision,
        reset: delta.reset && i === 0,
        upserts: chunks[i].map(toWorkerDoc),
        deletes: i === 0 ? [...delta.deletes] : [],
        final,
        state: delta.state,
        omitted: final ? delta.omitted.map((o) => ({ path: o.path, reason: o.reason })) : [],
      });
      if (!final) { await this.yieldToHost(); if (!live()) return; }
    }
    this.sentRevision = delta.revision;
    // Queries tagged with an older revision are stale: cancel and re-issue them.
    for (const p of [...this.pending.values()]) if (p.revision !== this.sentRevision) this.reissue(p);
  }

  private scopeFor(allowed: ReadonlySet<string>): number {
    const known = this.scopeIds.get(allowed);
    if (known !== undefined) return known;
    const scopeId = this.nextScopeId++;
    this.scopeIds.set(allowed, scopeId);
    this.worker!.postMessage({ type: "scope", scopeId, paths: [...allowed] });
    // Same FIFO eviction as the worker, so every id the client holds is still in the worker.
    while (this.scopeIds.size > SCOPE_SLOTS) this.scopeIds.delete(this.scopeIds.keys().next().value!);
    return scopeId;
  }

  private post(p: Pending): void {
    p.id = this.nextId++;
    p.revision = this.sentRevision;
    this.pending.set(p.id, p);
    const scopeId = p.allowed ? this.scopeFor(p.allowed) : null;
    const message: ToWorker = { type: "search", id: p.id, revision: p.revision, generation: p.generation, scopeId, query: p.query, limit: p.limit };
    if (p.tag !== undefined) message.tag = p.tag;
    this.worker!.postMessage(message);
  }

  private reissue(p: Pending): void {
    this.pending.delete(p.id);
    this.worker?.postMessage({ type: "cancel", id: p.id });
    if (++p.attempts > this.maxReissues) { p.reject(new PersonalError("search_unavailable", "notes kept changing during the search; try again")); return; }
    this.post(p);
  }

  private settle(p: Pending, outcome: PersonalError | SearchResponse, cancelInWorker: boolean): void {
    this.pending.delete(p.id);
    if (cancelInWorker) this.worker?.postMessage({ type: "cancel", id: p.id });
    if (outcome instanceof PersonalError) p.reject(outcome); else p.resolve(outcome);
  }

  private receive(message: FromWorker): void {
    if (message.type === "applied") {
      this.appliedRevision = message.revision;
      const ready = this.waiters.filter((w) => w.revision <= message.revision);
      this.waiters = this.waiters.filter((w) => w.revision > message.revision);
      for (const w of ready) w.resolve();
      return;
    }
    if (message.type === "fatal") { this.fail(message.message); return; }
    if (message.type === "cancelled") return;
    const p = this.pending.get(message.id);
    if (!p) return;
    if (message.generation !== this.generation) { this.settle(p, new PersonalError("policy_changed", "access policy changed while searching; repeat the query"), false); return; }
    if (message.revision !== this.sentRevision) { this.reissue(p); return; }
    if (message.type === "error") this.settle(p, new PersonalError(message.code, message.message), false);
    else this.settle(p, message.response, false);
  }
}
