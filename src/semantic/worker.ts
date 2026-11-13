/**
 * Semantic search (0.9.5) — the worker: model, tokenizer and SQLite off the
 * main thread, so embedding a vault never freezes the editor.
 *
 * Request/response: every message carries `id`; every reply carries the same
 * `id` and either `result` or `error`. The worker never reads the vault and
 * never uses the network.
 */
import type { EmbeddingRecipe } from "./catalog";
import { SemanticEngine, type Embedder, type NoteInput } from "./engine";
import type { EmbedderFiles } from "./embedder";
import type { SqlModule } from "./store";

export type SemanticRequest =
  | { id: number; op: "load"; model: ArrayBuffer; tokenizer: string; tokenizerConfig: string; recipe: EmbeddingRecipe; modelKey: string; database: ArrayBuffer | null }
  | { id: number; op: "manifest" }
  | { id: number; op: "stats" }
  | { id: number; op: "index"; notes: NoteInput[] }
  | { id: number; op: "remove"; paths: string[] }
  | { id: number; op: "rename"; from: string; to: string }
  | { id: number; op: "query"; question: string; allowed: string[] | null; limit: number }
  | { id: number; op: "related"; sources: string[]; allowed: string[] | null; perSource: number; limit: number }
  | { id: number; op: "export" }
  | { id: number; op: "unload" };

export type SemanticReply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

export interface SemanticWorkerScope {
  onmessage: ((event: { data: SemanticRequest }) => void) | null;
  postMessage(message: SemanticReply, transfer?: Transferable[]): void;
}

export interface SemanticWorkerDeps {
  /** The SQLite module (WebAssembly), initialized once. */
  sql(): Promise<SqlModule>;
  createEmbedder(files: EmbedderFiles, recipe: EmbeddingRecipe): Promise<Embedder>;
}

export interface LoadResult { dims: number; notes: number; chunks: number; rebuilt: boolean }

export function installSemanticWorker(scope: SemanticWorkerScope, deps: SemanticWorkerDeps): void {
  let engine: SemanticEngine | null = null;
  const need = (): SemanticEngine => {
    if (!engine) throw new Error("no model is loaded");
    return engine;
  };
  const set = (paths: string[] | null) => (paths ? new Set(paths) : null);

  const handle = async (m: SemanticRequest): Promise<{ result: unknown; transfer?: Transferable[] }> => {
    switch (m.op) {
      case "load": {
        if (engine) { await engine.dispose(); engine = null; }
        let tokenizer: unknown, tokenizerConfig: unknown;
        try { tokenizer = JSON.parse(m.tokenizer); } catch { throw new Error("tokenizer.json is not valid JSON"); }
        try { tokenizerConfig = m.tokenizerConfig ? JSON.parse(m.tokenizerConfig) : {}; } catch { throw new Error("tokenizer_config.json is not valid JSON"); }
        const embedder = await deps.createEmbedder({ model: m.model, tokenizer, tokenizerConfig }, m.recipe);
        try {
          engine = SemanticEngine.open(await deps.sql(), m.database ? new Uint8Array(m.database) : null, m.modelKey, embedder);
        } catch (error) {
          await embedder.dispose?.();
          throw error;
        }
        const stats = engine.stats();
        const result: LoadResult = { dims: stats.dims, notes: stats.notes, chunks: stats.chunks, rebuilt: engine.store.rebuilt };
        return { result };
      }
      case "manifest": return { result: need().store.manifest() };
      case "stats": return { result: { ...need().stats(), dirty: need().store.dirty } };
      case "index": return { result: await need().index(m.notes) };
      case "remove": return { result: need().remove(m.paths) };
      case "rename": return { result: need().rename(m.from, m.to) };
      case "query": return { result: await need().query(m.question, set(m.allowed), m.limit) };
      case "related": return { result: need().related(m.sources, set(m.allowed), m.perSource, m.limit) };
      case "export": {
        const bytes = need().exportDatabase();
        // sql.js hands out its own copy; send it without another one.
        const buffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? (bytes.buffer as ArrayBuffer) : bytes.slice().buffer;
        return { result: buffer, transfer: [buffer] };
      }
      case "unload": {
        if (engine) await engine.dispose();
        engine = null;
        return { result: true };
      }
      default: throw new Error("unknown request");
    }
  };

  scope.onmessage = (event) => {
    const m = event.data;
    if (!m || typeof m.id !== "number") return;
    handle(m).then(
      ({ result, transfer }) => scope.postMessage({ id: m.id, ok: true, result }, transfer),
      (error) => scope.postMessage({ id: m.id, ok: false, error: error instanceof Error ? error.message : String(error) }),
    );
  };
}
