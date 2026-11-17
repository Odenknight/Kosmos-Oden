/**
 * Semantic search (0.9.5) — the embedding-server client.
 *
 * Runs on the plugin's main thread (never in the worker). It decides what to
 * send and how to recover; the request itself is made by the injected
 * transport — in Obsidian the single function in
 * src/plugin/embedding-endpoint.ts, in tests a stand-in over Node's fetch.
 *
 *   - "auto": OpenAI-compatible first; on HTTP 404/405, Ollama (when a model
 *     name is set). The route that answered is kept for the session.
 *   - Indexing: a call that cannot reach the server is tried once more after
 *     2 s. Questions are not retried: the Librarian answers by words instead.
 *   - Too-long input: a batch refused with an HTTP error is sent text by text;
 *     a text still refused (400/413/500) is cut in half and sent again, at
 *     most three times.
 *   - A text the server still answers with a 5xx: one short word is sent. If
 *     that fails too, the error is about the server ("unavailable"), not
 *     about the text.
 *   - HTTP 429 is always about the server ("unavailable"): it says how much
 *     is being asked, not what is wrong with a text, and a short word may
 *     still be answered while a passage is refused.
 *
 * Pure apart from the injected transport and clock.
 */
import type { EmbedKind } from "./engine";
import {
  EmbeddingServerError,
  dimsError,
  embeddingRequest,
  httpError,
  isEmbeddingServerError,
  needsModelError,
  readEmbeddingAnswer,
  unreachableError,
  type WireApi,
} from "./endpoint";
import type { EmbeddingServerApi } from "./settings";

export interface EmbeddingHttpRequest {
  /** Full request URL. Must pass validateEmbeddingAddress; the transport checks again. */
  url: string;
  /** JSON body. */
  body: string;
  timeoutMs: number;
}

export interface EmbeddingHttpResponse { status: number; text: string }

/**
 * Sends one POST. Resolves with any HTTP status; rejects only when no answer
 * came (nothing listening, refused, timed out). A timeout should reject with
 * an EmbeddingServerError of kind "timeout"; anything else that rejects is
 * reported as "nothing answered".
 */
export type EmbeddingTransport = (request: EmbeddingHttpRequest) => Promise<EmbeddingHttpResponse>;

export interface EmbeddingClientConfig {
  /** A validated address (validateEmbeddingAddress(...).url). */
  url: string;
  /** The address as shown to the user. */
  display: string;
  api: EmbeddingServerApi;
  model: string;
  queryPrefix: string;
  passagePrefix: string;
  batch: number;
  /** Whether the transport will send an API key (the key itself never comes here). */
  hasKey: boolean;
  timeoutMs?: number;
}

export interface ProbeResult {
  dims: number;
  /** The model name: typed, else as the server reports it, else "". */
  model: string;
  /** The model name the server reported ("" when none). */
  reported: string;
  /** The route that answered. */
  api: WireApi;
  ms: number;
}

export const CLIENT_LIMITS = {
  timeoutMs: 60_000,
  retryAfterMs: 2_000,
  halvings: 3,
} as const;

/** HTTP statuses that may mean "this input is too long". */
const HALVABLE = new Set([400, 413, 500]);

/**
 * A prefix as typed in a one-line box: the two characters \n stand for a line
 * break (Qwen3-Embedding's question prefix has one), as in its model card.
 */
export function expandPrefix(prefix: string): string {
  return prefix.replace(/\\n/g, "\n");
}

/** Cut a text to about half, never between the two halves of a surrogate pair. */
export function halveText(text: string): string {
  let cut = Math.floor(text.length / 2);
  if (cut > 0 && cut < text.length) {
    const code = text.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut--;
  }
  return text.slice(0, cut);
}

export interface EmbeddingClientOptions {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class EmbeddingClient {
  /** The route that answered (auto), kept for the session. */
  detected: WireApi | null = null;
  /** Vector length the index expects; 0 until probed. */
  expectDims = 0;
  /** Model name the server last reported. */
  reported = "";
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(readonly config: EmbeddingClientConfig, private readonly transport: EmbeddingTransport, options: EmbeddingClientOptions = {}) {
    this.sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    if (config.api !== "auto") this.detected = config.api;
  }

  get batch(): number { return Math.max(1, Math.floor(this.config.batch)); }

  private get timeoutMs(): number { return this.config.timeoutMs ?? CLIENT_LIMITS.timeoutMs; }

  /** One request with one route. Rejects with an EmbeddingServerError. */
  private async post(api: WireApi, texts: readonly string[]): Promise<{ vectors: Float32Array[]; model: string }> {
    const { url, body } = embeddingRequest(api, this.config.url, this.config.model, texts);
    let response: EmbeddingHttpResponse;
    try {
      response = await this.transport({ url, body, timeoutMs: this.timeoutMs });
    } catch (error) {
      if (isEmbeddingServerError(error)) throw error;
      throw unreachableError(this.config.display);
    }
    if (response.status < 200 || response.status >= 300) {
      throw httpError(response.status, response.text ?? "", { display: this.config.display, hasKey: this.config.hasKey, api: this.config.api, hasModel: this.config.model !== "" });
    }
    return readEmbeddingAnswer(api, response.text ?? "", texts.length);
  }

