/**
 * Semantic search (0.9.5) — embedding servers: the address rule, both wire
 * formats, reading (and distrusting) answers, the plain error sentences, the
 * client's recovery rules, the worker's remote embedder, and the controller
 * with the server engine end to end against a real node:http server on
 * 127.0.0.1 (test/helpers/embedding-server-fixture.mjs).
 *
 * In Obsidian the request is made by requestUrl
 * (src/plugin/embedding-endpoint.ts); here the same-signature transport uses
 * Node's fetch, with the same address check in front of it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADDRESS_RULE,
  ANSWER_LIMITS,
  CLIENT_LIMITS,
  EmbeddingClient,
  EmbeddingServerError,
  SERVER_ERROR_CODE,
  SERVER_MODEL_ID,
  SERVER_RETRY,
  SemanticEngine,
  defaultSemanticSettings,
  dimsError,
  embeddingRequest,
  expandPrefix,
  halveText,
  httpError,
  installSemanticWorker,
  normalizeSemanticSettings,
  ollamaRoute,
  openAiRoute,
  readEmbeddingAnswer,
  remoteEmbedder,
  timeoutError,
  unreachableError,
  validateEmbeddingAddress,
} from "../dist/kosmos-semantic.mjs";
import { makeService, makeVault } from "./helpers/personal-fixture.mjs";
import { SERVER_DIMS, SERVER_MODEL, fakeEmbeddingServer, nodeTransport, serverController, serverVector } from "./helpers/embedding-server-fixture.mjs";
import { NOTES, sql } from "./helpers/semantic-fixture.mjs";
import { normalizeAgentSettingsForTest } from "./helpers/semantic-settings-probe.mjs";

const tick = () => new Promise((r) => setImmediate(r));
async function until(check, what = "condition", ms = 20000) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await check()) return;
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 2));
  }
}
const norm = (v) => Math.sqrt(v.reduce((n, x) => n + x * x, 0));
const RUNBOOK = "Ops/Recovery runbook.md";
const QUESTION = "my computer crashed, how do I get it going again";
const ctx = { display: "http://127.0.0.1:8080", hasKey: false };
const caught = (fn) => { try { fn(); } catch (e) { return e; } assert.fail("expected an error"); };

/* ----------------------------------------------------------------- address */

