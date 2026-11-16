/**
 * Semantic search (0.9.5) — talking to an embedding server: the address rule,
 * the two wire formats and reading an answer.
 *
 * Pure: no network here. It builds requests and reads responses; the one
 * function that sends them is src/plugin/embedding-endpoint.ts.
 *
 * The server is never trusted: every answer is checked (one vector per text,
 * all the same length, every number finite, none all-zero) before a vector is
 * used, and each problem has its own plain sentence for the settings page.
 */
import { isGkxLoopbackHost, isGkxPrivateLanIpLiteral } from "gkos-engine";

/* ------------------------------------------------------------- the address */

export type EmbeddingAddressWhere = "this_computer" | "network";

export type EmbeddingAddressCheck =
  | {
      ok: true;
      /** Normalized address, without a trailing slash. */
      url: string;
      /** Shown to the user: scheme, host, port and path. */
      display: string;
      where: EmbeddingAddressWhere;
      /** https: */
      encrypted: boolean;
    }
  | { ok: false; error: string };

export const ADDRESS_RULE = "Use this computer (localhost, 127.x.x.x or ::1) or a numeric address on your private network (10.x.x.x, 172.16–31.x.x, 192.168.x.x, 169.254.x.x, fc00::/7 or fe80::/10). Public addresses and names other than localhost are refused, so note text cannot leave your network by mistake.";

const SECRET_PARAM = /(?:api[_-]?key|key|token|secret|password|passwd|signature|authorization|auth|bearer|credential)/i;

/**
 * May note text be sent to this address? The same policy as the model
 * endpoints elsewhere in the plugin (src/plugin/gkx-llm.ts): http or https;
 * this computer or a literal private-network address; no user name or
 * password, no fragment, no secret in the query.
 */
export function validateEmbeddingAddress(raw: unknown): EmbeddingAddressCheck {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { ok: false, error: "Type the address of your embedding server, for example http://127.0.0.1:8080." };
  if (!text.includes("://")) return { ok: false, error: "The address must start with http:// or https://, for example http://127.0.0.1:8080." };
  let url: URL;
  try { url = new URL(text); } catch { return { ok: false, error: "That is not a web address. Type one like http://127.0.0.1:8080." }; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: "The address must start with http:// or https://." };
  if (url.username || url.password) return { ok: false, error: "Leave the user name and password out of the address. Put a key in the API key field instead." };
  if (url.hash || text.includes("#")) return { ok: false, error: "Remove the # part from the address." };
  for (const key of url.searchParams.keys()) {
    if (SECRET_PARAM.test(key)) return { ok: false, error: "Do not put a key or token in the address. Put it in the API key field instead." };
  }
  const host = url.hostname;
  const local = isGkxLoopbackHost(host);
  if (!local && !isGkxPrivateLanIpLiteral(host)) return { ok: false, error: `${host || "This address"} is not allowed. ${ADDRESS_RULE}` };
  const path = url.pathname.replace(/\/+$/, "");
  const normalized = `${url.protocol}//${url.host}${path}${url.search}`;
  return { ok: true, url: normalized, display: `${url.protocol}//${url.host}${path}`, where: local ? "this_computer" : "network", encrypted: url.protocol === "https:" };
}

/* ------------------------------------------------------------- the errors */

export type EmbeddingErrorKind =
  | "address"
  | "unreachable"
  | "timeout"
  | "no_route"
  | "auth"
  | "needs_model"
  | "unavailable"
  | "http"
  | "too_large"
  | "not_json"
  | "bad_answer"
  | "dims";

/** Problems that are about the server, not about one text: indexing pauses instead of marking notes failed. */
const SERVER_WIDE: ReadonlySet<EmbeddingErrorKind> = new Set(["address", "unreachable", "timeout", "no_route", "auth", "needs_model", "unavailable", "dims"]);

/** Marks an error that crosses the worker boundary as a server-wide problem. */
export const SERVER_ERROR_CODE = "embedding_server";

export class EmbeddingServerError extends Error {
  readonly kind: EmbeddingErrorKind;
  readonly status: number;
  /** "embedding_server" when the server as a whole is the problem (see SERVER_WIDE); "" when one input is. */
  readonly code: string;
  constructor(kind: EmbeddingErrorKind, message: string, status = 0) {
    super(message);
    this.name = "EmbeddingServerError";
    this.kind = kind;
    this.status = status;
    this.code = SERVER_WIDE.has(kind) ? SERVER_ERROR_CODE : "";
  }
}

export const isEmbeddingServerError = (error: unknown): error is EmbeddingServerError => error instanceof EmbeddingServerError;

export const unreachableError = (display: string) =>
  new EmbeddingServerError("unreachable", `No embedding server answered at ${display}. Start it, or check the address.`);
