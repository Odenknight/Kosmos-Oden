/**
 * Hybrid search (0.9.5) as an AI client meets it: the Personal Notes query
 * service and a REAL started Agent API server (MCP and REST), with the real
 * semantic controller behind them — real SQLite, the in-process worker and a
 * deterministic concept embedder (test/helpers/hybrid-fixture.mjs).
 *
 * What is proved here:
 *  - a question with none of the notes' words still finds the note (meaning);
 *  - words and meaning are fused, and each result says how it was found;
 *  - a note the requester may not read is never sent to, or taken from, the
 *    semantic side — even when the semantic side misbehaves;
 *  - off, loading, failing or slow semantic search costs nothing: the answer
 *    is the lexical one and says which it was;
 *  - the answer guides onward: steps, linked notes and related notes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { isKosmosOperationalPath } from "../dist/kosmos-operational-paths.mjs";
import { PersonalQueryService, PolicyGeneration, createPersonalReadPolicy, defaultPersonalNotesSettings, lineageView } from "../dist/kosmos-personal-notes.mjs";
import {
  KosmosAgentServer, MCP_META_CLIENT_CAPABILITIES, MCP_META_CLIENT_INFO, MCP_META_PROTOCOL_VERSION, MODERN_MCP_PROTOCOL_VERSION,
  NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS, migrateAgentSettings,
} from "../dist/kosmos-agent-server.mjs";
import { RANK, makeService, makeVault } from "./helpers/personal-fixture.mjs";
import { SECRET_PATH, hybrid, hybridFiles } from "./helpers/hybrid-fixture.mjs";

const NO_SHARED_WORD = "my computer crashed, how do I get it going again";
const RUNBOOK = "Ops/Recovery runbook.md";
const BACKUPS = "Ops/Backups.md";
const SECRETS = [SECRET_PATH, "Root password", "hunter2"];
const noSecret = (value, where) => { const text = typeof value === "string" ? value : JSON.stringify(value); for (const s of SECRETS) assert.ok(!text.includes(s), `${where} leaked ${s}`); };
const paths = (r) => r.results.map((x) => x.path);

test("hybrid: a question sharing no word with any note is answered by meaning, and says so", async () => {
  const plain = makeService(makeVault(hybridFiles()));
  const lexical = await plain.service.call("ask_librarian", { question: NO_SHARED_WORD }, "mcp");
  assert.equal(lexical.total, 0, "words alone find nothing");
  assert.deepEqual(lexical.semantic, { state: "off", candidates: 0 });
  assert.match(lexical.brief, /words only/i);

  const h = await hybrid();
  try {
    const r = await h.service.call("ask_librarian", { question: NO_SHARED_WORD }, "mcp");
    assert.equal(r.semantic.state, "ready");
    assert.match(r.semantic.model, /all-MiniLM-L6-v2/);
    assert.equal(paths(r)[0], RUNBOOK);
    assert.deepEqual(Object.keys(r.results[0].found_by), ["meaning"], "found by meaning and nothing else");
    assert.ok(r.results[0].semantic_score > 0.5 && r.results[0].semantic_score <= 1);
    assert.match(r.results[0].passages[0].text, /start from the rescue image/, "the passage is the one closest to the question");
    assert.equal(r.confidence, "weak", "meaning alone is never reported as a confident match");
    assert.match(r.brief, /No shared note contains the words of this question/);
    assert.match(r.brief, /closest in meaning/);
    assert.match(r.brief, /found by meaning only/);
    assert.doesNotMatch(r.brief, /matching note/, "closest is not the same as matching");
    assert.ok(!paths(r).some((p) => /Sourdough|Tax|Tomatoes|Lisbon/.test(p)), "the tail of unrelated notes is not offered");
    noSecret(r, "the answer");
  } finally { await h.controller.dispose(); }
});

test("hybrid: words and meaning are fused; a note both find ranks first and shows both", async () => {
  const h = await hybrid();
  try {
    const one = await h.service.call("ask_librarian", { question: "rescue image for a machine that will not boot" }, "mcp");
    assert.equal(one.semantic.state, "ready");
    assert.deepEqual(paths(one), [RUNBOOK]);
    assert.deepEqual(one.results[0].found_by, { words: 1, meaning: 1 }, "first by words and first by meaning");
    assert.ok(one.results[0].matched_terms.includes("rescue"));
    assert.doesNotMatch(one.brief, /No shared note contains the words/);
    assert.doesNotMatch(one.brief, /found by meaning only/);
    assert.match(one.brief, /Searched by words and by meaning/);

    // Two notes share the question's words; each list ranks them, and both rankings are shown.
    const r = await h.service.call("ask_librarian", { question: "how do I restore from the snapshot" }, "mcp");
    assert.deepEqual(paths(r).sort(), [BACKUPS, RUNBOOK]);
    for (const hit of r.results) assert.ok(hit.found_by.words >= 1 && hit.found_by.meaning >= 1 && hit.semantic_score > 0, `${hit.path}: ${JSON.stringify(hit.found_by)}`);
    const byMeaning = r.results.find((x) => x.found_by.meaning === 1);
    assert.equal(byMeaning.path, RUNBOOK, "“restore” is the runbook's subject, though the word is not in it");

    // Same question, words only: every lexical hit is still there, in the hybrid answer too.
    const plain = makeService(makeVault(hybridFiles()));
    const lexical = await plain.service.call("ask_librarian", { question: "how do I restore from the snapshot" }, "mcp");
    for (const p of paths(lexical)) assert.ok(paths(r).includes(p), `semantic search only adds: ${p} is still found`);
    noSecret(r, "the answer");
  } finally { await h.controller.dispose(); }
});

test("hybrid: the answer guides onward — linked notes and related processes to read next", async () => {
  const h = await hybrid();
  try {
    const r = await h.service.call("ask_librarian", { question: NO_SHARED_WORD }, "mcp");
    assert.deepEqual(r.results[0].note_links, ["Ops/Backups"]);
    assert.deepEqual(r.related.map((x) => [x.path, x.related_to, x.reason]), [[BACKUPS, RUNBOOK, "linked"]]);
    assert.match(r.brief, /Related processes — read next if the answer above is only part of the task/);
    assert.match(r.brief, /\*\*Backups\*\* — Ops\/Backups\.md — linked from Ops\/Recovery runbook\.md/);
    assert.ok(!r.related.some((x) => paths(r).includes(x.path)), "a related note is never one already in the answer");

    const near = await h.service.call("get_related", { path: RUNBOOK }, "mcp");
    assert.deepEqual(near.results.map((x) => [x.path, x.reasons]), [[BACKUPS, ["links_to", "similar_meaning"]]]);
    noSecret(r, "the answer"); noSecret(near, "get_related");
  } finally { await h.controller.dispose(); }
});

test("hybrid: a note the requester may not read is never sent to semantic search and never comes back from it", async () => {
  const h = await hybrid();
  try {
    assert.equal(h.controller.overview().indexedNotes, 7, "the index holds every note in the vault, the unreadable one too");
    await h.service.call("ask_librarian", { question: "recover a crashed machine" }, "mcp");
    await h.service.call("get_related", { path: RUNBOOK }, "mcp");
    assert.ok(h.calls.length >= 2);
    for (const c of h.calls) {
      assert.equal(c.allowed.size, 6, `${c.op} named the readable notes`);
      assert.ok(!c.allowed.has(SECRET_PATH), `${c.op} was not offered the unreadable note`);
    }
    // The semantic side itself refuses a path outside the allowed set.
    const direct = await h.controller.candidates("recover a crashed machine", new Set([BACKUPS]));
    assert.ok(direct.every((c) => c.path === BACKUPS));
  } finally { await h.controller.dispose(); }

  // A semantic side that ignores the allowed set (a bug, a stale index) is still contained by the query service.
  const rogue = {
    info: () => ({ state: "ready", model: "rogue" }),
    candidates: async () => [{ path: SECRET_PATH, score: 0.99, offsetChars: 0 }, { path: "Not/There.md", score: 0.98, offsetChars: 0 }, { path: RUNBOOK, score: 0.6, offsetChars: 0 }],
    related: async () => [{ path: SECRET_PATH, relatedTo: RUNBOOK, score: 0.99, heading: "Root password" }],
  };
  const made = makeService(makeVault(hybridFiles()), {}, { semantic: rogue });
  const r = await made.service.call("ask_librarian", { question: NO_SHARED_WORD }, "mcp");
  assert.deepEqual(paths(r), [RUNBOOK]);
  assert.equal(r.semantic.candidates, 1, "only the readable candidate was counted");
  noSecret(r, "the answer");
  const near = await made.service.call("get_related", { path: RUNBOOK }, "mcp");
  noSecret(near, "get_related");
});

test("hybrid: when semantic search is off, loading or failing, the answer is the lexical one and says which", async () => {
  const question = "nightly snapshot of the disk";
  const plain = makeService(makeVault(hybridFiles()));
  const lexical = await plain.service.call("ask_librarian", { question }, "mcp");
  assert.ok(lexical.total >= 1);
  const same = (r, why) => assert.deepEqual(r.results.map((x) => [x.path, x.score]), lexical.results.map((x) => [x.path, x.score]), why);

  // Loading: nothing is asked of the model, nothing waits for it.
  let asked = 0;
  const loading = { info: () => ({ state: "loading", model: "m" }), candidates: async () => { asked++; return []; }, related: async () => { asked++; return []; } };
  const a = await makeService(makeVault(hybridFiles()), {}, { semantic: loading }).service.call("ask_librarian", { question }, "mcp");
  same(a, "loading: lexical answer");
  assert.equal(a.semantic.state, "loading");
  assert.equal(asked, 0);
  assert.match(a.brief, /words only/i);

  // Off, with the reason the plugin gives (model not on this device).
  const off = { info: () => ({ state: "off", detail: "the model is not on this device" }), candidates: async () => { asked++; return []; }, related: async () => [] };
  const b = await makeService(makeVault(hybridFiles()), {}, { semantic: off }).service.call("ask_librarian", { question }, "mcp");
  same(b, "off: lexical answer");
  assert.equal(b.semantic.state, "off");
  assert.equal(asked, 0);

  // Failing: the error is reported, the answer stands.
  const failing = { info: () => ({ state: "ready", model: "m" }), candidates: async () => { throw new Error("worker stopped"); }, related: async () => { throw new Error("worker stopped"); } };
  const made = makeService(makeVault(hybridFiles()), {}, { semantic: failing });
  const c = await made.service.call("ask_librarian", { question }, "mcp");
  same(c, "failing: lexical answer");
  assert.equal(c.semantic.state, "error");
  assert.match(c.semantic.detail, /worker stopped/);
  assert.ok(made.diagnostics.some((d) => /semantic search failed/.test(d)));
  const near = await made.service.call("get_related", { path: RUNBOOK }, "mcp");
  assert.deepEqual(near.results.map((x) => [x.path, x.reasons]), [[BACKUPS, ["links_to"]]], "links still work without the model");

  // A real controller whose worker dies mid-session.
  const h = await hybrid();
  try {
    h.createWorker.made.at(-1).crash("out of memory");
    const d = await h.service.call("ask_librarian", { question }, "mcp");
    same(d, "crashed worker: lexical answer");
    assert.notEqual(d.semantic.state, "ready");
  } finally { await h.controller.dispose(); }
});

test("hybrid: partial index — questions are answered from the notes embedded so far, and the answer says it is partial", async () => {
  const h = await hybrid({ start: false });
  try {
    void h.controller.apply();
    const deadline = Date.now() + 5000;
    while (h.controller.info().state !== "partial" && h.controller.info().state !== "ready" && Date.now() < deadline) await new Promise((r) => setImmediate(r));
    const state = h.controller.info().state;
    const r = await h.service.call("ask_librarian", { question: "nightly snapshot of the disk" }, "mcp");
    assert.ok(r.total >= 1, "words answer at once");
    assert.ok(["partial", "ready"].includes(r.semantic.state), `was ${state}, answered as ${r.semantic.state}`);
    if (r.semantic.state === "partial") assert.match(r.brief, /still being built/);
    await h.controller.service.idle();
    assert.equal((await h.service.call("ask_librarian", { question: NO_SHARED_WORD }, "mcp")).semantic.state, "ready");
    assert.equal(h.requests.length, 0, "nothing was downloaded");
  } finally { await h.controller.dispose(); }
});

/* ------------------------------------------------- through a real server */

