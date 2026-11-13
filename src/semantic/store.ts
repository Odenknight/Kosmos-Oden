/**
 * Semantic search (0.9.5) — the SQLite store and the in-memory vector index.
 *
 * The database is an ordinary SQLite 3 file (written by SQLite itself, compiled
 * to WebAssembly and bundled into the plugin — nothing to install). It holds,
 * per note: the vault path, a change key, and for each passage its offset,
 * length and vector. It holds **no note text** — not a passage, not a heading,
 * not a title: a passage is always read back from the note itself, through
 * the same access rules as any other read.
 *
 * One database belongs to one model (`model_key`) and one vector length. Opened
 * with a different model, or a different schema version, it is rebuilt empty:
 * vectors from two models are never compared.
 *
 * Search is exact (every allowed passage is compared), not approximate.
 * Pure apart from the injected SQLite database object.
 */
import type { Chunk } from "./chunker";

export const SEMANTIC_SCHEMA = 1;

/** The part of sql.js this module uses. */
export interface SqlDatabase {
  run(sql: string, params?: unknown[]): unknown;
  exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
  prepare(sql: string): SqlStatement;
  export(): Uint8Array;
  close(): void;
}
export interface SqlStatement {
  bind(params?: unknown[]): boolean;
  step(): boolean;
  get(): unknown[];
  run(params?: unknown[]): void;
  reset(): void;
  free(): boolean;
}
export interface SqlModule { Database: new (data?: Uint8Array | null) => SqlDatabase }

export interface SemanticHit {
  path: string;
  /** Cosine similarity, -1..1. */
  score: number;
  offsetChars: number;
  lengthChars: number;
  /**
   * How close this note comes to the best one, on a scale where 1 is the
   * closest note of this search and 0 is the typical (median) note. Raw
   * similarity ranges differ between models (one model's 0.8 is another's
   * 0.4); this does not.
   *
   * It trims the tail; it is not a relevance test. Measured on 350 real notes
   * with three catalog models, no statistic of the scores told a question the
   * notes answer from one they do not: the closest note to an off-topic
   * question stands out as much as a right answer does. So the closest notes
   * are always "closest", never "matching" (see STANDS_OUT).
   */
  lead: number;
}

/**
 * A note is offered only when it comes at least this share of the way from the
 * typical note up to the best one. Measured (same 350 notes, 24 questions):
 * this keeps a median of 5 to 7 notes per question.
 */
export const STANDS_OUT = 0.7;

export interface StoreStats {
  modelKey: string;
  dims: number;
  notes: number;
  chunks: number;
}

interface NoteEntry {
  id: number;
  key: string;
  offsets: Int32Array;
  lengths: Int32Array;
  /** chunks × dims, each row unit length. */
  vectors: Float32Array;
}