  /** One request, choosing the route (auto: OpenAI-compatible, then Ollama on 404/405). */
  private async send(texts: readonly string[]): Promise<Float32Array[]> {
    let answer: { vectors: Float32Array[]; model: string };
    if (this.detected) {
      if (this.detected === "ollama" && !this.config.model) throw needsModelError();
      answer = await this.post(this.detected, texts);
    } else {
      try {
        answer = await this.post("openai", texts);
        this.detected = "openai";
      } catch (error) {
        if (!(isEmbeddingServerError(error) && error.kind === "no_route" && this.config.model)) throw error;
        answer = await this.post("ollama", texts);
        this.detected = "ollama";
      }
    }
    if (answer.model) this.reported = answer.model;
    const dims = answer.vectors[0]?.length ?? 0;
    if (this.expectDims && dims !== this.expectDims) throw dimsError(dims, this.expectDims);
    return answer.vectors;
  }

  /**
   * Embed the probe text once: the vector length, the model name and the
   * route. Sets the vector length every later answer must have.
   */
  async probe(): Promise<ProbeResult> {
    const started = this.now();
    this.expectDims = 0;
    const [vector] = await this.send([`${expandPrefix(this.config.queryPrefix)}probe`]);
    this.expectDims = vector.length;
    return { dims: vector.length, model: this.config.model || this.reported, reported: this.reported, api: this.detected ?? "openai", ms: Math.max(0, Math.round(this.now() - started)) };
  }

  /** One vector per text, in order. Prefixes are added here. */
  async embed(texts: readonly string[], kind: EmbedKind): Promise<Float32Array[]> {
    const prefix = expandPrefix(kind === "query" ? this.config.queryPrefix : this.config.passagePrefix);
    const out: Float32Array[] = [];
    for (let at = 0; at < texts.length; at += this.batch) {
      const slice = texts.slice(at, at + this.batch).map((t) => prefix + t);
      out.push(...await this.embedBatch(slice, kind));
    }
    return out;
  }

  /** While indexing, a call that found no server, or a busy one (HTTP 429), is tried once more after 2 s. */
  private async retried<T>(kind: EmbedKind, run: () => Promise<T>): Promise<T> {
    const attempt = (): Promise<T> => run().catch((error) => {
      throw isEmbeddingServerError(error) && error.kind === "http" && error.status === 429
        ? new EmbeddingServerError("unavailable", error.message, 429) : error;
    });
    try { return await attempt(); }
    catch (error) {
      if (kind !== "passage" || !isEmbeddingServerError(error) || !["unreachable", "timeout", "unavailable"].includes(error.kind)) throw error;
      await this.sleep(CLIENT_LIMITS.retryAfterMs);
      return attempt();
    }
  }

  private async embedBatch(texts: string[], kind: EmbedKind): Promise<Float32Array[]> {
    if (texts.length === 1) return [await this.embedOne(texts[0], kind)];
    try {
      return await this.retried(kind, () => this.send(texts));
    } catch (error) {
      // Only an HTTP refusal of the input is worth splitting; a server problem is not.
      if (!(isEmbeddingServerError(error) && error.kind === "http")) throw error;
    }
    const out: Float32Array[] = [];
    for (const text of texts) out.push(await this.embedOne(text, kind));
    return out;
  }

  /** One text; cut in half (at most three times) while the server refuses it as too long. */
  private async embedOne(text: string, kind: EmbedKind): Promise<Float32Array> {
    let current = text;
    for (let halvings = 0; ; halvings++) {
      try {
        const [vector] = await this.retried(kind, () => this.send([current]));
        return vector;
      } catch (error) {
        const http = isEmbeddingServerError(error) && error.kind === "http";
        const refused = http && HALVABLE.has(error.status);
        const shorter = halveText(current);
        if (refused && halvings < CLIENT_LIMITS.halvings && shorter) { current = shorter; continue; }
        // A 5xx that shortening did not cure: this text, or the server?
        // If the server will not embed one word either, the server is the
        // problem and indexing pauses, where an error about this text would
        // go on to mark every note failed.
        if (http && error.status >= 500 && !(await this.answers())) {
          throw new EmbeddingServerError("unavailable", error.message, error.status);
        }
        throw error;
      }
    }
  }

  /** Whether the server embeds one short word now. */
  private async answers(): Promise<boolean> {
    try { await this.send([`${expandPrefix(this.config.queryPrefix)}probe`]); return true; } catch { return false; }
  }
}

