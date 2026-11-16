/**
 * Semantic search (0.9.5) — a fake embedding server and the transport tests
 * use in place of Obsidian's requestUrl.
 *
 * The server is a real node:http server on 127.0.0.1 that speaks both wire
 * formats the plugin knows: OpenAI-compatible (POST /v1/embeddings, as
 * llama.cpp's llama-server, LM Studio, vLLM) and Ollama (POST /api/embed).
 * Its vectors are the deterministic "concept" vectors of semantic-fixture.mjs,
 * widened to 24 numbers, so tests can say which notes are close in meaning.
 *
 * The transport has the same signature as the plugin's one
 * (src/plugin/embedding-endpoint.ts) and the same rules: the address is
 * checked before anything is sent, a timeout is an error of its own, and the
 * key is only ever an Authorization header. It uses Node's fetch.
 */
import http from "node:http";
import { EmbeddingServerError, SemanticController, normalizeSemanticSettings, timeoutError, validateEmbeddingAddress } from "../../dist/kosmos-semantic.mjs";
import { FAKE_DIMS, NOTES, conceptVector, fakeWorkerFactory, memoryFiles, noteSource, sha256 } from "./semantic-fixture.mjs";

export const SERVER_DIMS = 24;
export const SERVER_MODEL = "fake-embed-v1";

export function serverVector(text, dims = SERVER_DIMS) {
  const v = conceptVector(text);
  return Array.from({ length: dims }, (_, i) => v[i % FAKE_DIMS] * 3);
}

/**
 * Start a fake embedding server. `opts` can be changed while it runs:
 *   formats   which routes exist ("openai", "ollama")
 *   model     model name it reports ("" = none); dims  vector length
 *   maxChars  an input longer than this is refused with `tooLongStatus`
 *   key       when set, a request without "Authorization: Bearer <key>" gets 401
 *   hang      never answer
 *   reverse   send OpenAI "data" in reverse order (with the right index)
 */
export async function fakeEmbeddingServer(options = {}) {
  const opts = { formats: ["openai", "ollama"], model: SERVER_MODEL, dims: SERVER_DIMS, maxChars: Infinity, tooLongStatus: 413, key: "", hang: false, reverse: true, ...options };
  const log = [];
  const hanging = new Set();
  const handler = (req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      let parsed = null;
      try { parsed = JSON.parse(body); } catch { /* left null */ }
      const entry = { path: req.url, method: req.method, auth: req.headers.authorization ?? "", contentType: req.headers["content-type"] ?? "", body: parsed, input: parsed?.input ?? [] };
      log.push(entry);
      if (opts.hang) { hanging.add(res); return; }
      const send = (status, value) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(typeof value === "string" ? value : JSON.stringify(value)); };
      if (req.method !== "POST") return send(405, { error: "method not allowed" });
      const route = req.url.replace(/\?.*$/, "");
      const format = route === "/v1/embeddings" ? "openai" : route === "/api/embed" ? "ollama" : null;
      if (!format || !opts.formats.includes(format)) return send(404, { error: "not found" });
      if (opts.key && entry.auth !== `Bearer ${opts.key}`) return send(401, { error: { message: "invalid api key" } });
      if (!parsed || !Array.isArray(parsed.input)) return send(400, { error: "input must be a list" });
      if (format === "ollama" && !parsed.model) return send(400, { error: "model is required" });
      const tooLong = parsed.input.find((t) => t.length > opts.maxChars);
      if (tooLong !== undefined) return send(opts.tooLongStatus, { error: { message: `input is too large to process (${tooLong.length} characters)` } });
      const vectors = parsed.input.map((t) => serverVector(t, opts.dims));
      if (format === "ollama") return send(200, { model: parsed.model, embeddings: vectors });
      const data = vectors.map((embedding, index) => ({ object: "embedding", index, embedding }));
      return send(200, { object: "list", ...(opts.model ? { model: parsed.model || opts.model } : {}), data: opts.reverse ? data.reverse() : data });
    });
  };
  let server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const stop = async () => {
    for (const res of hanging) { try { res.destroy(); } catch { /* gone */ } }
    hanging.clear();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(() => r()));
  };
  return {
    opts, log, port,
    url: `http://127.0.0.1:${port}`,
    /** Inputs of every successful-looking request to one route. */
    inputs: (route) => log.filter((e) => e.path === route).flatMap((e) => e.input),
    /** Stop listening: nothing answers at the address any more. */
    async down() { await stop(); },
    /** Listen again on the same port. */
    async up() { server = http.createServer(handler); await new Promise((r) => server.listen(port, "127.0.0.1", r)); },
    close: stop,
  };
}

/** The test transport: the plugin's rules over Node's fetch. `sent` records every request. */
export function nodeTransport(apiKey = "") {
  const sent = [];
  const transport = async ({ url, body, timeoutMs }) => {
    const check = validateEmbeddingAddress(url);
    if (!check.ok) throw new EmbeddingServerError("address", check.error);
    sent.push({ url: check.url, body });
    const headers = { "Content-Type": "application/json", Accept: "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) };
    try {
      const response = await fetch(check.url, { method: "POST", headers, body, signal: AbortSignal.timeout(timeoutMs) });
      return { status: response.status, text: await response.text() };
    } catch (error) {
      if (error?.name === "TimeoutError" || error?.name === "AbortError") throw timeoutError(check.display, timeoutMs);
      throw error;
    }
  };
  transport.sent = sent;
  return transport;
}

/**
 * The real SemanticController with the embedding-server engine: in-memory
 * files, the in-process worker, the Node transport. `clock.at` is the
 * controller's clock (advance it to pass the 30 s retry rule); `sleeps`
 * records the client's waits (none really happen).
 */
export async function serverController({ url, server = {}, settings = {}, notes = NOTES, apiKey = "", timeoutMs } = {}) {
  const files = memoryFiles();
  const root = ".obsidian/plugins/kosmos-oden/semantic";
  const source = noteSource(notes);
  const createWorker = fakeWorkerFactory();
  const transport = nodeTransport(apiKey);
  const clock = { at: 1_000_000 };
  const sleeps = [];
  let saved = normalizeSemanticSettings({ enabled: true, engine: "server", ...settings, server: { url, ...server } });
  const listeners = new Set();
  const downloads = [];
  const controller = new SemanticController({
    files, root, sha256, createWorker, source, transport,
    download: async (u) => { downloads.push(u); throw new Error("no download with an embedding server"); },
    settings: () => saved,
    onChange: () => { for (const fn of [...listeners]) fn(); },
    hasServerKey: () => apiKey.length > 0,
    now: () => clock.at,
    ...(timeoutMs ? { serverTimeoutMs: timeoutMs } : {}),
    clientOptions: { sleep: async (ms) => { sleeps.push(ms); }, now: () => clock.at },
  });
  return {
    controller, files, root, source, createWorker, transport, clock, sleeps, downloads,
    settings: () => saved,
    set(patch) { saved = normalizeSemanticSettings({ ...saved, ...patch }); },
    setServer(patch) { saved = normalizeSemanticSettings({ ...saved, server: { ...saved.server, ...patch } }); },
    listen(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    indexFiles: () => [...files.files.keys()].filter((p) => /\/index-server-[0-9a-f]{16}\.sqlite$/.test(p)),
  };
}
