/**
 * Semantic search (0.9.5) — the saved choices. Small and pure, so the settings
 * migration can use it without pulling in the rest of semantic search.
 */
import { CUSTOM_MODEL_ID, DEFAULT_MODEL_ID, catalogModel, normalizeCustomModel, type CustomModelSettings } from "./catalog";

/** Where embeddings are made: by the model inside the plugin, or by an embedding server the user runs. */
export type SemanticEngineChoice = "builtin" | "server";
/** How to talk to an embedding server. "auto" tries OpenAI-compatible first, then Ollama. */
export type EmbeddingServerApi = "auto" | "openai" | "ollama";

/**
 * An embedding server the user runs (llama.cpp, Ollama, LM Studio, vLLM …).
 * Synced with the other settings. An API key is NOT part of it: that stays on
 * each device (see src/plugin/embedding-endpoint.ts).
 */
export interface EmbeddingServerSettings {
  /** Base address as typed, e.g. http://127.0.0.1:8080. Checked before every use (src/semantic/endpoint.ts). */
  url: string;
  api: EmbeddingServerApi;
  /** Model name sent to the server. Optional for OpenAI-compatible servers, required for Ollama. */
  model: string;
  queryPrefix: string;
  passagePrefix: string;
  /** Passages per request, 1..64. */
  batch: number;
}

/** Saved with the plugin's settings. Model files and the index are per device and are not part of it. */
export interface SemanticSettings {
  enabled: boolean;
  /** A catalog model id, or "custom". */
  modelId: string;
  custom: CustomModelSettings;
  engine: SemanticEngineChoice;
  server: EmbeddingServerSettings;
}

export const DEFAULT_SERVER_URL = "http://127.0.0.1:8080";
export const SERVER_BATCH_LIMITS = { min: 1, max: 64, default: 16 } as const;

export function defaultEmbeddingServer(): EmbeddingServerSettings {
  return { url: DEFAULT_SERVER_URL, api: "auto", model: "", queryPrefix: "", passagePrefix: "", batch: SERVER_BATCH_LIMITS.default };
}

export function defaultSemanticSettings(): SemanticSettings {
  return { enabled: false, modelId: DEFAULT_MODEL_ID, custom: normalizeCustomModel(undefined), engine: "builtin", server: defaultEmbeddingServer() };
}

/**
 * Anything malformed becomes the default. The address is kept as typed (so a
 * typo can be corrected on the settings page); whether it may be used is
 * decided each time it is used, never here.
 */
export function normalizeEmbeddingServer(value: unknown): EmbeddingServerSettings {
  const d = defaultEmbeddingServer();
  if (typeof value !== "object" || value === null) return d;
  const v = value as Record<string, unknown>;
  const text = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
  const url = text(v.url, 2048).trim();
  const batch = typeof v.batch === "number" && Number.isFinite(v.batch)
    ? Math.max(SERVER_BATCH_LIMITS.min, Math.min(SERVER_BATCH_LIMITS.max, Math.floor(v.batch)))
    : d.batch;
  return {
    url: url || d.url,
    api: v.api === "openai" || v.api === "ollama" ? v.api : "auto",
    model: text(v.model, 200).trim(),
    queryPrefix: text(v.queryPrefix, 500),
    passagePrefix: text(v.passagePrefix, 500),
    batch,
  };
}

/** Anything malformed becomes the safe default: off. An unknown model id keeps the built-in choice off too. */
export function normalizeSemanticSettings(value: unknown): SemanticSettings {
  const d = defaultSemanticSettings();
  if (typeof value !== "object" || value === null) return d;
  const v = value as Record<string, unknown>;
  const known = typeof v.modelId === "string" && (v.modelId === CUSTOM_MODEL_ID || catalogModel(v.modelId) !== null);
  const engine: SemanticEngineChoice = v.engine === "server" ? "server" : "builtin";
  return {
    enabled: v.enabled === true && (known || engine === "server"),
    modelId: known ? (v.modelId as string) : d.modelId,
    custom: normalizeCustomModel(v.custom),
    engine,
    server: normalizeEmbeddingServer(v.server),
  };
}