export const timeoutError = (display: string, ms: number) =>
  new EmbeddingServerError("timeout", `The embedding server at ${display} did not answer within ${Number((ms / 1000).toFixed(2))} seconds. It may be busy or stuck; check it and press Retry.`);
export const needsModelError = () =>
  new EmbeddingServerError("needs_model", "Ollama needs a model name. Type it under Model name, for example bge-m3.");
export const dimsError = (got: number, expected: number) =>
  new EmbeddingServerError("dims", `The server now returns ${got}-number vectors but the index was built with ${expected}. The model on the server has changed: check the model name, then press Retry to build a new index for it.`);

/* ------------------------------------------------------------ wire formats */

export type WireApi = "openai" | "ollama";

export interface EmbeddingRequestBody { url: string; body: string }

/** Join a route to the base address, keeping any query string. */
function withPath(base: string, path: (current: string) => string): string {
  const url = new URL(base);
  url.pathname = path(url.pathname.replace(/\/+$/, ""));
  return url.toString();
}

/** OpenAI-compatible route: <base>/v1/embeddings, without repeating a /v1 or /v1/embeddings already typed. */
export function openAiRoute(base: string): string {
  return withPath(base, (p) => (/\/v1\/embeddings$/i.test(p) ? p : /\/v1$/i.test(p) ? `${p}/embeddings` : `${p}/v1/embeddings`));
}

/** Ollama route: <base>/api/embed. A typed /v1 (or /v1/embeddings) is dropped: Ollama's own route is not under it. */
export function ollamaRoute(base: string): string {
  return withPath(base, (p) => {
    const root = p.replace(/\/v1(?:\/embeddings)?$/i, "");
    return /\/api\/embed$/i.test(root) ? root : /\/api$/i.test(root) ? `${root}/embed` : `${root}/api/embed`;
  });
}

export function embeddingRequest(api: WireApi, base: string, model: string, texts: readonly string[]): EmbeddingRequestBody {
  if (api === "ollama") {
    if (!model) throw needsModelError();
    return { url: ollamaRoute(base), body: JSON.stringify({ model, input: [...texts], truncate: true }) };
  }
  return { url: openAiRoute(base), body: JSON.stringify({ input: [...texts], ...(model ? { model } : {}), encoding_format: "float" }) };
}

/* ------------------------------------------------------------ the answers */

export const ANSWER_LIMITS = {
  minDims: 16,
  maxDims: 8192,
  /** Largest answer read, in characters. 64 vectors of 8192 numbers as JSON fit with room to spare. */
  maxChars: 32 * 1024 * 1024,
  /** Characters of a server's own error text shown to the user. */
  serverMessage: 200,
} as const;

export interface EmbeddingAnswer {
  /** One unit-length vector per text, in the order of the texts. */
  vectors: Float32Array[];
  /** The model name the server reports ("" when it reports none). */
  model: string;
}

export interface AnswerContext {
  /** The address as shown to the user. */
  display: string;
  /** Whether an API key was sent (changes what a 401 says). */
  hasKey: boolean;
  /** "auto": a 404 is not the last word, Ollama is tried next. Only changes the 404 sentence. */
  api?: "auto" | WireApi;
  /** Whether a model name was sent (changes what a 400 about the model says). */
  hasModel?: boolean;
}

