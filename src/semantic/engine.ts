/**
 * Semantic search (0.9.5) — the engine: an embedder plus the SQLite store.
 *
 * Runs inside the semantic worker; in tests it runs directly with a fake
 * embedder. It never reads the vault: notes are handed to it, and every query
 * names the notes the requester may see.
 */
import { chunkNote, chunkText } from "./chunker";
import { STANDS_OUT, SemanticStore, type SemanticHit, type SqlModule, type StoreStats } from "./store";

export type EmbedKind = "query" | "passage";

export interface Embedder {
  /** Vector length. */
  readonly dims: number;
  /** One vector per text, in order. Calls are made one at a time. */
  embed(texts: readonly string[], kind: EmbedKind): Promise<Float32Array[]>;
  dispose?(): void | Promise<void>;
}

export interface NoteInput {
  path: string;
  /** Change key (see contentKey). */
  key: string;
  title: string;
  raw: string;
}

export interface RelatedHit extends SemanticHit {
  /** The source note this one is close to. */
  relatedTo: string;
}

export const ENGINE_LIMITS = {
  /** Passages embedded per model call. */
  batch: 8,
  queryCodePoints: 2000,
  maxResults: 200,
} as const;

export class SemanticEngine {
  /** Serializes model use: one inference at a time, questions ahead of indexing. */
  private tail: Promise<unknown> = Promise.resolve();
  private waitingQueries = 0;

  constructor(readonly store: SemanticStore, private readonly embedder: Embedder, private readonly now: () => number = Date.now) {
    if (embedder.dims !== store.dims) throw new Error(`the model makes ${embedder.dims}-number vectors, the index holds ${store.dims}`);
  }

  static open(SQL: SqlModule, bytes: Uint8Array | null, modelKey: string, embedder: Embedder): SemanticEngine {
    return new SemanticEngine(SemanticStore.open(SQL, bytes, modelKey, embedder.dims), embedder);
  }

  stats(): StoreStats { return this.store.stats(); }

  private exclusive<T>(run: () => Promise<T>): Promise<T> {
    const next = this.tail.then(run, run);
    this.tail = next.catch(() => undefined);
    return next;
  }

  /**
   * Embed and store notes. A note with no text to embed is stored with zero
   * passages, so it is not offered again. Returns the passages written.
   */
  async index(notes: readonly NoteInput[]): Promise<{ notes: number; chunks: number }> {
    let chunkCount = 0;
    for (const note of notes) {
      const chunks = chunkNote(note.raw);
      const vectors = new Float32Array(chunks.length * this.store.dims);
      for (let at = 0; at < chunks.length; at += ENGINE_LIMITS.batch) {
        const slice = chunks.slice(at, at + ENGINE_LIMITS.batch);
        const texts = slice.map((c) => chunkText(note.raw, c, note.title));
        // Let a waiting question go first: it needs one short inference.
        while (this.waitingQueries > 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const out = await this.exclusive(() => this.embedder.embed(texts, "passage"));
        if (out.length !== slice.length) throw new Error("the model returned the wrong number of vectors");
        out.forEach((v, i) => {
          if (v.length !== this.store.dims) throw new Error(`the model returned a ${v.length}-number vector, expected ${this.store.dims}`);
          vectors.set(v, (at + i) * this.store.dims);
        });
      }
      this.store.upsert(note.path, note.key, chunks, vectors, this.now());
      chunkCount += chunks.length;
    }
    return { notes: notes.length, chunks: chunkCount };
  }

  remove(paths: readonly string[]): number {
    let removed = 0;
    for (const path of paths) if (this.store.remove(path)) removed++;
    return removed;
  }

  rename(from: string, to: string): boolean { return this.store.rename(from, to); }

  private async embedQuery(question: string): Promise<Float32Array> {
    const text = question.trim();
    if (!text) throw new Error("question must not be empty");
    if ([...text].length > ENGINE_LIMITS.queryCodePoints) throw new Error("question is too long");
    this.waitingQueries++;
    try {
      const [vector] = await this.exclusive(() => this.embedder.embed([text], "query"));
      return vector;
    } finally {
      this.waitingQueries--;
    }
  }

  /** Notes closest in meaning to `question`, limited to `allowed` (null = all). */
  async query(question: string, allowed: ReadonlySet<string> | null, limit: number): Promise<SemanticHit[]> {
    const vector = await this.embedQuery(question);
    return this.store.search(vector, allowed, Math.max(1, Math.min(ENGINE_LIMITS.maxResults, Math.floor(limit))));
  }

  /**
   * Notes close in meaning to each source note, sources excluded. No model
   * call: it compares vectors already stored. Both sources and results are
   * limited to `allowed`. Only notes near the closest one are kept
   * (STANDS_OUT); the closest is always kept, related or not.
   */
  related(sources: readonly string[], allowed: ReadonlySet<string> | null, perSource: number, limit: number): RelatedHit[] {
    const exclude = new Set(sources);
    const best = new Map<string, RelatedHit>();
    for (const source of sources) {
      if (allowed && !allowed.has(source)) continue;
      const centroid = this.store.centroid(source);
      if (!centroid) continue;
      for (const hit of this.store.search(centroid, allowed, perSource, exclude)) {
        if (hit.lead < STANDS_OUT) continue;
        const seen = best.get(hit.path);
        if (!seen || hit.score > seen.score) best.set(hit.path, { ...hit, relatedTo: source });
      }
    }
    return [...best.values()].sort((a, b) => (b.score - a.score) || (a.path < b.path ? -1 : 1)).slice(0, Math.max(0, limit));
  }

  exportDatabase(): Uint8Array { return this.store.export(); }

  async dispose(): Promise<void> {
    await this.tail;
    this.store.close();
    await this.embedder.dispose?.();
  }
}
