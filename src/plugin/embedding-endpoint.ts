/**
 * Semantic search (0.9.5) — the embedding server's one request.
 *
 * Used only when the user chose "Embedding server" in Settings → Semantic
 * search. `requestEmbeddings` is the only place that sends note text out of
 * the plugin, and it sends it only to the address the user typed, after that
 * address has passed the address rule (this computer, or a literal
 * private-network address — see src/semantic/endpoint.ts). It runs on the
 * main thread with Obsidian's requestUrl, which browser CORS rules do not
 * block (llama.cpp and Ollama send no CORS headers by default).
 *
 * The optional API key is kept per device in Obsidian's local storage, not in
 * the plugin's settings file, so it does not sync. It is sent only as an
 * Authorization header, never logged and never put in a message.
 */
import { requestUrl, type App } from "obsidian";
import { EmbeddingServerError, timeoutError, unreachableError, validateEmbeddingAddress } from "../semantic/endpoint";
import type { EmbeddingTransport } from "../semantic/remote";

/** Local-storage name of the API key (per vault, per device). */
const KEY_STORAGE = "kosmos-oden-embedding-server-key";

export interface EmbeddingKeyStore {
  has(): boolean;
  get(): string;
  set(key: string): void;
}

/** The API key, on this device only. */
export function embeddingKeyStore(app: App): EmbeddingKeyStore {
  const get = (): string => {
    const value: unknown = app.loadLocalStorage(KEY_STORAGE);
    return typeof value === "string" ? value : "";
  };
  return {
    has: () => get().length > 0,
    get,
    set: (key: string) => { const k = key.trim(); app.saveLocalStorage(KEY_STORAGE, k ? k : null); },
  };
}

/** The transport for one key store: one POST to a checked address, with a timeout. */
export function embeddingTransport(keys: EmbeddingKeyStore): EmbeddingTransport {
  return (request) => requestEmbeddings(request, keys.get());
}

/**
 * Send one embedding request. Resolves with the status and body for any HTTP
 * answer; rejects when nothing answered or it took longer than the timeout.
 */
export const requestEmbeddings = async (request: { url: string; body: string; timeoutMs: number }, apiKey: string): Promise<{ status: number; text: string }> => {
  const check = validateEmbeddingAddress(request.url);
  if (check.ok === false) throw new EmbeddingServerError("address", (check as { error: string }).error);
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // requestUrl cannot be aborted: race it with a timer, and drop a late answer.
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(timeoutError(check.display, request.timeoutMs)), request.timeoutMs); });
  try {
    const response = await Promise.race([
      requestUrl({ url: check.url, method: "POST", contentType: "application/json", headers, body: request.body, throw: false }),
      timeout,
    ]);
    let text = response.text ?? "";
    // A server that echoes the key must not put it on the screen.
    if (apiKey && text.includes(apiKey)) text = text.split(apiKey).join("…");
    return { status: response.status, text };
  } catch (error) {
    if (error instanceof EmbeddingServerError) throw error;
    // The platform's own error (refused, no route, bad certificate) may quote the request; say it plainly instead.
    throw unreachableError(check.display);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
