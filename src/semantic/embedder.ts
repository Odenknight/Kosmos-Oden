/**
 * Semantic search (0.9.5) — the ONNX embedder.
 *
 * Runs a sentence-embedding model entirely inside the plugin: ONNX Runtime
 * compiled to WebAssembly (bundled, single-threaded, CPU) and a JavaScript
 * tokenizer. No server, no Python, no native binary, no network at run time.
 *
 * Works with any BERT-style ONNX feature-extraction export: inputs
 * `input_ids` + `attention_mask` (+ optional `token_type_ids`), and either a
 * token-level output (pooled here, by mean or [CLS]) or an already pooled
 * sentence output.
 */
import * as ort from "onnxruntime-web/wasm";
import { Tokenizer } from "@huggingface/tokenizers";
import type { EmbeddingRecipe } from "./catalog";
import type { EmbedKind, Embedder } from "./engine";

export interface EmbedderFiles {
  model: ArrayBuffer | Uint8Array;
  /** Parsed tokenizer.json. */
  tokenizer: unknown;
  /** Parsed tokenizer_config.json ({} when the model has none). */
  tokenizerConfig: unknown;
}

/** Names of pooled sentence outputs some exports provide. */
const POOLED_OUTPUTS = ["sentence_embedding", "sentence_embeddings", "pooler_output", "embeddings"];
const TOKEN_OUTPUTS = ["last_hidden_state", "token_embeddings"];

let runtimeReady = false;

/** Give ONNX Runtime its WebAssembly binary. Must be called once before the first model is loaded. */
export function configureOnnxRuntime(wasmBinary: ArrayBuffer): void {
  if (runtimeReady) return;
  ort.env.wasm.wasmBinary = wasmBinary;
  // Obsidian is not cross-origin isolated, so there is no SharedArrayBuffer: one thread.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.logLevel = "error";
  runtimeReady = true;
}

export async function createOnnxEmbedder(files: EmbedderFiles, recipe: EmbeddingRecipe): Promise<Embedder> {
  if (!runtimeReady) throw new Error("ONNX Runtime is not configured");
  const bytes = files.model instanceof Uint8Array ? files.model : new Uint8Array(files.model);
  let session: ort.InferenceSession;
  try {
    session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  } catch (error) {
    throw new Error(`the model file could not be loaded as ONNX (${error instanceof Error ? error.message : String(error)})`);
  }
  const inputs = new Set(session.inputNames);
  if (!inputs.has("input_ids") || !inputs.has("attention_mask")) {
    await session.release().catch(() => undefined);
    throw new Error(`this ONNX model takes inputs [${session.inputNames.join(", ")}]; a text embedding model with input_ids and attention_mask is needed`);
  }
  for (const name of session.inputNames) {
    if (name !== "input_ids" && name !== "attention_mask" && name !== "token_type_ids") {
      await session.release().catch(() => undefined);
      throw new Error(`this ONNX model needs an input named "${name}", which is not supported`);
    }
  }
  let tokenizer: Tokenizer;
  try {
    tokenizer = new Tokenizer(files.tokenizer as never, (files.tokenizerConfig ?? {}) as never);
  } catch (error) {
    await session.release().catch(() => undefined);
    throw new Error(`tokenizer.json could not be used (${error instanceof Error ? error.message : String(error)})`);
  }
  const pooledName = POOLED_OUTPUTS.find((n) => session.outputNames.includes(n));
  const tokenName = TOKEN_OUTPUTS.find((n) => session.outputNames.includes(n)) ?? session.outputNames[0];
  const maxTokens = Math.max(16, Math.min(8192, Math.floor(recipe.maxTokens)));

  const encode = (text: string): bigint[] => {
    const ids = Array.from((tokenizer.encode(text) as { ids: ArrayLike<number> }).ids);
    // Keep the final special token (e.g. [SEP]) when truncating.
    const cut = ids.length > maxTokens ? [...ids.slice(0, maxTokens - 1), ids[ids.length - 1]] : ids;
    return cut.map((id) => BigInt(id));
  };

  const one = async (text: string): Promise<Float32Array> => {
    const ids = encode(text);
    const n = ids.length;
    if (!n) throw new Error("the tokenizer produced no tokens");
    const feeds: Record<string, ort.Tensor> = {
      input_ids: new ort.Tensor("int64", BigInt64Array.from(ids), [1, n]),
      attention_mask: new ort.Tensor("int64", new BigInt64Array(n).fill(1n), [1, n]),
    };
    if (inputs.has("token_type_ids")) feeds.token_type_ids = new ort.Tensor("int64", new BigInt64Array(n), [1, n]);
    const result = await session.run(feeds);
    const pooled = pooledName ? result[pooledName] : undefined;
    const source = pooled && pooled.dims.length === 2 ? pooled : result[tokenName];
    const data = source.data as Float32Array;
    if (!(data instanceof Float32Array)) throw new Error("the model output is not 32-bit floating point");
    const dims = source.dims;
    const width = Number(dims[dims.length - 1]);
    const out = new Float32Array(width);
    if (dims.length === 2) out.set(data.subarray(0, width));
    else if (dims.length === 3) {
      const tokens = Number(dims[1]);
      if (recipe.pooling === "cls") out.set(data.subarray(0, width));
      else {
        for (let t = 0; t < tokens; t++) for (let k = 0; k < width; k++) out[k] += data[t * width + k];
        for (let k = 0; k < width; k++) out[k] /= tokens;
      }
    } else throw new Error(`the model output has ${dims.length} dimensions; expected 2 or 3`);
    let sum = 0;
    for (let k = 0; k < width; k++) sum += out[k] * out[k];
    const norm = Math.sqrt(sum);
    if (!(norm > 0) || !Number.isFinite(norm)) throw new Error("the model returned an empty vector");
    for (let k = 0; k < width; k++) out[k] /= norm;
    return out;
  };

  // The vector length comes from one real run, so a custom model needs no declared size.
  const probe = await one(`${recipe.queryPrefix}probe`);
  if (recipe.dims && probe.length !== recipe.dims) {
    await session.release().catch(() => undefined);
    throw new Error(`the model makes ${probe.length}-number vectors but ${recipe.dims} were expected; the files do not match the selected model`);
  }

  return {
    dims: probe.length,
    async embed(texts: readonly string[], kind: EmbedKind): Promise<Float32Array[]> {
      const prefix = kind === "query" ? recipe.queryPrefix : recipe.passagePrefix;
      const out: Float32Array[] = [];
      // One text per run: no padding, so every vector is independent of its batch.
      for (const text of texts) out.push(await one(prefix + text));
      return out;
    },
    async dispose() { await session.release().catch(() => undefined); },
  };
}
