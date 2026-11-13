/**
 * Personal Notes (0.9.0) — search worker.
 *
 * Runs inside a dedicated Web Worker (built to dist/kosmos-personal-search-worker.txt
 * and started from a Blob URL), or a node:worker_threads shim in tests. Holds the
 * searchable copies, applies corpus revisions and answers queries. All work is
 * serialized through one queue and done in bounded batches (PERSONAL_LIMITS.batchMs /
 * batchRecords) that yield so cancellation and new messages are accepted.
 * A revision becomes visible to queries only when all of its chunks are prepared.
 */
import { parseQuery, prepareDoc, SearchRun, type PreparedDoc, type SearchDoc } from "./fulltext";
import { LibrarianIndex, indexDoc, runLibrarian, type DocVector, type LibrarianEntry, type LibrarianResponse } from "./librarian";
import { PERSONAL_CONTRACT, PERSONAL_LIMITS, PersonalError, type CorpusOmission, type CorpusState, type PersonalErrorCode, type SearchResponse } from "./types";

/* ------------------------------------------------------------------ protocol */

export type WorkerDoc = SearchDoc;

export type ToWorker =
  /** One chunk of a corpus revision. `reset` (first chunk only) replaces everything; `final` publishes. */
  | { type: "mutate"; revision: number; reset: boolean; upserts: WorkerDoc[]; deletes: string[]; final: boolean; state: CorpusState; omitted: { path: string; reason: CorpusOmission }[] }
  /** Allowed paths for one scope id. Sent once; the worker keeps the last SCOPE_SLOTS scopes. */
  | { type: "scope"; scopeId: number; paths: string[] }
  | { type: "search"; id: number; revision: number; generation: number; scopeId: number | null; query: string; limit: number; tag?: string }
  /** One hybrid Librarian question over the same scope, notes and text. */
  | { type: "librarian"; id: number; revision: number; generation: number; scopeId: number | null; question: string; limit: number }
  | { type: "cancel"; id: number };

export type FromWorker =
  | { type: "applied"; revision: number; docs: number }
  | { type: "result"; id: number; revision: number; generation: number; response: SearchResponse }
  | { type: "librarian_result"; id: number; revision: number; generation: number; response: LibrarianResponse }
  | { type: "error"; id: number; revision: number; generation: number; code: PersonalErrorCode; message: string }
  | { type: "cancelled"; id: number }
  /** Unexpected internal failure; the client treats the worker as dead. */
  | { type: "fatal"; message: string };

/** Scopes kept by both sides (FIFO). Client and worker evict in the same order. */
export const SCOPE_SLOTS = 8;

export interface WorkerScopeLike {
  postMessage(message: FromWorker): void;
  onmessage: ((event: { data: ToWorker }) => void) | null;
}

/* ------------------------------------------------------------------- yielding */

