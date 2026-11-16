/**
 * Semantic search (0.9.5) — the embedding model catalog.
 *
 * Plain data. Every downloadable model:
 *   - is published under the MIT or Apache-2.0 license, declared by the very
 *     repository the files are downloaded from (not only by an upstream model);
 *   - is pinned to one immutable repository revision (40-hex commit);
 *   - lists every file with its exact size and SHA-256, verified after download
 *     and again each time the model is loaded.
 *
 * A model the user supplies themselves ("custom") is described by the same
 * shape, without a source: its licence is the user's own responsibility and
 * nothing is downloaded for it.
 *
 * Pure: no Obsidian, no Node, no DOM.
 */

export const ALLOWED_MODEL_LICENSES = ["MIT", "Apache-2.0"] as const;
export type ModelLicense = (typeof ALLOWED_MODEL_LICENSES)[number];

export type Pooling = "mean" | "cls";

/** How text becomes one vector. Everything the runtime needs besides the files. */
export interface EmbeddingRecipe {
  /** Vector length the model emits. 0 = detect from the first run (custom models). */
  dims: number;
  pooling: Pooling;
  /** Tokens per input, special tokens included. Longer text is truncated. */
  maxTokens: number;
  /** Prepended to a question before embedding. */
  queryPrefix: string;
  /** Prepended to a note passage before embedding. */
  passagePrefix: string;
}

export interface ModelFile {
  /** Path inside the source repository. */
  path: string;
  /** Name the file is stored under in the model's folder. */
  name: "model.onnx" | "tokenizer.json" | "tokenizer_config.json";
  bytes: number;
  sha256: string;
}

export interface CatalogModel extends EmbeddingRecipe {
  id: string;
  /** Shown in the drop-down. */
  label: string;
  /** One line under the drop-down. */
  summary: string;
  license: ModelLicense;
  /** Where the licence is declared. */
  licenseUrl: string;
  languages: "English" | "Multilingual (100+ languages)";
  /** Hugging Face repository the files come from. */
  repo: string;
  /** Immutable commit of that repository. */
  revision: string;
  files: readonly ModelFile[];
  /** True for the model offered first. */
  recommended?: boolean;
}

const HF = "https://huggingface.co";
const BGE_QUERY = "Represent this sentence for searching relevant passages: ";