test("address: this computer or a literal private-network address; everything else is refused with the rule", () => {
  const accept = [
    ["http://localhost:8080", "this_computer"],
    ["http://LOCALHOST:11434/", "this_computer"],
    ["http://127.0.0.1:8080", "this_computer"],
    ["http://127.4.5.6:9000", "this_computer"],
    ["http://[::1]:8080", "this_computer"],
    ["https://127.0.0.1:8443/v1", "this_computer"],
    ["http://192.168.1.20:8080", "network"],
    ["http://10.0.0.5:11434", "network"],
    ["http://172.16.4.2:8080", "network"],
    ["http://169.254.10.10:8080", "network"],
    ["http://[fd12:3456::1]:8080", "network"],
    ["http://[fe80::1]:8080", "network"],
  ];
  for (const [raw, where] of accept) {
    const r = validateEmbeddingAddress(raw);
    assert.equal(r.ok, true, `${raw}: ${r.error}`);
    assert.equal(r.where, where, raw);
    assert.equal(r.encrypted, raw.startsWith("https:"), raw);
    assert.doesNotMatch(r.url, /\/$/, "no trailing slash");
  }
  assert.equal(validateEmbeddingAddress("http://127.0.0.1:8080/").url, "http://127.0.0.1:8080");
  assert.equal(validateEmbeddingAddress("http://127.0.0.1:8080/v1/").display, "http://127.0.0.1:8080/v1");

  const reject = [
    ["", /Type the address/],
    [undefined, /Type the address/],
    ["127.0.0.1:8080", /must start with http:\/\/ or https:\/\//],
    ["not an address", /must start with http:\/\/ or https:\/\//],
    ["http://", /not a web address/],
    ["ftp://127.0.0.1/", /must start with http:\/\/ or https:\/\//],
    ["file:///etc/passwd", /must start with http:\/\/ or https:\/\//],
    ["http://8.8.8.8:8080", /8\.8\.8\.8 is not allowed/],
    ["https://203.0.113.7/v1", /is not allowed/],
    ["http://172.32.0.1:8080", /is not allowed/],
    ["http://100.64.0.1:8080", /is not allowed/],
    ["http://example.com:8080", /example\.com is not allowed/],
    ["http://my-gpu-box.local:8080", /is not allowed/],
    ["http://localhost.:8080", /is not allowed/],
    ["http://0.0.0.0:8080", /is not allowed/],
    ["http://[::]:8080", /is not allowed/],
    ["http://user:pass@127.0.0.1:8080", /Leave the user name and password out/],
    ["http://token@192.168.1.2:8080", /Leave the user name and password out/],
    ["http://127.0.0.1:8080/#embeddings", /Remove the # part/],
    ["http://127.0.0.1:8080/#", /Remove the # part/],
    ["http://127.0.0.1:8080/?api_key=abc", /Do not put a key or token in the address/],
    ["http://127.0.0.1:8080/?token=abc", /Do not put a key or token in the address/],
  ];
  for (const [raw, wording] of reject) {
    const r = validateEmbeddingAddress(raw);
    assert.equal(r.ok, false, `${raw} must be refused`);
    assert.match(r.error, wording, String(raw));
    assert.doesNotMatch(r.error, /Error|undefined|\bat \w+ \(/, "a plain sentence");
  }
  assert.ok(validateEmbeddingAddress("http://example.com").error.endsWith(ADDRESS_RULE), "a refused host is told what is allowed");
  assert.match(ADDRESS_RULE, /this computer.*private network/);
  assert.equal(validateEmbeddingAddress("http://127.0.0.1:8080/?pool=1").ok, true, "an ordinary query is kept");
});

/* ------------------------------------------------------------ wire formats */

test("wire: OpenAI-compatible request — /v1/embeddings once, float vectors, the model only when one is set", () => {
  const plain = embeddingRequest("openai", "http://127.0.0.1:8080", "", ["a", "b"]);
  assert.equal(plain.url, "http://127.0.0.1:8080/v1/embeddings");
  assert.deepEqual(JSON.parse(plain.body), { input: ["a", "b"], encoding_format: "float" });
  const named = embeddingRequest("openai", "http://127.0.0.1:8080", "bge-m3", ["a"]);
  assert.deepEqual(JSON.parse(named.body), { input: ["a"], model: "bge-m3", encoding_format: "float" });
  assert.equal(openAiRoute("http://127.0.0.1:8080/v1"), "http://127.0.0.1:8080/v1/embeddings");
  assert.equal(openAiRoute("http://127.0.0.1:8080/v1/"), "http://127.0.0.1:8080/v1/embeddings");
  assert.equal(openAiRoute("http://127.0.0.1:8080/v1/embeddings"), "http://127.0.0.1:8080/v1/embeddings");
  assert.equal(openAiRoute("http://192.168.1.2:9000/proxy"), "http://192.168.1.2:9000/proxy/v1/embeddings");
  assert.equal(openAiRoute("http://127.0.0.1:8080/?pool=1"), "http://127.0.0.1:8080/v1/embeddings?pool=1");
});

test("wire: Ollama request — /api/embed with the model, truncation on; no model is a plain error", () => {
  const r = embeddingRequest("ollama", "http://127.0.0.1:11434", "bge-m3", ["a", "b"]);
  assert.equal(r.url, "http://127.0.0.1:11434/api/embed");
  assert.deepEqual(JSON.parse(r.body), { model: "bge-m3", input: ["a", "b"], truncate: true });
  assert.equal(ollamaRoute("http://127.0.0.1:11434/v1"), "http://127.0.0.1:11434/api/embed", "a typed /v1 is not Ollama's");
  assert.equal(ollamaRoute("http://127.0.0.1:11434/v1/embeddings"), "http://127.0.0.1:11434/api/embed");
  assert.equal(ollamaRoute("http://127.0.0.1:11434/api"), "http://127.0.0.1:11434/api/embed");
  assert.equal(ollamaRoute("http://127.0.0.1:11434/api/embed"), "http://127.0.0.1:11434/api/embed");
  const e = caught(() => embeddingRequest("ollama", "http://127.0.0.1:11434", "", ["a"]));
  assert.equal(e.kind, "needs_model");
  assert.equal(e.message, "Ollama needs a model name. Type it under Model name, for example bge-m3.");
});

/* ----------------------------------------------------------------- answers */

test("answers: vectors are placed by index, normalized to unit length, and the model name is read", () => {
  const text = JSON.stringify({ model: "m", data: [{ index: 1, embedding: Array(16).fill(0).map((_, i) => (i === 1 ? 2 : 0)) }, { index: 0, embedding: Array(16).fill(0).map((_, i) => (i === 0 ? 5 : 0)) }] });
  const a = readEmbeddingAnswer("openai", text, 2);
  assert.equal(a.model, "m");
  assert.ok(a.vectors.every((v) => v instanceof Float32Array && v.length === 16));
  assert.equal(a.vectors[0][0], 1, "index 0 first, scaled to length 1");
  assert.equal(a.vectors[1][1], 1);
  const unindexed = readEmbeddingAnswer("openai", JSON.stringify({ data: [{ embedding: serverVector("bread") }, { embedding: serverVector("tax") }] }), 2);
  assert.equal(unindexed.model, "");
  assert.ok(Math.abs(norm([...unindexed.vectors[0]]) - 1) < 1e-6);
  const ollama = readEmbeddingAnswer("ollama", JSON.stringify({ model: "bge-m3", embeddings: [serverVector("a"), serverVector("b")] }), 2);
  assert.equal(ollama.model, "bge-m3");
  assert.equal(ollama.vectors.length, 2);
});

test("answers: a server is never trusted — each malformed answer has its own plain sentence", () => {
  const v16 = () => Array.from({ length: 16 }, (_, i) => i + 1);
  const cases = [
    ["openai", JSON.stringify({ data: [{ index: 0, embedding: v16() }] }), 2, "bad_answer", /returned 1 vector for 2 texts/],
    ["ollama", JSON.stringify({ embeddings: [v16(), v16(), v16()] }), 2, "bad_answer", /returned 3 vectors for 2 texts/],
    ["openai", JSON.stringify({ data: [{ index: 0, embedding: v16() }, { index: 1, embedding: [...v16(), 1] }] }), 2, "bad_answer", /different lengths/],
    ["openai", JSON.stringify({ data: [{ index: 0, embedding: [1, 2, 3, 4, 5, 6, 7, 8] }] }), 1, "bad_answer", /8-number vector; 16 to 8192 numbers are supported/],
    ["openai", '{"data":[{"index":0,"embedding":[1e999,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]}]}', 1, "bad_answer", /not finite/],
    ["openai", JSON.stringify({ data: [{ index: 0, embedding: [...v16().slice(1), null] }] }), 1, "bad_answer", /not finite/],
    ["openai", JSON.stringify({ data: [{ index: 0, embedding: Array(16).fill(0) }] }), 1, "bad_answer", /empty \(all-zero\) vector/],
    ["openai", JSON.stringify({ data: [{ index: 0, embedding: "AAAA" }] }), 1, "bad_answer", /base64/],
    ["openai", JSON.stringify({ data: [{ index: 0, embedding: v16() }, { index: 0, embedding: v16() }] }), 2, "bad_answer", /missing or repeated index/],
    ["openai", JSON.stringify({ data: [{ index: 0, embedding: v16() }, { embedding: v16() }] }), 2, "bad_answer", /missing or repeated index/],
    ["openai", JSON.stringify({ data: [{ index: 5, embedding: v16() }] }), 1, "bad_answer", /missing or repeated index/],
    ["openai", JSON.stringify({ embeddings: [v16()] }), 1, "bad_answer", /no "data" list/],
    ["ollama", JSON.stringify({ data: [] }), 1, "bad_answer", /no "embeddings" list/],
    ["openai", "<html>502 Bad Gateway</html>", 1, "not_json", /^The server's answer was not JSON\. Check that the address points at an embedding server\.$/],
    ["openai", "[1,2]", 1, "bad_answer", /not an embedding answer/],
    ["openai", " ".repeat(ANSWER_LIMITS.maxChars + 1), 1, "too_large", /larger than 32 MB; it was not read/],
  ];
  for (const [api, text, count, kind, wording] of cases) {
    const e = caught(() => readEmbeddingAnswer(api, text, count));
    assert.ok(e instanceof EmbeddingServerError, `${kind}: ${e}`);
    assert.equal(e.kind, kind, String(wording));
    assert.match(e.message, wording);
    assert.equal(e.code, "", "a bad answer is about this input, not the whole server");
  }
});

test("errors: the user reads one plain sentence for each failure; none carries a stack or a key", () => {
  assert.equal(unreachableError("http://127.0.0.1:8080").message, "No embedding server answered at http://127.0.0.1:8080. Start it, or check the address.");
  assert.equal(httpError(404, "", ctx).message, "This server has no embedding route. Start llama-server with --embeddings, or choose Ollama.");
  assert.equal(httpError(405, "", ctx).kind, "no_route");
  assert.equal(httpError(401, "", ctx).message, "The server asked for an API key.");
  assert.equal(httpError(403, "", ctx).message, "The server asked for an API key.");
  assert.equal(httpError(401, "", { ...ctx, hasKey: true }).message, "The server did not accept the API key.");
  assert.match(timeoutError("http://127.0.0.1:8080", 60000).message, /^The embedding server at http:\/\/127\.0\.0\.1:8080 did not answer within 60 seconds\./);
  assert.match(dimsError(1024, 384).message, /^The server now returns 1024-number vectors but the index was built with 384\. /);
  assert.match(httpError(503, "", ctx).message, /not ready \(HTTP 503\); it may still be loading its model/);
  const e500 = httpError(500, JSON.stringify({ error: { message: "input is too large to process. increase the physical batch size", code: 500 } }), ctx);
  assert.equal(e500.message, "The embedding server answered with an error (HTTP 500). It said: “input is too large to process. increase the physical batch size”");
  assert.equal(httpError(413, "<b>too big</b>\n\u0007", ctx).message, "The text was too long for the server (HTTP 413). It said: “b too big /b”", "markup and control characters are dropped");
  assert.ok(httpError(500, "x".repeat(5000), ctx).message.length < 320, "a server's own text is cut short");
  for (const e of [unreachableError("x"), timeoutError("x", 1000), httpError(404, "", ctx), httpError(401, "", ctx), httpError(503, "", ctx), dimsError(1, 2)]) assert.equal(e.code, SERVER_ERROR_CODE, `${e.kind} is about the whole server`);
  for (const e of [httpError(400, "", ctx), httpError(413, "", ctx), httpError(500, "", ctx)]) assert.equal(e.code, "", `${e.status} may be about one input`);
});

/* ------------------------------------------------------------------ client */

/** A transport stand-in: `answer(url, body)` returns { status, text } or throws. */
function scripted(answer) {
  const calls = [];
  const fn = async (request) => { const body = JSON.parse(request.body); calls.push({ url: request.url, body, timeoutMs: request.timeoutMs }); return answer(request.url, body, calls.length); };
  fn.calls = calls;
  return fn;
}
const ok = (vectors, model = "") => ({ status: 200, text: JSON.stringify({ model, data: vectors.map((embedding, index) => ({ index, embedding })) }) });
const config = (patch = {}) => ({ url: "http://127.0.0.1:8080", display: "http://127.0.0.1:8080", api: "auto", model: "", queryPrefix: "", passagePrefix: "", batch: 16, hasKey: false, ...patch });

test("client: auto tries OpenAI-compatible first and keeps it; on 404 it tries Ollama, but only with a model name", async () => {
  const openai = scripted((url, body) => ok(body.input.map((t) => serverVector(t)), "llama"));
  const c1 = new EmbeddingClient(config({ queryPrefix: "query: " }), openai);
  const p = await c1.probe();
  assert.deepEqual([p.dims, p.model, p.reported, p.api], [SERVER_DIMS, "llama", "llama", "openai"]);
  assert.equal(openai.calls[0].url, "http://127.0.0.1:8080/v1/embeddings");
  assert.deepEqual(openai.calls[0].body.input, ["query: probe"], "the probe is a question, with the question prefix");
  assert.equal(openai.calls[0].timeoutMs, CLIENT_LIMITS.timeoutMs, "60 s unless set");
  await c1.embed(["one"], "passage");
  assert.equal(openai.calls.length, 2);

  const ollamaOnly = scripted((url, body) => (url.endsWith("/api/embed") ? { status: 200, text: JSON.stringify({ model: body.model, embeddings: body.input.map((t) => serverVector(t)) }) } : { status: 404, text: "404 page not found" }));
  const c2 = new EmbeddingClient(config({ model: "bge-m3" }), ollamaOnly);
  assert.equal((await c2.probe()).api, "ollama");
  assert.equal(c2.detected, "ollama");
  await c2.embed(["a", "b"], "passage");
  assert.deepEqual(ollamaOnly.calls.map((c) => new URL(c.url).pathname), ["/v1/embeddings", "/api/embed", "/api/embed"], "after detection, straight to Ollama");

  // llama-server without --embeddings answers 501 (seen on a live server), which is the same advice as a 404.
  const off = scripted(() => ({ status: 501, text: '{"error":{"code":501,"message":"This server does not support embeddings. Start it with `--embeddings`","type":"not_supported_error"}}' }));
  await assert.rejects(new EmbeddingClient(config(), off).probe(), (e) => e.kind === "no_route" && e.status === 501 && /Start llama-server with --embeddings/.test(e.message));
  assert.equal(off.calls.length, 1, "one request, no text-by-text retries");
  // A gateway that serves several models refuses a request without a model name (LiteLLM, seen on a live one).
  const gateway = scripted(() => ({ status: 400, text: '{"error":{"message":"/embeddings: Invalid model name passed in model=None. Call `/v1/models` to view available models for your key.","type":"None","param":"None","code":"400"}}' }));
  await assert.rejects(new EmbeddingClient(config(), gateway).probe(), (e) => e.kind === "needs_model" && e.status === 400 && /needs a model name/.test(e.message) && /\/v1\/models lists/.test(e.message));
  // With a model name typed, the same answer is the server's own error, quoted.
  await assert.rejects(new EmbeddingClient(config({ model: "nope" }), gateway).probe(), (e) => e.kind === "http" && /Invalid model name/.test(e.message));
  // Set to Ollama, the address is a server of the other type: the advice is not "choose Ollama".
  const other = new EmbeddingClient(config({ api: "ollama", model: "bge-m3" }), scripted(() => ({ status: 404, text: "" })));
  await assert.rejects(other.probe(), (e) => e.kind === "no_route" && /no Ollama embedding route/.test(e.message) && !/or choose Ollama/.test(e.message));
  const nameless = new EmbeddingClient(config(), scripted(() => ({ status: 404, text: "" })));
  await assert.rejects(nameless.probe(), (e) => e.kind === "no_route" && /no embedding route/.test(e.message));
  await assert.rejects(new EmbeddingClient(config({ api: "ollama" }), scripted(() => ok([]))).probe(), /Ollama needs a model name/);
});

test("client: prefixes are added per kind; batches follow the setting; a changed vector length is refused", async () => {
  let dims = SERVER_DIMS;
  const t = scripted((url, body) => ok(body.input.map((x) => serverVector(x, dims))));
  const c = new EmbeddingClient(config({ queryPrefix: "query: ", passagePrefix: "passage: ", batch: 2 }), t);
  await c.probe();
  const out = await c.embed(["a", "b", "c", "d", "e"], "passage");
  assert.equal(out.length, 5);
  assert.deepEqual(t.calls.slice(1).map((x) => x.body.input), [["passage: a", "passage: b"], ["passage: c", "passage: d"], ["passage: e"]]);
  await c.embed(["q"], "query");
  assert.deepEqual(t.calls.at(-1).body.input, ["query: q"]);
  const qwen = new EmbeddingClient(config({ queryPrefix: "Instruct: Given a web search query, retrieve relevant passages that answer the query\\nQuery: " }), t);
  await qwen.embed(["restore"], "query");
  assert.equal(t.calls.at(-1).body.input[0], "Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery: restore", "a typed \\n is sent as a line break");
  assert.equal(expandPrefix("a\\nb"), "a\nb");
  dims = 32;
  await assert.rejects(c.embed(["x"], "query"), (e) => e.kind === "dims" && e.code === SERVER_ERROR_CODE && /now returns 32-number vectors but the index was built with 24/.test(e.message));
});

test("client: while indexing, a call that finds no server is tried once more after 2 s; a question is not retried", async () => {
  const sleeps = [];
  let fails = 1;
  const t = scripted((url, body) => { if (fails-- > 0) throw new Error("ECONNREFUSED 127.0.0.1:8080"); return ok(body.input.map((x) => serverVector(x))); });
  const c = new EmbeddingClient(config({ api: "openai" }), t, { sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal((await c.embed(["a"], "passage")).length, 1);
  assert.deepEqual(sleeps, [CLIENT_LIMITS.retryAfterMs]);
  fails = 2;
  await assert.rejects(c.embed(["a"], "passage"), (e) => e.kind === "unreachable" && e.message === "No embedding server answered at http://127.0.0.1:8080. Start it, or check the address.");
  assert.deepEqual(sleeps, [2000, 2000], "once, not in a loop");
  fails = 1;
  await assert.rejects(c.embed(["q"], "query"), /No embedding server answered/);
  assert.equal(sleeps.length, 2, "a question goes to words at once instead of waiting");
  assert.doesNotMatch(String((await c.embed(["ok"], "query").catch((e) => e)).message ?? ""), /ECONNREFUSED/, "the platform's error text is not shown");
});

test("client: too-long input — the batch goes text by text, then a refused text is halved at most three times", async () => {
  const limit = 100;
  const t = scripted((url, body) => (body.input.some((x) => x.length > limit) ? { status: 413, text: "{\"error\":\"input too long\"}" } : ok(body.input.map((x) => serverVector(x)))));
  const c = new EmbeddingClient(config({ api: "openai" }), t);
  const short = "short text";
  const long = "tax ".repeat(100);           // 400 → 200 → 100: two halvings
  const out = await c.embed([short, long], "passage");
  assert.equal(out.length, 2);
  const sizes = t.calls.map((x) => x.body.input.map((s) => s.length));
  assert.deepEqual(sizes, [[short.length, 400], [short.length], [400], [200], [100]]);

  t.calls.length = 0;
  const huge = "x".repeat(1601);            // 1601 → 800 → 400 → 200: still too long after three halvings
  await assert.rejects(c.embed([huge], "passage"), (e) => e.kind === "http" && e.status === 413 && e.code === "");
  assert.deepEqual(t.calls.map((x) => x.body.input[0].length), [1601, 800, 400, 200]);

  const auth = new EmbeddingClient(config({ api: "openai" }), scripted(() => ({ status: 401, text: "" })));
  await assert.rejects(auth.embed(["a", "b"], "passage"), /asked for an API key/);

  // A cut never splits the two halves of an emoji.
  assert.equal(halveText("ab😀cd"), "ab");
  assert.equal(halveText("a😀"), "a");
  assert.equal(halveText("abcd"), "ab");
  for (let n = 1; n < 12; n++) { const s = "😀".repeat(n); assert.ok(!/[\ud800-\udbff]$/.test(halveText(s)), `no lone half at ${n}`); }
});

/* ------------------------------------------------------ against a real server */

test("real server: both wire formats over HTTP on 127.0.0.1, answers out of order, the key as a header only", async () => {
  const srv = await fakeEmbeddingServer({ key: "s3cret-key" });
  try {
    const keyed = nodeTransport("s3cret-key");
    const auto = new EmbeddingClient(config({ url: srv.url, display: srv.url, hasKey: true }), keyed);
    const p = await auto.probe();
    assert.deepEqual([p.dims, p.reported, p.api], [SERVER_DIMS, SERVER_MODEL, "openai"]);
    const [a, b] = await auto.embed(["sourdough starter and flour", "tax receipts before the deadline"], "passage");
    assert.ok(Math.abs(norm([...a]) - 1) < 1e-6, "normalized");
    const bread = await auto.embed(["bake bread in the oven"], "query");
    const dot = (x, y) => x.reduce((n, v, i) => n + v * y[i], 0);
    assert.ok(dot(bread[0], a) > dot(bread[0], b), "out-of-order data was put back in order by index");
    assert.ok(srv.log.every((e) => e.auth === "Bearer s3cret-key" && e.contentType === "application/json"));
    assert.ok(srv.log.every((e) => !JSON.stringify(e.body).includes("s3cret-key")), "the key is never in a body");
    assert.ok(keyed.sent.every((s) => !s.url.includes("s3cret")), "or in an address");

    const keyless = new EmbeddingClient(config({ url: srv.url, display: srv.url }), nodeTransport());
    await assert.rejects(keyless.probe(), (e) => e.kind === "auth" && e.message === "The server asked for an API key.");
    srv.opts.key = "";

    const ollama = new EmbeddingClient(config({ url: srv.url, display: srv.url, api: "ollama", model: "bge-m3" }), nodeTransport());
    const o = await ollama.probe();
    assert.deepEqual([o.api, o.reported, o.model], ["ollama", "bge-m3", "bge-m3"]);
    assert.deepEqual(srv.log.at(-1).body, { model: "bge-m3", input: ["probe"], truncate: true });
    assert.equal(srv.log.at(-1).path, "/api/embed");

    srv.opts.formats = ["ollama"];
    const detect = new EmbeddingClient(config({ url: `${srv.url}/v1`, display: srv.url, model: "nomic" }), nodeTransport());
    assert.equal((await detect.probe()).api, "ollama", "llama.cpp route missing → Ollama's");
    assert.deepEqual(srv.log.slice(-2).map((e) => e.path), ["/v1/embeddings", "/api/embed"]);
  } finally { await srv.close(); }
});

test("real server: nothing listening, a timeout and a refused address each say so plainly", async () => {
  const srv = await fakeEmbeddingServer();
  const url = srv.url;
  await srv.down();
  const gone = new EmbeddingClient(config({ url, display: url }), nodeTransport());
  await assert.rejects(gone.probe(), (e) => e.kind === "unreachable" && e.message === `No embedding server answered at ${url}. Start it, or check the address.`);

  const slow = await fakeEmbeddingServer({ hang: true });
  try {
    const c = new EmbeddingClient(config({ url: slow.url, display: slow.url, timeoutMs: 150 }), nodeTransport());
    await assert.rejects(c.probe(), (e) => e.kind === "timeout" && /did not answer within 0\.15 seconds/.test(e.message));
  } finally { await slow.close(); }

  const t = nodeTransport();
  await assert.rejects(t({ url: "http://93.184.216.34/v1/embeddings", body: "{}", timeoutMs: 1000 }), (e) => e.kind === "address" && /is not allowed/.test(e.message));
  assert.equal(t.sent.length, 0, "a refused address is never contacted");
});

/* ------------------------------------------------------------------ worker */

test("worker: with an embedding server the worker loads no model — its embedder asks the plugin and checks the reply", async () => {
  const posted = [];
  const scope = { onmessage: null, postMessage(message, transfer) { posted.push({ message, transfer }); } };
  let created = 0;
  installSemanticWorker(scope, { sql, createEmbedder: async () => { created++; throw new Error("no model may be loaded"); } });
  const send = (data) => scope.onmessage({ data });
  const reply = async (id) => { await until(() => posted.some((p) => p.message.id === id), `reply ${id}`); return posted.find((p) => p.message.id === id).message; };
  /** Answer every embed call with server vectors, as the plugin would. */
  const answered = new Set();
  const serve = (failWith = null) => {
    for (const { message } of posted) {
      if (message.op !== "embed" || answered.has(message.call)) continue;
      answered.add(message.call);
      if (failWith) { send({ reply: message.call, ok: false, error: failWith.message, code: failWith.code }); continue; }
      const packed = new Float32Array(message.texts.length * SERVER_DIMS);
      message.texts.forEach((t, i) => { const v = serverVector(t); const n = norm(v); packed.set(v.map((x) => x / n), i * SERVER_DIMS); });
      send({ reply: message.call, ok: true, vectors: packed.buffer, dims: SERVER_DIMS });
    }
  };
  send({ id: 1, op: "load-remote", dims: SERVER_DIMS, batch: 16, modelKey: "server:test|24||", database: null });
  const loaded = await reply(1);
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.result, { dims: SERVER_DIMS, notes: 0, chunks: 0, rebuilt: false });
  assert.equal(created, 0, "createEmbedder (and with it the ONNX runtime) was never called");

  send({ id: 2, op: "index", notes: Object.entries(NOTES).map(([path, raw]) => ({ path, key: path, title: path, raw })) });
  await until(() => { serve(); return posted.some((p) => p.message.id === 2); }, "index");
  assert.equal((await reply(2)).ok, true);
  const calls = posted.filter((p) => p.message.op === "embed");
  assert.ok(calls.length >= 1 && calls.every((c) => c.message.kind === "passage" && typeof c.message.call === "number"));

  send({ id: 3, op: "query", question: QUESTION, allowed: null, limit: 3 });
  await until(() => { serve(); return posted.some((p) => p.message.id === 3); }, "query");
  const q = await reply(3);
  assert.equal(q.result[0].path, RUNBOOK);
  assert.equal(posted.filter((p) => p.message.op === "embed").at(-1).message.kind, "query");

  // A server-wide failure keeps its code across the worker, so the plugin pauses instead of failing notes.
  send({ id: 4, op: "query", question: "bread", allowed: null, limit: 3 });
  await until(() => { serve({ message: "No embedding server answered at http://127.0.0.1:8080. Start it, or check the address.", code: SERVER_ERROR_CODE }); return posted.some((p) => p.message.id === 4); }, "failed query");
  const failed = await reply(4);
  assert.deepEqual([failed.ok, failed.code], [false, SERVER_ERROR_CODE]);
  assert.match(failed.error, /No embedding server answered/);

  // A reply of the wrong size is refused, not stored.
  const proxy = remoteEmbedder(() => {}, SERVER_DIMS, 16);
  const pending = proxy.embed(["a", "b"], "passage");
  proxy.settle({ reply: 1, ok: true, vectors: new Float32Array(SERVER_DIMS).buffer, dims: SERVER_DIMS });
  await assert.rejects(pending, /do not fit the index/);
  assert.equal(proxy.batch, 16);
  const later = proxy.embed(["a"], "query");
  proxy.dispose();
  await assert.rejects(later, /stopped/);
});

test("engine: passages per call come from the embedder — 16 for a server, 8 for the built-in model", async () => {
  const long = Array.from({ length: 40 }, (_, i) => `## Part ${i}\n\n${"The nightly backup snapshot of the disk is copied to the drive. ".repeat(14)}`).join("\n\n");
  const sizes = async (batch) => {
    const seen = [];
    const embedder = { dims: SERVER_DIMS, ...(batch ? { batch } : {}), async embed(texts) { seen.push(texts.length); return texts.map((t) => { const v = serverVector(t); const n = norm(v); return Float32Array.from(v, (x) => x / n); }); } };
    const engine = SemanticEngine.open(await sql(), null, "k", embedder);
    await engine.index([{ path: "a.md", key: "1", title: "a", raw: long }]);
    return seen;
  };
  const builtin = await sizes(undefined);
  const server = await sizes(16);
  assert.ok(Math.max(...builtin) === 8 && builtin.length > 2, `built-in: ${builtin}`);
  assert.ok(Math.max(...server) === 16 && server.length < builtin.length, `server: ${server}`);
});

/* -------------------------------------------------------------- controller */

test("controller (server): probe, index, answer — no model files, no download, no ONNX; the index is named after the model", async () => {
  const srv = await fakeEmbeddingServer();
  const c = await serverController({ url: srv.url });
  try {
    await c.controller.apply();
    await c.controller.service.idle();
    const o = c.controller.overview();
    assert.deepEqual([o.phase, o.engine, o.modelId, o.indexedNotes, o.retry], ["ready", "server", SERVER_MODEL_ID, 6, false]);
    assert.equal(o.model, SERVER_MODEL, "the name the server reports");
    assert.deepEqual(c.controller.info(), { state: "ready", model: `${SERVER_MODEL} (embedding server)`, runs: "on an embedding server the user runs on this computer; note passages and questions are sent to it and nowhere else" });
    assert.equal(c.createWorker.made.length, 1);
    assert.deepEqual(c.createWorker.made[0].loads, [], "the worker was never given a model to load");
    assert.ok(c.createWorker.made[0].requests.includes("load-remote"));
    assert.equal(c.downloads.length, 0);
    assert.equal(c.indexFiles().length, 1, "one SQLite index, filed under the server");
    assert.equal(srv.log[0].body.input[0], "probe", "starting is one probe");
    const allowed = new Set(Object.keys(NOTES));
    assert.equal((await c.controller.candidates(QUESTION, allowed))[0].path, RUNBOOK);
    assert.ok((await c.controller.candidates(QUESTION, new Set(["Home/Sourdough.md"]))).every((h) => h.path === "Home/Sourdough.md"), "read scope is still enforced");
    const passages = srv.inputs("/v1/embeddings").length;
    await c.controller.apply();
    assert.equal(srv.inputs("/v1/embeddings").length, passages, "unchanged settings: no new probe");
  } finally { await c.controller.dispose(); await srv.close(); }
});

test("controller (server): the hybrid answer uses meaning from the server (ranks.semantic) and stays inside the shared notes", async () => {
  const srv = await fakeEmbeddingServer({ formats: ["ollama"] });
  const c = await serverController({ url: "http://localhost:" + srv.port, server: { api: "ollama", model: "bge-m3" } });
  try {
    await c.controller.apply();
    await c.controller.service.idle();
    const vault = makeVault(Object.fromEntries(Object.entries(NOTES).map(([path, raw]) => [path, { raw }])));
    const { service } = makeService(vault, {}, { semantic: { info: () => c.controller.info(), candidates: (q, a) => c.controller.candidates(q, a), related: (s, a, l) => c.controller.related(s, a, l) } });
    const r = await service.call("ask_librarian", { question: QUESTION }, "mcp");
    assert.equal(r.semantic.state, "ready");
    assert.equal(r.semantic.model, "bge-m3 (embedding server)");
    assert.equal(r.results[0].path, RUNBOOK);
    assert.equal(r.results[0].found_by.meaning, 1, "ranked first by meaning (ranks.semantic)");
    assert.ok(srv.log.every((e) => e.path === "/api/embed"));
    const overview = await service.call("vault_overview", {}, "mcp");
    assert.match(overview.capabilities.semantic_search.runs, /embedding server the user runs on this computer/);
  } finally { await c.controller.dispose(); await srv.close(); }
});

test("controller (server): server down — error, words only, no retry loop; asked again after 30 s or on Retry, and it recovers", async () => {
  const srv = await fakeEmbeddingServer();
  await srv.down();
  const c = await serverController({ url: srv.url });
  try {
    await c.controller.apply();
    const o = c.controller.overview();
    assert.deepEqual([o.phase, o.retry], ["error", true]);
    assert.equal(o.message, `No embedding server answered at ${srv.url}. Start it, or check the address. Search uses words only for now.`);
    assert.equal(c.createWorker.made.length, 0, "no worker without a server");

    const vault = makeVault(Object.fromEntries(Object.entries(NOTES).map(([path, raw]) => [path, { raw }])));
    const { service } = makeService(vault, {}, { semantic: { info: () => c.controller.info(), candidates: (q, a) => c.controller.candidates(q, a), related: (s, a, l) => c.controller.related(s, a, l) } });
    const words = await service.call("ask_librarian", { question: "rescue image" }, "mcp");
    assert.equal(words.semantic.state, "error");
    assert.match(words.semantic.detail, /No embedding server answered/);
    assert.equal(words.results[0].path, RUNBOOK, "words still answer");
    await srv.up();
    for (let i = 0; i < 5; i++) await service.call("ask_librarian", { question: "rescue image" }, "mcp");
    assert.equal(srv.log.length, 0, "within 30 s a question does not ask the server again");

    c.clock.at += SERVER_RETRY.afterMs;
    const first = await service.call("ask_librarian", { question: "rescue image" }, "mcp");
    assert.equal(first.semantic.state, "error", "this question is answered by words at once; it starts the retry");
    for (let i = 0; i < 3; i++) c.controller.info();
    await until(() => c.controller.overview().phase === "ready", "recovered");
    assert.equal(srv.log.filter((e) => e.input[0] === "probe").length, 1, "questions arriving meanwhile start no second attempt");
    const back = await service.call("ask_librarian", { question: QUESTION }, "mcp");
    assert.equal(back.semantic.state, "ready");
    assert.equal(back.results[0].path, RUNBOOK);

    // Running, then the server goes away: questions fail over to words and the status says so.
    await srv.down();
    assert.deepEqual(await c.controller.candidates(QUESTION, new Set(Object.keys(NOTES))).catch((e) => e.message), `No embedding server answered at ${srv.url}. Start it, or check the address.`);
    assert.equal(c.controller.overview().phase, "error");
    assert.equal(c.controller.info().state, "error");
    const asked = srv.log.length;
    await srv.up();
    await c.controller.retry();
    assert.equal(c.controller.overview().phase, "ready", "Retry asks at once");
    assert.equal(c.controller.info().state, "ready");
    assert.ok(srv.log.length > asked);
  } finally { await c.controller.dispose(); await srv.close(); }
});

test("controller (server): the server stops while indexing — indexing pauses (nothing marked failed) and resumes on Retry or a note change", async () => {
  const srv = await fakeEmbeddingServer();
  const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`N/${i}.md`, `# Note ${i}\n\nThe nightly backup of the disk number ${i}.`]));
  const c = await serverController({ url: srv.url, notes: many, server: { batch: 1 } });
  try {
    let stopped = false;
    const off = c.listen(() => { if (!stopped && c.controller.overview().indexedNotes >= 6) { stopped = true; void srv.down(); } });
    await c.controller.apply();
    await until(() => c.controller.overview().phase === "paused", "paused");
    off();
    const o = c.controller.overview();
    assert.equal(o.retry, true);
    assert.equal(o.failedNotes, 0, "a missing server does not fail notes");
    assert.match(o.message, /^Paused: No embedding server answered at .*\. \d+ of 30 notes are embedded; questions use those\. Press Retry, or it continues when a note changes\.$/);
    assert.ok(o.indexedNotes < 30);
    assert.ok(c.sleeps.includes(CLIENT_LIMITS.retryAfterMs), "it was tried once more after 2 s before pausing");
    await srv.up();
    c.source.set("N/0.md", "# Note 0\n\nChanged.");
    c.controller.noteChanges(["N/0.md"]);
    await c.controller.service.idle();
    assert.deepEqual([c.controller.overview().phase, c.controller.overview().indexedNotes, c.controller.overview().failedNotes], ["ready", 30, 0]);
  } finally { await c.controller.dispose(); await srv.close(); }
});

test("controller (server): a busy server (429) pauses indexing and fails no note, though it answers one short word; the notes are embedded when it has room", async () => {
  // Five characters is the one-word probe: it is answered while every passage gets HTTP 429.
  const srv = await fakeEmbeddingServer({ maxChars: 5, tooLongStatus: 429 });
  const c = await serverController({ url: srv.url, notes: NOTES });
  try {
    await c.controller.apply();
    await until(() => c.controller.overview().phase === "paused", "paused");
    const paused = c.controller.overview();
    assert.deepEqual([paused.failedNotes, paused.indexedNotes, paused.retry], [0, 0, true], "no note is counted as one that could not be embedded");
    assert.ok(c.sleeps.includes(CLIENT_LIMITS.retryAfterMs), "it was tried once more after 2 s before pausing");
    // The server has room again. Nothing was edited: looking at every note again must send them.
    srv.opts.maxChars = Infinity;
    const sent = srv.log.length;
    c.controller.noteChanges(null);
    await c.controller.service.idle();
    const o = c.controller.overview();
    assert.deepEqual([o.phase, o.indexedNotes, o.failedNotes], ["ready", Object.keys(NOTES).length, 0]);
    assert.ok(srv.log.length > sent, "the unchanged notes were sent again");
  } finally { await c.controller.dispose(); await srv.close(); }
});

test("controller (server): a note too long for the server is halved; one that never fits is counted, not fatal", async () => {
  // Passages are at most ~1400 characters: three halvings bring any of them under 175, not under 150.
  const srv = await fakeEmbeddingServer({ maxChars: 150 });
  const notes = { ...NOTES, "Ops/Long.md": `# Long\n\n${"The recovery runbook says to boot the rescue image. ".repeat(14)}`, "Ops/Wall.md": "w".repeat(3000) };
  const c = await serverController({ url: srv.url, notes });
  try {
    await c.controller.apply();
    await c.controller.service.idle();
    const o = c.controller.overview();
    assert.equal(o.phase, "ready");
    assert.equal(o.failedNotes, 1, "the wall of text could not be embedded even cut to an eighth");
    assert.match(o.message, /1 note could not be embedded/);
    assert.equal(o.indexedNotes, 7);
    const refused = srv.log.filter((e) => e.input.some((t) => t.length > 150)).length;
    assert.ok(refused >= 2, "the server refused, and the plugin cut the text");
  } finally { await c.controller.dispose(); await srv.close(); }
});

test("controller (server): moving the server keeps the index; another model or prefix builds a new one", async () => {
  const srv = await fakeEmbeddingServer();
  const c = await serverController({ url: srv.url });
  try {
    await c.controller.apply();
    await c.controller.service.idle();
    const embedded = () => srv.inputs("/v1/embeddings").filter((t) => t !== "probe").length;
    const before = embedded();
    assert.ok(before >= 6);

    // Same model at another address (here: localhost instead of 127.0.0.1).
    c.setServer({ url: `http://localhost:${srv.port}/v1` });
    await c.controller.apply();
    await c.controller.service.idle();
    assert.equal(embedded(), before, "nothing embedded again");
    assert.equal(c.controller.overview().rebuilt, false);
    assert.equal(c.createWorker.made.length, 1, "not even restarted");
    assert.ok(srv.log.at(-1).body.input[0] === "probe" && srv.log.at(-1).path === "/v1/embeddings", "the new address was probed, /v1 not repeated");

    // After a restart of Obsidian, the stored index for the same model is reused.
    await c.controller.dispose();
    const again = await serverController({ url: `http://127.0.0.1:${srv.port}` });
    for (const [k, v] of c.files.files) again.files.files.set(k, v);
    await again.controller.apply();
    await again.controller.service.idle();
    assert.equal(embedded(), before, "reopened, nothing embedded again");
    assert.equal(again.indexFiles().length, 1);

    again.setServer({ model: "other-model" });
    await again.controller.apply();
    await again.controller.service.idle();
    assert.ok(embedded() >= before * 2, "another model name: every note embedded again");
    assert.equal(again.indexFiles().length, 2, "a second index, the first kept");

    const mid = embedded();
    again.setServer({ passagePrefix: "passage: " });
    await again.controller.apply();
    await again.controller.service.idle();
    assert.ok(embedded() >= mid + 6, "a new prefix: new vectors");
    assert.ok(srv.inputs("/v1/embeddings").some((t) => t.startsWith("passage: ")));
    assert.equal(again.indexFiles().length, 3);
    await again.controller.dispose();
  } finally { await c.controller.dispose(); await srv.close(); }
});

test("controller (server): a refused address or a missing Ollama model never sends anything; Test connection reports in one line", async () => {
  const srv = await fakeEmbeddingServer();
  const c = await serverController({ url: "http://8.8.8.8:8080" });
  try {
    await c.controller.apply();
    assert.equal(c.controller.overview().phase, "error");
    assert.match(c.controller.overview().message, /8\.8\.8\.8 is not allowed\. Use this computer/);
    assert.equal(c.controller.info().runs, "on an embedding server the user chose, but its address is not allowed, so nothing is sent");
    c.setServer({ url: "http://192.168.77.1:9" });
    assert.match(c.controller.info().runs, /on their local network/, "said from the saved address, even before it answered");
    c.setServer({ url: "http://8.8.8.8:8080" });
    assert.equal(c.transport.sent.length, 0);
    assert.deepEqual(await c.controller.testServer(), { ok: false, message: validateEmbeddingAddress("http://8.8.8.8:8080").error });

    c.setServer({ url: srv.url, api: "ollama", model: "" });
    await c.controller.apply();
    assert.match(c.controller.overview().message, /^Ollama needs a model name/);
    assert.equal(c.transport.sent.length, 0);

    c.setServer({ api: "auto" });
    c.set({ enabled: false });
    const t = await c.controller.testServer();
    assert.equal(t.ok, true, "Test works before semantic search is turned on");
    assert.match(t.message, new RegExp(`^Connected: ${SERVER_MODEL}, 24-number vectors, \\d+ ms\\.$`));
    assert.deepEqual([t.api, t.where, t.dims], ["openai", "this_computer", 24]);
    assert.equal(c.createWorker.made.length, 0, "a test starts nothing");
    assert.deepEqual(srv.log.map((e) => e.input), [["probe"]], "a test sends only the word “probe”");

    await srv.down();
    assert.deepEqual(await c.controller.testServer(), { ok: false, message: `No embedding server answered at ${srv.url}. Start it, or check the address.` });
  } finally { await c.controller.dispose(); await srv.close(); }
});

/* ---------------------------------------------------------------- settings */

test("settings: the embedding server is off and built-in by default; malformed values become defaults; old files keep working", () => {
  const d = defaultSemanticSettings();
  assert.equal(d.enabled, false);
  assert.equal(d.engine, "builtin");
  assert.deepEqual(d.server, { url: "http://127.0.0.1:8080", api: "auto", model: "", queryPrefix: "", passagePrefix: "", batch: 16 });
  const old = normalizeSemanticSettings({ enabled: true, modelId: "all-minilm-l6-v2" });
  assert.deepEqual([old.enabled, old.engine, old.modelId], [true, "builtin", "all-minilm-l6-v2"], "a 0.9.5-alpha file has no engine and keeps the built-in model");
  const junk = normalizeSemanticSettings({ enabled: true, engine: "cloud", server: { url: 7, api: "grpc", model: ["x"], queryPrefix: null, batch: "lots" } });
  assert.equal(junk.engine, "builtin", "an unknown engine is the built-in one");
  assert.deepEqual(junk.server, d.server);
  assert.equal(normalizeSemanticSettings({ engine: "server" }).enabled, false, "choosing the server does not turn it on");
  assert.equal(normalizeSemanticSettings({ enabled: true, engine: "server", modelId: "gone" }).enabled, true, "the server needs no catalog model");
  assert.equal(normalizeSemanticSettings({ server: { batch: 0 } }).server.batch, 1);
  assert.equal(normalizeSemanticSettings({ server: { batch: 1000 } }).server.batch, 64);
  assert.equal(normalizeSemanticSettings({ server: { batch: 12.7 } }).server.batch, 12);
  assert.equal(normalizeSemanticSettings({ server: { url: "  http://10.0.0.2:11434 " } }).server.url, "http://10.0.0.2:11434");
  assert.equal(normalizeSemanticSettings({ server: { url: "http://example.com" } }).server.url, "http://example.com", "kept as typed; refused when used");
  const keyed = normalizeSemanticSettings({ engine: "server", server: { apiKey: "sk-123", key: "x", token: "y" } });
  assert.ok(!JSON.stringify(keyed).includes("sk-123") && !("apiKey" in keyed.server) && !("token" in keyed.server), "no key is ever part of the saved settings");

  const saved = normalizeAgentSettingsForTest({ personalNotes: { includeFolders: ["Notes"], semantic: { enabled: true, engine: "server", server: { url: "http://192.168.1.9:8080", model: "bge-m3", apiKey: "nope" } } } });
  assert.equal(saved.personalNotes.semantic.engine, "server");
  assert.equal(saved.personalNotes.semantic.server.url, "http://192.168.1.9:8080");
  assert.ok(!JSON.stringify(saved).includes("nope"));
});

/* ------------------------------------------------------------------ source */

test("source: the embedding server has exactly one request, behind the address check; the key stays out of the settings file", () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const ep = strip(readFileSync(new URL("../src/plugin/embedding-endpoint.ts", import.meta.url), "utf8"));
  assert.equal((ep.match(/\brequestUrl\s*\(/g) || []).length, 1);
  assert.doesNotMatch(ep, /\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.ok(ep.indexOf("validateEmbeddingAddress(request.url)") < ep.indexOf("requestUrl("), "checked before it is sent");
  assert.match(ep, /throw: false/);
  assert.match(ep, /loadLocalStorage\(KEY_STORAGE\)/);
  assert.match(ep, /saveLocalStorage\(KEY_STORAGE/);
  assert.doesNotMatch(ep, /console\./, "nothing is logged");
  const host = strip(readFileSync(new URL("../src/plugin/semantic-host.ts", import.meta.url), "utf8"));
  assert.doesNotMatch(host, /Authorization/);
  const worker = strip(readFileSync(new URL("../node_modules/gkos-engine/src/semantic/worker.ts", import.meta.url), "utf8"));
  const remoteCase = worker.slice(worker.indexOf('case "load-remote"'), worker.indexOf('case "manifest"'));
  assert.ok(remoteCase.length > 50);
  assert.doesNotMatch(remoteCase, /createEmbedder/, "the server path never loads the ONNX runtime");
  const entry = strip(readFileSync(new URL("../src/semantic/worker-entry.ts", import.meta.url), "utf8"));
  assert.match(entry, /createEmbedder: async \(files, recipe\) => \{\s*await \(ortReady \?\?=/, "the runtime is only unpacked when a model is loaded");
});

test("client: a server that answers 500 or 429 to everything is a server problem, not a failed text", async () => {
  for (const status of [500, 429]) {
    const down = scripted(() => ({ status, text: "{\"error\":\"internal error\"}" }));
    const sleeps = [];
    const c = new EmbeddingClient(config({ api: "openai" }), down, { sleep: async (ms) => { sleeps.push(ms); } });
    await assert.rejects(c.embed(["one passage of text", "another passage"], "passage"), (e) => e.kind === "unavailable" && e.status === status && e.code === SERVER_ERROR_CODE);
    assert.ok(down.calls.length <= 6, `${status}: a handful of requests, then indexing pauses (${down.calls.length})`);
    if (status === 500) assert.equal(down.calls.at(-1).body.input[0], "probe", "the last request asks whether the server embeds one word");
    // Too many requests is answered by waiting, not by sending more: one more try after 2 s, and no probe.
    else assert.deepEqual([down.calls.length, sleeps, down.calls.some((call) => call.body.input[0] === "probe")], [2, [CLIENT_LIMITS.retryAfterMs], false]);
  }
  // A busy server that still answers one short word: the passage is not a failed text either.
  const busy = scripted((url, body) => (body.input.some((t) => t.length > 5) ? { status: 429, text: "{\"error\":\"rate limit\"}" } : ok(body.input.map((t) => serverVector(t)))));
  const limited = new EmbeddingClient(config({ api: "openai" }), busy, { sleep: async () => {} });
  await assert.rejects(limited.embed(["one passage of text"], "passage"), (e) => e.kind === "unavailable" && e.status === 429 && e.code === SERVER_ERROR_CODE);
  await assert.rejects(limited.embed(["a question"], "query"), (e) => e.kind === "unavailable" && e.code === SERVER_ERROR_CODE);
  // One text the server chokes on while it answers others: that text fails, indexing goes on.
  const picky = scripted((url, body) => (body.input.some((t) => t.startsWith("!")) ? { status: 500, text: "" } : ok(body.input.map((t) => serverVector(t)))));
  const c = new EmbeddingClient(config({ api: "openai" }), picky);
  await assert.rejects(c.embed(["!a text this server cannot take"], "passage"), (e) => e.kind === "http" && e.status === 500 && e.code === "");
  assert.equal((await c.embed(["a fine passage"], "passage")).length, 1);
});