/** Macrotask yield. setImmediate (Node) / MessageChannel (browsers) avoid the 4 ms clamp of nested setTimeout. */
function makeYield(): () => Promise<void> {
  if (typeof setImmediate === "function") return () => new Promise<void>((resolve) => setImmediate(resolve));
  if (typeof MessageChannel === "function") {
    const channel = new MessageChannel();
    const waiting: (() => void)[] = [];
    channel.port1.onmessage = () => { waiting.shift()?.(); };
    return () => new Promise<void>((resolve) => { waiting.push(resolve); channel.port2.postMessage(0); });
  }
  return () => new Promise<void>((resolve) => setTimeout(resolve, 0));
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/* --------------------------------------------------------------------- engine */

interface Staging { revision: number; reset: boolean; prepared: PreparedDoc[]; vectors: DocVector[]; deletes: string[] }

export class SearchWorkerEngine {
  private docs = new Map<string, PreparedDoc>();
  /** Librarian vectors, one per prepared doc, kept in step with `docs`. */
  private vectors = new Map<string, DocVector>();
  private readonly librarianIndex = new LibrarianIndex();
  private revision = 0;
  private state: CorpusState = "indexing";
  private omitted: { path: string; reason: CorpusOmission }[] = [];
  private readonly scopes = new Map<number, Set<string>>();
  private readonly queue: ToWorker[] = [];
  private readonly cancelled = new Set<number>();
  private staging: Staging | null = null;
  private running = false;
  private readonly yieldNow = makeYield();

  constructor(private readonly post: (message: FromWorker) => void) {}

  receive(message: ToWorker): void {
    if (message.type === "cancel") { this.cancelled.add(message.id); return; }
    this.queue.push(message);
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const op = this.queue.shift()!;
        if (op.type === "mutate") await this.mutate(op);
        else if (op.type === "scope") this.setScope(op.scopeId, op.paths);
        else if (op.type === "search") await this.search(op);
        else if (op.type === "librarian") await this.librarian(op);
      }
    } catch (error) {
      this.post({ type: "fatal", message: error instanceof Error ? error.message : String(error) });
    } finally {
      this.running = false;
    }
  }

  private setScope(scopeId: number, paths: string[]): void {
    this.scopes.set(scopeId, new Set(paths));
    while (this.scopes.size > SCOPE_SLOTS) this.scopes.delete(this.scopes.keys().next().value!);
  }

  /** A newer full snapshot is already queued: preparing this one is wasted work. */
  private supersededByReset(): boolean {
    return this.queue.some((op) => op.type === "mutate" && op.reset);
  }

  /** Drop one note's contribution to the Librarian's document frequencies. */
  private unindexVector(path: string): void {
    const vector = this.vectors.get(path);
    if (!vector) return;
    this.librarianIndex.remove(vector);
    this.vectors.delete(path);
  }

  private async mutate(op: Extract<ToWorker, { type: "mutate" }>): Promise<void> {
    if (op.reset) this.staging = { revision: op.revision, reset: true, prepared: [], vectors: [], deletes: [] };
    else if (!this.staging || this.staging.revision !== op.revision) this.staging = { revision: op.revision, reset: false, prepared: [], vectors: [], deletes: [] };
    const staging = this.staging;
    staging.deletes.push(...op.deletes);
    let started = now();
    let count = 0;
    for (const doc of op.upserts) {
      const prepared = prepareDoc(doc);
      staging.prepared.push(prepared);
      // Vectors are built here, in the yielded loop, so publishing stays cheap.
      staging.vectors.push(indexDoc(prepared, this.librarianIndex.vocab));
      if (++count >= PERSONAL_LIMITS.batchRecords || now() - started >= PERSONAL_LIMITS.batchMs) {
        await this.yieldNow();
        if (staging.reset && this.supersededByReset()) { this.staging = null; return; }
        started = now();
        count = 0;
      }
    }
    if (!op.final || this.staging !== staging) return;
    // Publish atomically: one synchronous step, no yield between.
    if (staging.reset) {
      this.docs = new Map(staging.prepared.map((p) => [p.doc.path, p]));
      this.vectors = new Map();
      this.librarianIndex.clear();
      for (let i = 0; i < staging.prepared.length; i++) {
        this.vectors.set(staging.prepared[i].doc.path, staging.vectors[i]);
        this.librarianIndex.add(staging.vectors[i]);
      }
    } else {
      for (const path of staging.deletes) { this.docs.delete(path); this.unindexVector(path); }
      for (let i = 0; i < staging.prepared.length; i++) {
        const path = staging.prepared[i].doc.path;
        this.unindexVector(path);
        this.docs.set(path, staging.prepared[i]);
        this.vectors.set(path, staging.vectors[i]);
        this.librarianIndex.add(staging.vectors[i]);
      }
    }
    this.revision = op.revision;
    this.state = op.state;
    this.omitted = op.omitted;
    this.staging = null;
    this.post({ type: "applied", revision: this.revision, docs: this.docs.size });
  }

  private async search(op: Extract<ToWorker, { type: "search" }>): Promise<void> {
    const { id, generation } = op;
    const revision = this.revision;
    if (this.cancelled.delete(id)) { this.post({ type: "cancelled", id }); return; }
    // Ids increase and searches run in arrival order: older cancels raced a finished result.
    for (const stale of this.cancelled) if (stale < id) this.cancelled.delete(stale);
    const fail = (code: PersonalErrorCode, message: string) => this.post({ type: "error", id, revision, generation, code, message });
    let terms: string[];
    try { terms = parseQuery(op.query); } catch (error) {
      if (error instanceof PersonalError) { fail(error.code, error.message); return; }
      throw error;
    }
    let scope: Set<string> | null = null;
    if (op.scopeId !== null) {
      scope = this.scopes.get(op.scopeId) ?? null;
      if (!scope) { fail("search_unavailable", "search scope expired; retry the query"); return; }
    }
    // Filter BEFORE matching or counting: iterate only the requester's paths.
    const docs: Iterable<PreparedDoc> = scope && scope.size < this.docs.size
      ? (function* (all: Map<string, PreparedDoc>, allowed: Set<string>) { for (const p of allowed) { const d = all.get(p); if (d) yield d; } })(this.docs, scope)
      : scope
        ? (function* (all: Map<string, PreparedDoc>, allowed: Set<string>) { for (const d of all.values()) if (allowed.has(d.doc.path)) yield d; })(this.docs, scope)
        : this.docs.values();
    const run = new SearchRun(terms, { limit: op.limit, tag: op.tag });
    let searched = 0;
    let started = now();
    let count = 0;
    for (const doc of docs) {
      run.consider(doc);
      searched++;
      if (++count >= PERSONAL_LIMITS.batchRecords || now() - started >= PERSONAL_LIMITS.batchMs) {
        await this.yieldNow();
        if (this.cancelled.delete(id)) { this.post({ type: "cancelled", id }); return; }
        started = now();
        count = 0;
      }
    }
    let omitted = 0;
    for (const o of this.omitted) if (!scope || scope.has(o.path)) omitted++;
    const response: SearchResponse = {
      contract: PERSONAL_CONTRACT,
      terms: [...terms],
      total: run.total,
      hits: run.hits(),
      coverage: { state: this.state, searched, omitted },
      corpusRevision: revision,
    };
    this.cancelled.delete(id);
    this.post({ type: "result", id, revision, generation, response });
  }

  /**
   * Hybrid Librarian answer over the requester's own notes. Deterministic: the
   * same question over the same revision returns the same response. The scan is
   * synchronous (no mid-answer yield) so the response describes one revision.
   */
  private async librarian(op: Extract<ToWorker, { type: "librarian" }>): Promise<void> {
    const { id, generation } = op;
    const revision = this.revision;
    if (this.cancelled.delete(id)) { this.post({ type: "cancelled", id }); return; }
    for (const stale of this.cancelled) if (stale < id) this.cancelled.delete(stale);
    const fail = (code: PersonalErrorCode, message: string) => this.post({ type: "error", id, revision, generation, code, message });
    let scope: Set<string> | null = null;
    if (op.scopeId !== null) {
      scope = this.scopes.get(op.scopeId) ?? null;
      if (!scope) { fail("search_unavailable", "search scope expired; retry the query"); return; }
    }
    const pool: LibrarianEntry[] = [];
    for (const [path, prepared] of this.docs) {
      if (scope && !scope.has(path)) continue;
      const vector = this.vectors.get(path);
      if (vector) pool.push({ prepared, vector });
    }
    let body: Omit<LibrarianResponse, "coverage" | "corpusRevision">;
    try {
      body = runLibrarian(op.question, pool, this.librarianIndex, { limit: op.limit });
    } catch (error) {
      if (error instanceof PersonalError) { fail(error.code, error.message); return; }
      throw error;
    }
    let omitted = 0;
    for (const o of this.omitted) if (!scope || scope.has(o.path)) omitted++;
    const response: LibrarianResponse = {
      ...body,
      coverage: { state: this.state, searched: pool.length, omitted },
      corpusRevision: revision,
    };
    this.cancelled.delete(id);
    this.post({ type: "librarian_result", id, revision, generation, response });
  }
}

/** Wire the engine to a worker global scope (`self` in a Web Worker). */
export function installSearchWorker(scope: WorkerScopeLike): SearchWorkerEngine {
  const engine = new SearchWorkerEngine((message) => scope.postMessage(message));
  scope.onmessage = (event) => engine.receive(event.data);
  return engine;
}