export const MODEL_CATALOG: readonly CatalogModel[] = [
  {
    id: "arctic-embed-s",
    label: "Snowflake Arctic Embed S — recommended (35 MB)",
    summary: "Best retrieval quality for its size. English.",
    license: "Apache-2.0",
    licenseUrl: `${HF}/Snowflake/snowflake-arctic-embed-s`,
    languages: "English",
    repo: "Snowflake/snowflake-arctic-embed-s",
    revision: "e596f507467533e48a2e17c007f0e1dacc837b33",
    dims: 384, pooling: "cls", maxTokens: 512, queryPrefix: BGE_QUERY, passagePrefix: "",
    recommended: true,
    files: [
      { path: "onnx/model_quantized.onnx", name: "model.onnx", bytes: 34015111, sha256: "f93ff225320628d2e88baf2a395cae791b0e3b27edf5c70bf7b312a4d3260c14" },
      { path: "tokenizer.json", name: "tokenizer.json", bytes: 711649, sha256: "91f1def9b9391fdabe028cd3f3fcc4efd34e5d1f08c3bf2de513ebb5911a1854" },
      { path: "tokenizer_config.json", name: "tokenizer_config.json", bytes: 1433, sha256: "9ca59277519f6e3692c8685e26b94d4afca2d5438deff66483db495e48735810" },
    ],
  },
  {
    id: "all-minilm-l6-v2",
    label: "all-MiniLM-L6-v2 — smallest and fastest (24 MB)",
    summary: "Quickest to build an index; good for short notes. English.",
    license: "Apache-2.0",
    licenseUrl: `${HF}/Xenova/all-MiniLM-L6-v2`,
    languages: "English",
    repo: "Xenova/all-MiniLM-L6-v2",
    revision: "751bff37182d3f1213fa05d7196b954e230abad9",
    dims: 384, pooling: "mean", maxTokens: 256, queryPrefix: "", passagePrefix: "",
    files: [
      { path: "onnx/model_quantized.onnx", name: "model.onnx", bytes: 22972370, sha256: "afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1" },
      { path: "tokenizer.json", name: "tokenizer.json", bytes: 711661, sha256: "da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0" },
      { path: "tokenizer_config.json", name: "tokenizer_config.json", bytes: 366, sha256: "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3" },
    ],
  },
  {
    id: "bge-small-en-v1.5",
    label: "BGE Small EN v1.5 — full precision (134 MB)",
    summary: "Unquantized weights: the most exact vectors of the small models. English.",
    license: "MIT",
    licenseUrl: `${HF}/BAAI/bge-small-en-v1.5`,
    languages: "English",
    repo: "BAAI/bge-small-en-v1.5",
    revision: "5c38ec7c405ec4b44b94cc5a9bb96e735b38267a",
    dims: 384, pooling: "cls", maxTokens: 512, queryPrefix: BGE_QUERY, passagePrefix: "",
    files: [
      { path: "onnx/model.onnx", name: "model.onnx", bytes: 133093490, sha256: "828e1496d7fabb79cfa4dcd84fa38625c0d3d21da474a00f08db0f559940cf35" },
      { path: "tokenizer.json", name: "tokenizer.json", bytes: 711396, sha256: "d241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66" },
      { path: "tokenizer_config.json", name: "tokenizer_config.json", bytes: 366, sha256: "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3" },
    ],
  },
  {
    id: "bge-base-en-v1.5",
    label: "BGE Base EN v1.5 — higher quality, slower (111 MB)",
    summary: "Larger model: better on long or subtle notes, about three times slower to index. English.",
    license: "MIT",
    licenseUrl: `${HF}/Xenova/bge-base-en-v1.5`,
    languages: "English",
    repo: "Xenova/bge-base-en-v1.5",
    revision: "4d6cd88e18e51a5e020c2c305726d76ada9c03cf",
    dims: 768, pooling: "cls", maxTokens: 512, queryPrefix: BGE_QUERY, passagePrefix: "",
    files: [
      { path: "onnx/model_quantized.onnx", name: "model.onnx", bytes: 110083337, sha256: "c9729cc84cbd0e9fecc759505d2be65916c9fe05222d7ea26c65fcb3382af38d" },
      { path: "tokenizer.json", name: "tokenizer.json", bytes: 711396, sha256: "d241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66" },
      { path: "tokenizer_config.json", name: "tokenizer_config.json", bytes: 366, sha256: "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3" },
    ],
  },
  {
    id: "multilingual-e5-small",
    label: "Multilingual E5 Small — 100+ languages (135 MB)",
    summary: "For notes that are not in English, or that mix languages.",
    license: "MIT",
    licenseUrl: `${HF}/intfloat/multilingual-e5-small`,
    languages: "Multilingual (100+ languages)",
    repo: "intfloat/multilingual-e5-small",
    revision: "614241f622f53c4eeff9890bdc4f31cfecc418b3",
    dims: 384, pooling: "mean", maxTokens: 512, queryPrefix: "query: ", passagePrefix: "passage: ",
    files: [
      { path: "onnx/model_qint8_avx512_vnni.onnx", name: "model.onnx", bytes: 118346824, sha256: "dd476dd0c2514e9b9be83aeb3853fac0763e0bdf4a71645407587d77c48a2d88" },
      { path: "tokenizer.json", name: "tokenizer.json", bytes: 17082730, sha256: "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39" },
      { path: "tokenizer_config.json", name: "tokenizer_config.json", bytes: 443, sha256: "a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b" },
    ],
  },
];

export const CUSTOM_MODEL_ID = "custom";
export const DEFAULT_MODEL_ID = MODEL_CATALOG.find((m) => m.recommended)!.id;

export function catalogModel(id: string): CatalogModel | null {
  return MODEL_CATALOG.find((m) => m.id === id) ?? null;
}

/** Download URL of one catalog file: the pinned revision, never a branch. */
export function modelFileUrl(model: CatalogModel, file: ModelFile): string {
  return `${HF}/${model.repo}/resolve/${model.revision}/${file.path}`;
}

export function modelDownloadBytes(model: CatalogModel): number {
  return model.files.reduce((sum, f) => sum + f.bytes, 0);
}