const DDL = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  content_key TEXT NOT NULL,
  chunk_count INTEGER NOT NULL,
  indexed_at INTEGER NOT NULL
);
CREATE TABLE chunks (
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  offset_chars INTEGER NOT NULL,
  length_chars INTEGER NOT NULL,
  vector BLOB NOT NULL,
  PRIMARY KEY (note_id, seq)
);
`;

/**
 * Chosen by measurement (10 000 passages): with SQLite's default 4 KB pages a
 * 384-number vector costs 2.1 KB in an ordinary table and 4.7 KB in a WITHOUT
 * ROWID one (every vector spills to its own overflow page). An ordinary table on
 * 32 KB pages costs 1.59 KB for 1.54 KB of vector, and 3.3 KB for a 768-number one.
 */
const PAGE_BYTES = 32768;

function normalize(v: Float32Array): void {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const norm = Math.sqrt(sum);
  if (norm > 0 && Number.isFinite(norm)) for (let i = 0; i < v.length; i++) v[i] /= norm;
  else v.fill(0);
}

export class SemanticStore {
  private readonly notes = new Map<string, NoteEntry>();
  private chunkTotal = 0;
  /** True when the in-memory database differs from the last export. */
  dirty = false;
  /** True when an existing file was discarded on open (other model, other schema, or unreadable). */
  readonly rebuilt: boolean;

  private constructor(private db: SqlDatabase, readonly modelKey: string, readonly dims: number, rebuilt: boolean) {
    this.rebuilt = rebuilt;
  }

  /**
   * Open `bytes` (an existing database) or create a new one. Anything that is
   * not a usable index for exactly this model and vector length is replaced by
   * an empty database; that is reported through `rebuilt`, never thrown.
   */
  static open(SQL: SqlModule, bytes: Uint8Array | null, modelKey: string, dims: number): SemanticStore {
    if (!(Number.isInteger(dims) && dims > 0 && dims <= 8192)) throw new Error(`invalid vector length ${dims}`);
    if (bytes && bytes.length) {
      let db: SqlDatabase | null = null;
      try {
        db = new SQL.Database(bytes);
        const version = Number(db.exec("PRAGMA user_version")[0]?.values[0]?.[0] ?? 0);
        const meta = new Map<string, string>();
        if (version === SEMANTIC_SCHEMA) for (const row of db.exec("SELECT key, value FROM meta")[0]?.values ?? []) meta.set(String(row[0]), String(row[1]));
        if (version === SEMANTIC_SCHEMA && meta.get("model_key") === modelKey && Number(meta.get("dims")) === dims) {
          const store = new SemanticStore(db, modelKey, dims, false);
          store.load();
          return store;
        }
      } catch { /* not a database, or damaged: rebuild */ }
      try { db?.close(); } catch { /* already unusable */ }
      return SemanticStore.create(SQL, modelKey, dims, true);
    }
    return SemanticStore.create(SQL, modelKey, dims, false);
  }

  private static create(SQL: SqlModule, modelKey: string, dims: number, rebuilt: boolean): SemanticStore {
    const db = new SQL.Database();
    db.run(`PRAGMA page_size = ${PAGE_BYTES}`);
    db.run(DDL);
    db.run(`PRAGMA user_version = ${SEMANTIC_SCHEMA}`);
    const put = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
    for (const [k, v] of [["schema", String(SEMANTIC_SCHEMA)], ["model_key", modelKey], ["dims", String(dims)], ["vector_format", "float32-le, unit length"], ["created_by", "Kosmos-Oden"]]) put.run([k, v]);
    put.free();
    const store = new SemanticStore(db, modelKey, dims, rebuilt);
    store.dirty = true;
    return store;
  }

  private load(): void {
    const byId = new Map<number, { path: string; entry: NoteEntry; filled: number }>();
    const notes = this.db.prepare("SELECT id, path, content_key, chunk_count FROM notes");
    while (notes.step()) {
      const [id, path, key, count] = notes.get() as [number, string, string, number];
      const entry: NoteEntry = { id, key, offsets: new Int32Array(count), lengths: new Int32Array(count), vectors: new Float32Array(count * this.dims) };
      byId.set(id, { path, entry, filled: 0 });
    }
    notes.free();
    const chunks = this.db.prepare("SELECT note_id, seq, offset_chars, length_chars, vector FROM chunks ORDER BY note_id, seq");
    while (chunks.step()) {
      const [noteId, seq, offset, length, blob] = chunks.get() as [number, number, number, number, Uint8Array];
      const row = byId.get(noteId);
      if (!row || seq < 0 || seq >= row.entry.offsets.length || blob.byteLength !== this.dims * 4) continue;
      row.entry.offsets[seq] = offset;
      row.entry.lengths[seq] = length;
      // copy: the blob may be unaligned and is owned by SQLite
      row.entry.vectors.set(new Float32Array(blob.slice().buffer), seq * this.dims);
      row.filled++;
    }
    chunks.free();
    for (const { path, entry, filled } of byId.values()) {
      // A note whose passages did not all load is dropped, so it is embedded again.
      if (filled !== entry.offsets.length) { this.db.run("DELETE FROM chunks WHERE note_id = ?", [entry.id]); this.db.run("DELETE FROM notes WHERE id = ?", [entry.id]); this.dirty = true; continue; }
      this.notes.set(path, entry);
      this.chunkTotal += filled;
    }
  }

  stats(): StoreStats {
    return { modelKey: this.modelKey, dims: this.dims, notes: this.notes.size, chunks: this.chunkTotal };
  }

  /** path -> change key of every embedded note. */
  manifest(): Record<string, string> {
    const out: Record<string, string> = Object.create(null);
    for (const [path, entry] of this.notes) out[path] = entry.key;
    return out;
  }

  has(path: string): boolean { return this.notes.has(path); }

  /** Replace one note's passages. `vectors` is chunks.length × dims; rows are normalized here. */
  upsert(path: string, key: string, chunks: readonly Chunk[], vectors: Float32Array, now: number): void {
    if (vectors.length !== chunks.length * this.dims) throw new Error(`vector data for ${chunks.length} passages must hold ${chunks.length * this.dims} numbers, got ${vectors.length}`);
    const owned = new Float32Array(vectors);
    for (let i = 0; i < chunks.length; i++) normalize(owned.subarray(i * this.dims, (i + 1) * this.dims));
    this.db.run("BEGIN");
    try {
      this.deleteRows(path);
      this.db.run("INSERT INTO notes (path, content_key, chunk_count, indexed_at) VALUES (?, ?, ?, ?)", [path, key, chunks.length, Math.floor(now)]);
      const id = Number(this.db.exec("SELECT last_insert_rowid()")[0].values[0][0]);
      const insert = this.db.prepare("INSERT INTO chunks (note_id, seq, offset_chars, length_chars, vector) VALUES (?, ?, ?, ?, ?)");
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        insert.run([id, i, c.offsetChars, c.lengthChars, new Uint8Array(owned.buffer, i * this.dims * 4, this.dims * 4)]);
      }
      insert.free();
      this.db.run("COMMIT");
      const old = this.notes.get(path);
      if (old) this.chunkTotal -= old.offsets.length;
      this.notes.set(path, {
        id, key,
        offsets: Int32Array.from(chunks, (c) => c.offsetChars),
        lengths: Int32Array.from(chunks, (c) => c.lengthChars),
        vectors: owned,
      });
      this.chunkTotal += chunks.length;
      this.dirty = true;
    } catch (error) {
      try { this.db.run("ROLLBACK"); } catch { /* no transaction open */ }
      throw error;
    }
  }

  private deleteRows(path: string): void {
    const old = this.notes.get(path);
    if (!old) return;
    this.db.run("DELETE FROM chunks WHERE note_id = ?", [old.id]);
    this.db.run("DELETE FROM notes WHERE id = ?", [old.id]);
  }

  remove(path: string): boolean {
    const old = this.notes.get(path);
    if (!old) return false;
    this.deleteRows(path);
    this.notes.delete(path);
    this.chunkTotal -= old.offsets.length;
    this.dirty = true;
    return true;
  }

  /** A renamed note keeps its vectors. False when `from` is unknown or `to` already exists. */
  rename(from: string, to: string): boolean {
    const entry = this.notes.get(from);
    if (!entry || this.notes.has(to)) return false;
    this.db.run("UPDATE notes SET path = ? WHERE id = ?", [to, entry.id]);
    this.notes.delete(from);
    this.notes.set(to, entry);
    this.dirty = true;
    return true;
  }

  clear(): void {
    this.db.run("DELETE FROM chunks");
    this.db.run("DELETE FROM notes");
    this.notes.clear();
    this.chunkTotal = 0;
    this.dirty = true;
  }

  /**
   * The closest passage of each allowed note, best notes first. `allowed`
   * null = every note. A note outside `allowed` is never compared.
   */
  search(query: Float32Array, allowed: ReadonlySet<string> | null, limit: number, exclude?: ReadonlySet<string>): SemanticHit[] {
    if (query.length !== this.dims) throw new Error(`query vector has ${query.length} numbers, the index uses ${this.dims}`);
    const q = new Float32Array(query);
    normalize(q);
    const dims = this.dims;
    const hits: SemanticHit[] = [];
    const visit = (path: string, entry: NoteEntry) => {
      const count = entry.offsets.length;
      let best = -Infinity, at = -1;
      for (let c = 0; c < count; c++) {
        let dot = 0;
        const base = c * dims;
        for (let k = 0; k < dims; k++) dot += q[k] * entry.vectors[base + k];
        if (dot > best) { best = dot; at = c; }
      }
      if (at >= 0) hits.push({ path, score: best, offsetChars: entry.offsets[at], lengthChars: entry.lengths[at], lead: 0 });
    };
    if (allowed && allowed.size < this.notes.size) {
      for (const path of allowed) { const entry = this.notes.get(path); if (entry && !exclude?.has(path)) visit(path, entry); }
    } else {
      for (const [path, entry] of this.notes) if ((!allowed || allowed.has(path)) && !exclude?.has(path)) visit(path, entry);
    }
    hits.sort((a, b) => (b.score - a.score) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    if (hits.length) {
      const mid = hits.length >> 1;
      const median = hits.length % 2 ? hits[mid].score : (hits[mid - 1].score + hits[mid].score) / 2;
      const span = hits[0].score - median;
      // No spread (one note, or all alike): only the first stands out.
      hits.forEach((h, i) => { h.lead = span > 1e-6 ? (h.score - median) / span : i === 0 ? 1 : 0; });
    }
    return hits.slice(0, Math.max(0, limit));
  }

  /** One vector standing for a whole note: the mean of its passages. Null when the note is not embedded. */
  centroid(path: string): Float32Array | null {
    const entry = this.notes.get(path);
    if (!entry || !entry.offsets.length) return null;
    const out = new Float32Array(this.dims);
    for (let c = 0; c < entry.offsets.length; c++) for (let k = 0; k < this.dims; k++) out[k] += entry.vectors[c * this.dims + k];
    normalize(out);
    return out;
  }

  /** The database file. Clears `dirty`. */
  export(): Uint8Array {
    const bytes = this.db.export();
    this.dirty = false;
    return bytes;
  }

  close(): void {
    try { this.db.close(); } catch { /* already closed */ }
    this.notes.clear();
    this.chunkTotal = 0;
  }
}