/** A short, printable excerpt of a server's own error text. */
function serverText(text: string): string {
  let detail = text;
  try {
    const parsed = JSON.parse(text) as { error?: unknown; message?: unknown; detail?: unknown };
    const e = parsed?.error;
    detail = typeof e === "string" ? e
      : typeof (e as { message?: unknown })?.message === "string" ? (e as { message: string }).message
      : typeof parsed?.message === "string" ? parsed.message
      : typeof parsed?.detail === "string" ? parsed.detail
      : text;
  } catch { /* not JSON: use the text */ }
  // eslint-disable-next-line no-control-regex
  const clean = detail.replace(/[\u0000-\u001f\u007f<>]+/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > ANSWER_LIMITS.serverMessage ? `${clean.slice(0, ANSWER_LIMITS.serverMessage)}…` : clean;
}

/** The plain sentence for an HTTP status other than 2xx. */
export function httpError(status: number, text: string, context: AnswerContext): EmbeddingServerError {
  // 501 is what llama-server answers when it runs without --embeddings (seen on a
  // live server): the route exists but is switched off, which is the same advice.
  if (status === 404 || status === 405 || status === 501) {
    // Set to Ollama and answered so: the address is a server of the other type.
    if (context.api === "ollama") {
      return new EmbeddingServerError("no_route", "This server has no Ollama embedding route. Under Server type, choose Detect automatically.", status);
    }
    return new EmbeddingServerError("no_route", "This server has no embedding route. Start llama-server with --embeddings, or choose Ollama.", status);
  }
  if (status === 401 || status === 403) {
    return new EmbeddingServerError("auth", context.hasKey ? "The server did not accept the API key." : "The server asked for an API key.", status);
  }
  const detail = serverText(text);
  const said = detail ? ` It said: “${detail}”` : "";
  // A gateway that serves several models (LiteLLM, seen on a live one) refuses a
  // request without a model name with a 400 or 422 that names the model.
  if ((status === 400 || status === 422) && context.hasModel === false && /\bmodel\b/i.test(detail)) {
    return new EmbeddingServerError("needs_model", `This server needs a model name. Type it under Model name; ${context.display.replace(/\/v1(\/embeddings)?\/?$/, "")}/v1/models lists the names it serves.${said}`, status);
  }
  if (status === 413) return new EmbeddingServerError("http", `The text was too long for the server (HTTP 413).${said}`, status);
  if (status === 502 || status === 503 || status === 504) {
    return new EmbeddingServerError("unavailable", `The embedding server at ${context.display} is not ready (HTTP ${status}); it may still be loading its model.${said}`, status);
  }
  return new EmbeddingServerError("http", `The embedding server answered with an error (HTTP ${status}).${said}`, status);
}

const bad = (message: string) => new EmbeddingServerError("bad_answer", message);

function toVector(value: unknown, at: number): Float64Array {
  if (typeof value === "string") throw bad("The server sent the vectors in a format this plugin does not read (base64 text instead of numbers).");
  if (!Array.isArray(value)) throw bad(`The server's answer has no vector for text ${at + 1}.`);
  const out = new Float64Array(value.length);
  for (let i = 0; i < value.length; i++) {
    const x = value[i];
    if (typeof x !== "number" || !Number.isFinite(x)) throw bad("The server returned a vector with a number that is not finite (NaN or infinity).");
    out[i] = x;
  }
  return out;
}

/**
 * Read a 2xx answer for `count` texts. Throws an EmbeddingServerError with a
 * plain sentence for anything that is not exactly one usable vector per text.
 */
export function readEmbeddingAnswer(api: WireApi, text: string, count: number): EmbeddingAnswer {
  if (text.length > ANSWER_LIMITS.maxChars) {
    throw new EmbeddingServerError("too_large", `The server's answer was larger than ${Math.round(ANSWER_LIMITS.maxChars / 1024 / 1024)} MB; it was not read.`);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch {
    throw new EmbeddingServerError("not_json", "The server's answer was not JSON. Check that the address points at an embedding server.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw bad("The server's answer is not an embedding answer.");
  const p = parsed as Record<string, unknown>;
  const model = typeof p.model === "string" ? p.model.slice(0, 200) : "";
  let raw: unknown[];
  if (api === "ollama") {
    if (!Array.isArray(p.embeddings)) throw bad("The server's answer has no \"embeddings\" list. Is this an Ollama server?");
    raw = p.embeddings;
  } else {
    if (!Array.isArray(p.data)) throw bad("The server's answer has no \"data\" list. Is this an OpenAI-compatible embedding server?");
    const items = p.data as Array<Record<string, unknown> | null>;
    const indexed = items.filter((item) => typeof item?.index === "number").length;
    if (indexed !== 0 && indexed !== items.length) throw bad("The server's answer has a missing or repeated index.");
    raw = new Array(items.length);
    const seen = new Set<number>();
    items.forEach((item, position) => {
      const at = indexed ? (item!.index as number) : position;
      if (!Number.isInteger(at) || at < 0 || at >= items.length || seen.has(at)) throw bad("The server's answer has a missing or repeated index.");
      seen.add(at);
      raw[at] = item?.embedding;
    });
  }
  if (raw.length !== count) throw bad(`The server returned ${raw.length} vector${raw.length === 1 ? "" : "s"} for ${count} text${count === 1 ? "" : "s"}.`);
  const vectors: Float32Array[] = [];
  let dims = -1;
  raw.forEach((value, at) => {
    const v = toVector(value, at);
    if (dims === -1) {
      dims = v.length;
      if (dims < ANSWER_LIMITS.minDims || dims > ANSWER_LIMITS.maxDims) throw bad(`The server returned a ${dims}-number vector; ${ANSWER_LIMITS.minDims} to ${ANSWER_LIMITS.maxDims} numbers are supported.`);
    } else if (v.length !== dims) throw bad("The server returned vectors of different lengths in one answer.");
    let sum = 0;
    for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
    const norm = Math.sqrt(sum);
    if (!(norm > 0) || !Number.isFinite(norm)) throw bad("The server returned an empty (all-zero) vector.");
    const out = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
    vectors.push(out);
  });
  return { vectors, model };
}