/** Problems with the catalog itself; empty when it meets its own rules. Run by the tests and the invariant check. */
export function validateCatalog(models: readonly CatalogModel[] = MODEL_CATALOG): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const m of models) {
    const at = `model ${m.id}`;
    if (!/^[a-z0-9][a-z0-9.-]{1,63}$/.test(m.id) || m.id === CUSTOM_MODEL_ID) problems.push(`${at}: invalid id`);
    if (ids.has(m.id)) problems.push(`${at}: duplicate id`);
    ids.add(m.id);
    if (!(ALLOWED_MODEL_LICENSES as readonly string[]).includes(m.license)) problems.push(`${at}: licence ${m.license} is not MIT or Apache-2.0`);
    if (!/^[0-9a-f]{40}$/.test(m.revision)) problems.push(`${at}: revision is not a 40-hex commit`);
    if (!/^[\w.-]+\/[\w.-]+$/.test(m.repo)) problems.push(`${at}: invalid repository`);
    if (!m.licenseUrl.startsWith(`${HF}/${m.repo}`)) problems.push(`${at}: the licence must be declared by the repository the files come from`);
    if (!(m.dims > 0 && m.dims <= 4096)) problems.push(`${at}: invalid dims`);
    if (!(m.maxTokens >= 16 && m.maxTokens <= 8192)) problems.push(`${at}: invalid maxTokens`);
    const names = m.files.map((f) => f.name).sort().join(",");
    if (names !== "model.onnx,tokenizer.json,tokenizer_config.json") problems.push(`${at}: must list exactly model.onnx, tokenizer.json and tokenizer_config.json`);
    for (const f of m.files) {
      if (!/^[0-9a-f]{64}$/.test(f.sha256)) problems.push(`${at}: ${f.path} has no SHA-256`);
      if (!(f.bytes > 0)) problems.push(`${at}: ${f.path} has no size`);
      if (f.path.includes("..") || f.path.startsWith("/")) problems.push(`${at}: ${f.path} is not a repository-relative path`);
    }
  }
  if (models.filter((m) => m.recommended).length !== 1) problems.push("exactly one model must be recommended");
  return problems;
}

/* ------------------------------------------------------------- custom model */

/** Settings the user gives for their own model files. */
export interface CustomModelSettings {
  /** Display name. */
  name: string;
  pooling: Pooling;
  maxTokens: number;
  queryPrefix: string;
  passagePrefix: string;
}

export function defaultCustomModel(): CustomModelSettings {
  return { name: "", pooling: "mean", maxTokens: 512, queryPrefix: "", passagePrefix: "" };
}

export function normalizeCustomModel(value: unknown): CustomModelSettings {
  const v = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const text = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
  const maxTokens = typeof v.maxTokens === "number" && Number.isFinite(v.maxTokens) ? Math.max(16, Math.min(8192, Math.floor(v.maxTokens))) : 512;
  return {
    name: text(v.name, 80).trim(),
    pooling: v.pooling === "cls" ? "cls" : "mean",
    maxTokens,
    queryPrefix: text(v.queryPrefix, 200),
    passagePrefix: text(v.passagePrefix, 200),
  };
}

/** The recipe and identity used for the selected model. `key` names its index: a different key means different vectors. */
export interface ActiveModel extends EmbeddingRecipe {
  id: string;
  label: string;
  /** Changes whenever vectors made with the old value would not be comparable with new ones. */
  key: string;
  custom: boolean;
}

export function activeModel(id: string, custom: CustomModelSettings, customFingerprint = ""): ActiveModel | null {
  if (id === CUSTOM_MODEL_ID) {
    const c = normalizeCustomModel(custom);
    const recipe = `${c.pooling}|${c.maxTokens}|${c.queryPrefix}|${c.passagePrefix}`;
    return { id: CUSTOM_MODEL_ID, label: c.name || "Your own model", key: `custom:${customFingerprint}:${recipe}`, custom: true, dims: 0, pooling: c.pooling, maxTokens: c.maxTokens, queryPrefix: c.queryPrefix, passagePrefix: c.passagePrefix };
  }
  const m = catalogModel(id);
  if (!m) return null;
  return { id: m.id, label: m.label, key: `${m.id}@${m.revision.slice(0, 12)}`, custom: false, dims: m.dims, pooling: m.pooling, maxTokens: m.maxTokens, queryPrefix: m.queryPrefix, passagePrefix: m.passagePrefix };
}
