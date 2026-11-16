/**
 * Semantic search (0.9.5) — the worker bundle's entry. Built to
 * dist/kosmos-semantic-worker.txt and embedded in main.js as text.
 *
 * Both WebAssembly binaries (ONNX Runtime and SQLite) travel inside this
 * bundle, gzip-compressed and base64-encoded, so the plugin stays a single
 * main.js and nothing is fetched to run it.
 */
import initSqlJs from "sql.js/dist/sql-wasm-browser.js";
import ORT_WASM_GZ from "../../dist/kosmos-ort-wasm.gz.b64.txt";
import SQL_WASM_GZ from "../../dist/kosmos-sql-wasm.gz.b64.txt";
import { configureOnnxRuntime, createOnnxEmbedder } from "./embedder";
import type { SqlModule } from "./store";
import { installSemanticWorker, type SemanticWorkerScope } from "./worker";

async function gunzipBase64(b64: string): Promise<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
}

let sql: Promise<SqlModule> | null = null;
let ortReady: Promise<void> | null = null;

installSemanticWorker(self as unknown as SemanticWorkerScope, {
  sql: () => (sql ??= gunzipBase64(SQL_WASM_GZ).then((wasmBinary) => (initSqlJs as unknown as (config: { wasmBinary: ArrayBuffer }) => Promise<SqlModule>)({ wasmBinary }))),
  createEmbedder: async (files, recipe) => {
    await (ortReady ??= gunzipBase64(ORT_WASM_GZ).then(configureOnnxRuntime));
    return createOnnxEmbedder(files, recipe);
  },
});
