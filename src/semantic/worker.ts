/**
 * Semantic search (0.9.5) — the worker: model, tokenizer and SQLite off the
 * main thread, so embedding a vault never freezes the editor.
 *
 * Request/response: every message carries `id`; every reply carries the same
 * `id` and either `result` or `error`. The worker never reads the vault and
 * never uses the network.
 *
 * With an embedding server ("load-remote") the worker loads no model at all:
 * its embedder is a proxy that asks the plugin for vectors with
 * `{ call, op: "embed", texts, kind }` and waits for `{ reply, ok, vectors, dims }`.
 * The plugin's main thread makes the request (src/semantic/remote.ts).
 */
import type { EmbeddingRecipe } from "./catalog";
import { SemanticEngine, type EmbedKind, type Embedder, type NoteInput } from "./engine";
import type { EmbedderFiles } from "./embedder";
import type { SqlModule } from "./store";

export type SemanticRequest =
  | { id: number; op: "load"; model: ArrayBuffer; tokenizer: string; tokenizerConfig: string; recipe: EmbeddingRecipe; modelKey: string; database: ArrayBuffer | null }
  | { id: number; op: "load-remote"; dims: number; batch: number; modelKey: string; database: ArrayBuffer | null }
  | { id: number; op: "manifest" }
  | { id: number; op: "stats" }
  | { id: number; op: "index"; notes: NoteInput[] }
  | { id: number; op: "remove"; paths: string[] }
  | { id: number; op: "rename"; from: string; to: string }
  | { id: number; op: "query"; question: string; allowed: string[] | null; limit: number }
  | { id: number; op: "related"; sources: string[]; allowed: string[] | null; perSource: number; limit: number }
  | { id: number; op: "export" }
  | { id: number; op: "unload" };

/** `code` marks a server-wide embedding-server problem (see SERVER_ERROR_CODE). */
export type SemanticReply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string; code?: string };

/** Worker → plugin: embed these texts with the embedding server. */
export interface EmbedCall { call: number; op: "embed"; texts: string[]; kind: EmbedKind }
/** Plugin → worker: the vectors (one Float32Array buffer, `dims` numbers per text), or why not. */
export type EmbedReply = { reply: number; ok: true; vectors: ArrayBuffer; dims: number } | { reply: number; ok: false; error: string; code?: string };

export interface SemanticWorkerScope {
  onmessage: ((event: { data: SemanticRequest | EmbedReply }) => void) | null;
  postMessage(message: SemanticReply | EmbedCall, transfer?: Transferable[]): void;
}

export interface SemanticWorkerDeps {
  /** The SQLite module (WebAssembly), initialized once. */
  sql(): Promise<SqlModule>;
  createEmbedder(files: EmbedderFiles, recipe: EmbeddingRecipe): Promise<Embedder>;
}

export interface LoadResult { dims: number; notes: number; chunks: number; rebuilt: boolean }

const codeOf = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code ? code : undefined;
};

/**
 * The worker-side embedder for an embedding server: it asks the plugin and
 * checks what comes back. Makes no request itself.
 */
export function remoteEmbedder(post: (message: EmbedCall) => void, dims: number, batch: number): Embedder & { settle(reply: EmbedReply): void } {
  let next = 1;
  const waiting = new Map<number, { count: number; resolve(v: Float32Array[]): void; reject(e: Error): void }>();
  return {
    dims,
    batch,
    embed(texts: readonly string[], kind: EmbedKind): Promise<Float32Array[]> {
      const call = next++;
      return new Promise<Float32Array[]>((resolve, reject) => {
        waiting.set(call, { count: texts.length, resolve, reject });
        try { post({ call, op: "embed", texts: [...texts], kind }); }
        catch (error) { waiting.delete(call); reject(error instanceof Error ? error : new Error(String(error))); }
      });
    },
    settle(reply: EmbedReply): void {
      const w = waiting.get(reply.reply);
      if (!w) return;
      waiting.delete(reply.reply);
      if (reply.ok !== true) { w.reject(Object.assign(new Error(reply.error), reply.code ? { code: reply.code } : {})); return; }
      if (reply.dims !== dims || !(reply.vectors instanceof ArrayBuffer) || reply.vectors.byteLength !== w.count * dims * 4) {
        w.reject(new Error(`the embedding server's vectors do not fit the index (${dims} numbers each were expected)`));
        return;
      }
      const all = new Float32Array(reply.vectors);
      w.resolve(Array.from({ length: w.count }, (_, i) => all.subarray(i * dims, (i + 1) * dims)));
    },
    dispose(): void {
      for (const w of waiting.values()) w.reject(new Error("semantic search was stopped"));
      waiting.clear();
    },
  };
}

export function installSemanticWorker(scope: SemanticWorkerScope, deps: SemanticWorkerDeps): void {
  let engine: SemanticEngine | null = null;
  let remote: ReturnType<typeof remoteEmbedder> | null = null;
  const need = (): SemanticEngine => {
    if (!engine) throw new Error("no model is loaded");
    return engine;
  };
  const set = (paths: string[] | null) => (paths ? new Set(paths) : null);

  const handle = async (m: SemanticRequest): Promise<{ result: unknown; transfer?: Transferable[] }> => {
    switch (m.op) {
      case "load": {
        if (engine) { await engine.dispose(); engine = null; remote = null; }
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
      case "load-remote": {
        // An embedding server makes the vectors: no model, no tokenizer and no ONNX Runtime here.
        if (engine) { await engine.dispose(); engine = null; remote = null; }
        const proxy = remoteEmbedder((message) => scope.postMessage(message), m.dims, m.batch);
        try {
          engine = SemanticEngine.open(await deps.sql(), m.database ? new Uint8Array(m.database) : null, m.modelKey, proxy);
        } catch (error) {
          proxy.dispose?.();
          throw error;
        }
        remote = proxy;
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
        remote = null;
        return { result: true };
      }
      default: throw new Error("unknown request");
    }
  };

  scope.onmessage = (event) => {
    const data = event.data;
    if (data && typeof (data as EmbedReply).reply === "number") { remote?.settle(data as EmbedReply); return; }
    const m = data as SemanticRequest;
    if (!m || typeof m.id !== "number") return;
    handle(m).then(
      ({ result, transfer }) => scope.postMessage({ id: m.id, ok: true, result }, transfer),
      (error) => {
        const code = codeOf(error);
        scope.postMessage({ id: m.id, ok: false, error: error instanceof Error ? error.message : String(error), ...(code ? { code } : {}) });
      },
    );
  };
}