const TOKEN = "personal-device-token-1234567890";
let nextId = 1;
const META = { [MCP_META_PROTOCOL_VERSION]: MODERN_MCP_PROTOCOL_VERSION, [MCP_META_CLIENT_INFO]: { name: "Hybrid Fixture", version: "1" }, [MCP_META_CLIENT_CAPABILITIES]: {} };

function request(port, { method = "GET", path = "/", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body !== undefined ? { "Content-Type": "application/json", Accept: "application/json, text/event-stream" } : {}),
      ...headers,
    } }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, text: data, json: () => JSON.parse(data || "null") }));
    });
    req.on("error", reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
const modern = (port, method, params = {}) => request(port, {
  method: "POST", path: "/mcp",
  headers: { "MCP-Protocol-Version": MODERN_MCP_PROTOCOL_VERSION, "Mcp-Method": method, ...(method === "tools/call" ? { "Mcp-Name": params.name } : {}) },
  body: { jsonrpc: "2.0", id: nextId++, method, params: { ...params, _meta: META } },
});
const legacy = (port, version, message) => request(port, { method: "POST", path: "/mcp", headers: { "MCP-Protocol-Version": version }, body: message });
const toolJson = (result) => JSON.parse(result.content[0].text);

async function serve() {
  const h = await hybrid();
  const generation = new PolicyGeneration();
  const settings = { ...defaultPersonalNotesSettings(), includeFolders: ["/"] };
  let cached = null;
  const policy = () => (cached && cached.generation === generation.current ? cached
    : (cached = createPersonalReadPolicy({ settings, generation: generation.current, configDir: ".obsidian", isOperationalPath: isKosmosOperationalPath })));
  const service = new PersonalQueryService({
    source: h.vault.source, corpus: h.vault.corpus, search: h.vault.search, librarian: h.vault.librarian, policy,
    sensitivityRank: RANK, ceiling: () => "internal", lineage: lineageView,
    protocols: () => ({ mcp: { "streamable-http": ["2026-07-28", ...NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS] }, rest: ["/overview", "/notes", "/librarian", "/note", "/related", "/lineage"] }),
    semantic: h.semantic,
  });
  const fail = () => { throw new Error("the Engine graph must not be used in Personal mode"); };
  const provider = { getGraph: async () => fail(), getNoteContent: async () => fail(), getIndexedBody: fail, vaultName: () => "PrivateVaultName", lanAddresses: () => [] };
  const server = new KosmosAgentServer(http, { ...migrateAgentSettings({}), agentEnabled: true, agentPort: 0, agentToken: "legacy-existing-token-1234567890", activeProfile: "personal" }, provider);
  server.setPersonalRuntime({ service, policy, generation, token: () => TOKEN });
  await new Promise((resolve) => { server.start(); server.server.on("listening", resolve); });
  return { h, server, port: server.server.address().port, async stop() { server.stop(); await h.controller.dispose(); } };
}

test("hybrid over MCP: the server tells the client how to search and how to follow a process, and ask_librarian answers by words and meaning", async () => {
  const s = await serve();
  try {
    const discover = (await modern(s.port, "server/discover")).json().result;
    assert.match(discover.instructions, /Call vault_overview first/);
    assert.match(discover.instructions, /ask_librarian with the whole question/);
    assert.match(discover.instructions, /by words and, when semantic search is on, by meaning/);
    assert.match(discover.instructions, /do not stop at the first note/);
    assert.match(discover.instructions, /which step comes next/);
    assert.match(discover.instructions, /"semantic\.state" is not ready/);

    const tools = (await modern(s.port, "tools/list")).json().result.tools;
    const ask = tools.find((t) => t.name === "ask_librarian");
    assert.match(ask.description, /Hybrid search for a whole question/);
    assert.match(ask.description, /by meaning/);

    const overview = toolJson((await modern(s.port, "tools/call", { name: "vault_overview", arguments: {} })).json().result);
    assert.equal(overview.notes, 6);
    assert.equal(overview.capabilities.semantic_search.state, "ready");
    assert.match(overview.capabilities.semantic_search.runs, /inside Obsidian on the user's computer/);
    assert.deepEqual(overview.capabilities.semantic_search.used_by, ["ask_librarian", "get_related"]);

    const answer = toolJson((await modern(s.port, "tools/call", { name: "ask_librarian", arguments: { question: NO_SHARED_WORD } })).json().result);
    assert.equal(answer.results[0].path, RUNBOOK);
    assert.deepEqual(Object.keys(answer.results[0].found_by), ["meaning"]);
    assert.equal(answer.semantic.state, "ready");
    assert.deepEqual(answer.related.map((x) => x.path), [BACKUPS]);

    // The client follows the guidance: the related note opens, the unreadable one does not exist.
    const next = toolJson((await modern(s.port, "tools/call", { name: "get_note", arguments: { path: BACKUPS } })).json().result);
    assert.match(next.content, /A snapshot of the disk is taken every night/);
    const hidden = (await modern(s.port, "tools/call", { name: "get_note", arguments: { path: SECRET_PATH } })).json().result;
    assert.equal(hidden.isError, true);

    // An older client (2025-11-25) gets the same hybrid answer.
    const version = NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS[0];
    const init = (await legacy(s.port, version, { jsonrpc: "2.0", id: nextId++, method: "initialize", params: { protocolVersion: version, capabilities: {}, clientInfo: { name: "Older", version: "1" } } })).json().result;
    assert.match(init.instructions, /by words and, when semantic search is on, by meaning/);
    const older = toolJson((await legacy(s.port, version, { jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name: "ask_librarian", arguments: { question: NO_SHARED_WORD } } })).json().result);
    assert.equal(older.results[0].path, RUNBOOK);
    assert.equal(older.semantic.state, "ready");

    // REST shows the same answer.
    const rest = (await request(s.port, { path: `/librarian?question=${encodeURIComponent(NO_SHARED_WORD)}` })).json();
    assert.equal(rest.results[0].path, RUNBOOK);
    assert.equal(rest.semantic.state, "ready");

    for (const [where, value] of [["overview", overview], ["answer", answer], ["older answer", older], ["rest", rest], ["tools", tools]]) noSecret(value, where);
    assert.equal(s.h.requests.length, 0, "answering made no download");
  } finally { await s.stop(); }
});
