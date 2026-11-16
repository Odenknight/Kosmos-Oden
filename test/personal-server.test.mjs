/**
 * Personal Notes profile through a REAL started Agent API server (0.9.0):
 * acceptance rows S01, S03, S04, R01, N03, N04 (server part) and B01.
 *
 * The Personal runtime is built from the in-memory fixture in
 * test/helpers/personal-fixture.mjs. The existing profile's data provider
 * throws on use, which proves no Personal request reaches the Engine graph.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { buildGraph, stripFrontmatter } from "../dist/kosmos-core.mjs";
import { isKosmosOperationalPath } from "../dist/kosmos-operational-paths.mjs";
import {
  PERSONAL_CONTENT_RULE,
  PersonalQueryService,
  PolicyGeneration,
  createPersonalReadPolicy,
  defaultPersonalNotesSettings,
  lineageView,
} from "../dist/kosmos-personal-notes.mjs";
import {
  KosmosAgentServer,
  MCP_META_CLIENT_CAPABILITIES,
  MCP_META_CLIENT_INFO,
  MCP_META_PROTOCOL_VERSION,
  MODERN_MCP_PROTOCOL_VERSION,
  NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS,
  migrateAgentSettings,
} from "../dist/kosmos-agent-server.mjs";
import { RANK, makeVault } from "./helpers/personal-fixture.mjs";

const PERSONAL_TOKEN = "personal-device-token-1234567890";
const LEGACY_TOKEN = "legacy-existing-token-1234567890";
const SIX = ["search_notes", "ask_librarian", "get_note", "get_related", "get_lineage", "vault_overview"];

const NOTE_A = "---\r\nuid: u-a\r\ntags:\r\n  - home\r\n---\r\nAlpha plumber note. ![[pic.png]] ![[hidden.png]]\r\n";
const LONG = "line one\r\n" + "x".repeat(70_000) + "😀" + "y".repeat(70_000) + " tail plumber\r\n";
const FILES = {
  "Notes/A.md": { raw: NOTE_A, meta: { uid: "u-a", tags: ["home"], links: ["Notes/B.md", "Private/Secret.md"], attachments: [
    { target: "pic.png", kind: "embed", path: "Notes/pic.png" },
    { target: "hidden.png", kind: "embed", path: "Private/hidden.png" },
  ] } },
  "Notes/B.md": { raw: "Bravo plumber replaces A", meta: { tags: ["home"], links: ["Notes/A.md"], supersedes: ["[[Notes/A]]", "[[Private/Secret]]"] } },
  "Notes/Long.md": LONG,
  "Notes/Labelled.md": { raw: "---\nsensitivity: secret\n---\nLabelled plumber", meta: { authoredSensitivity: "secret", tags: ["home"] } },
  "Private/Secret.md": { raw: "Secret plumber", meta: { tags: ["home"], links: ["Notes/A.md"], supersedes: ["[[Notes/B]]"] } },
};
const OTHERS = ["Notes/pic.png", "Private/hidden.png"];
const HIDDEN = ["Private/Secret.md", "Private/hidden.png", "Notes/Labelled.md", "Secret plumber", "Labelled plumber"];

/** A Personal runtime over the fixture vault, wired the way the plugin must wire it. */
function personalSetup({ includeFolders = ["Notes"], token = PERSONAL_TOKEN } = {}) {
  const vault = makeVault(FILES, { others: OTHERS });
  const generation = new PolicyGeneration();
  let settings = { ...defaultPersonalNotesSettings(), includeFolders };
  let cached = null;
  // Built lazily per generation: the server bumps `generation` itself.
  const policy = () => (cached && cached.generation === generation.current ? cached
    : (cached = createPersonalReadPolicy({ settings, generation: generation.current, configDir: ".obsidian", isOperationalPath: isKosmosOperationalPath })));
  const service = new PersonalQueryService({
    source: vault.source, corpus: vault.corpus, search: vault.search, librarian: vault.librarian, policy,
    sensitivityRank: RANK, ceiling: () => "internal", lineage: lineageView,
    protocols: () => ({ mcp: { "streamable-http": ["2026-07-28", ...NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS] }, rest: ["/overview", "/notes", "/librarian", "/note", "/related", "/lineage"] }),
  });
  let current = token;
  return {
    vault,
    runtime: { service, policy, generation, token: () => current },
    setScope(next) { settings = { ...settings, ...next }; },
    setToken(next) { current = next; },
  };
}

/** Existing-profile provider that must never be reached in Personal mode. */
function untouchableProvider() {
  const fail = () => { throw new Error("the Engine graph must not be used in Personal mode"); };
  return { getGraph: async () => fail(), getNoteContent: async () => fail(), getIndexedBody: fail, vaultName: () => "PrivateVaultName", lanAddresses: () => [] };
}

async function start({ setup = personalSetup(), profile = "personal", overrides = {}, provider = untouchableProvider() } = {}) {
  const settings = { ...migrateAgentSettings({}), agentEnabled: true, agentPort: 0, agentToken: LEGACY_TOKEN, activeProfile: profile, ...overrides };
  const server = new KosmosAgentServer(http, settings, provider);
  if (setup) server.setPersonalRuntime(setup.runtime);
  await new Promise((resolve) => { server.start(); server.server.on("listening", resolve); });
  return { server, setup, port: server.server.address().port };
}

function request(port, { method = "GET", path = "/", headers = {}, body, token = PERSONAL_TOKEN } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, setHost: !headers.Host, headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json", Accept: "application/json, text/event-stream" } : {}),
      ...headers,
    } }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, text: data, json: () => JSON.parse(data || "null") }));
      res.on("aborted", () => resolve({ status: res.statusCode, text: data, aborted: true }));
      res.on("error", () => resolve({ status: res.statusCode, text: data, aborted: true }));
    });
    req.on("error", (e) => (e.code === "ECONNRESET" ? resolve({ status: 0, text: "", aborted: true }) : reject(e)));
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
const rest = (port, path, token) => request(port, { path, token });

let nextId = 1;
const modernMeta = { [MCP_META_PROTOCOL_VERSION]: MODERN_MCP_PROTOCOL_VERSION, [MCP_META_CLIENT_INFO]: { name: "Modern Fixture", version: "1" }, [MCP_META_CLIENT_CAPABILITIES]: {} };
/** One modern (2026-07-28) request: per-request metadata plus mirrored headers. */
function modern(port, method, params = {}, token) {
  const nameHeader = method === "tools/call" ? { "Mcp-Name": params.name } : {};
  return request(port, { method: "POST", path: "/mcp", token, headers: { "MCP-Protocol-Version": MODERN_MCP_PROTOCOL_VERSION, "Mcp-Method": method, ...nameHeader },
    body: { jsonrpc: "2.0", id: nextId++, method, params: { ...params, _meta: modernMeta } } });
}
/** One legacy request at `version`; 2025-03-26 is sent headerless (the specified default). */
function legacy(port, version, message, token) {
  const headers = version === "2025-03-26" ? {} : { "MCP-Protocol-Version": version };
  return request(port, { method: "POST", path: "/mcp", token, headers, body: message });
}
const call = (name, args, id = nextId++) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const toolJson = (result) => JSON.parse(result.content[0].text);
const sse = (text) => text.split(/\n\n/).filter(Boolean).map((b) => JSON.parse(b.split("\n").find((l) => l.startsWith("data: ")).slice(6)));
function assertNoHidden(text, where) { for (const h of HIDDEN) assert.ok(!text.includes(h), `${where} leaked ${h}`); }

/* ------------------------------------------------------------------ REST */

test("REST: the six Personal routes answer from the shared scope only", async () => {
  const { server, port } = await start();
  try {
    const overview = await rest(port, "/overview");
    assert.equal(overview.status, 200);
    assert.equal(overview.json().notes, 3, "A, B and Long; not the labelled or the out-of-scope note");
    assert.deepEqual(overview.json().tools, SIX);

    const search = await rest(port, "/notes?query=plumber");
    assert.equal(search.status, 200);
    assert.deepEqual(search.json().results.map((r) => r.path).sort(), ["Notes/A.md", "Notes/B.md", "Notes/Long.md"]);
    assert.equal(search.json().total, 3);

    const librarian = await rest(port, "/librarian?question=plumber");
    assert.equal(librarian.status, 200);
    assert.equal(librarian.json().contract, "kosmos-librarian/1");
    assert.equal(librarian.json().results.length, 3);
    assert.match(librarian.json().brief, /matching notes/);

    const note = await rest(port, "/note?path=Notes/A.md");
    assert.equal(note.status, 200);
    assert.equal(note.json().content, NOTE_A, "exact raw Markdown: frontmatter and CRLF included");
    assert.deepEqual(note.json().attachments, [
      { target: "pic.png", kind: "embed", status: "available", path: "Notes/pic.png" },
      { target: "hidden.png", kind: "embed", status: "not_shared" },
    ]);
    assert.equal((await rest(port, "/note?uid=u-a")).json().path, "Notes/A.md");

    const related = await rest(port, "/related?path=Notes/A.md");
    assert.deepEqual(related.json().results.map((r) => r.path), ["Notes/B.md"]);
    const lineage = await rest(port, "/lineage?path=Notes/B.md");
    assert.deepEqual(lineage.json().edges, [{ from: "Notes/B.md", to: "Notes/A.md", source: "declared" }]);

    for (const r of [overview, search, note, related, lineage]) assertNoHidden(r.text, "REST");
    const ui = await rest(port, "/ui");
    assert.equal(ui.status, 200);
    assert.match(ui.text, /Kosmos Librarian/);
    assert.match(ui.text, /\/librarian\?question=/);
    assert.doesNotMatch(ui.text, /Notes\/|PrivateVaultName/, "the page is static: no note, path or vault name");

    for (const path of ["/", "/health"]) {
      const r = await rest(port, path);
      assert.equal(r.status, 200);
      assert.equal(r.json().profile, "personal");
      assert.ok(!/Notes\/|PrivateVaultName|"notes"\s*:/.test(r.text), `${path} discloses no paths, vault name or counts`);
    }
  } finally { server.stop(); }
});

test("REST: every non-Personal route is the same not-found as an unknown route", async () => {
  const { server, port } = await start();
  try {
    const unknown = await rest(port, "/no-such-route");
    assert.equal(unknown.status, 404);
    for (const path of ["/diagnostics", "/graph", "/at?time=2026-01-01", "/episodes", "/graphiti/status", "/gkx/note?path=Notes/A.md",
      "/gkx/assessment?path=Notes/A.md", "/gkx/diagnostics?path=Notes/A.md", "/gkx/labels?path=Notes/A.md", "/gkx/evidence?path=Notes/A.md",
      "/gkx/relationships?path=Notes/A.md", "/gkx/validate?path=Notes/A.md", "/gkx/policy", "/gkx/assess-vault", "/overview/x"]) {
      const r = await rest(port, path);
      assert.equal(r.status, 404, path);
      assert.deepEqual(r.json(), unknown.json(), path);
    }
  } finally { server.stop(); }
});

test("REST: strict input, and hidden notes are indistinguishable from missing ones", async () => {
  const { server, port } = await start();
  try {
    const missing = await rest(port, "/note?path=Notes/Missing.md");
    assert.equal(missing.status, 404);
    for (const path of ["Private/Secret.md", "Notes/Labelled.md"]) assert.deepEqual((await rest(port, `/note?path=${path}`)).json(), missing.json(), path);
    for (const bad of [
      "/note?path=Notes/../Private/Secret.md", "/note?path=Notes%2F..%2FPrivate%2FSecret.md", "/note?path=%2Fetc%2Fpasswd", "/note?path=Notes/A.md&offset_chars=1",
      "/note?path=Notes/A.md&offset_chars=-1", "/note?path=Notes/A.md&limit_chars=1e3", "/note?path=Notes/A.md&path=Notes/B.md", "/note?path=%E0%A4%A",
      "/note?path=Notes/A.md&token=" + PERSONAL_TOKEN, "/notes?q=plumber",
    ]) {
      const r = await rest(port, bad);
      assert.equal(r.status, 400, bad);
      assert.equal(r.json().error, "invalid_argument", bad);
      assertNoHidden(r.text, bad);
    }
  } finally { server.stop(); }
});

/* ------------------------------------------------------------- tokens */

test("auth: only the injected device-local token opens the Personal connection", async () => {
  const { server, setup, port } = await start({ overrides: { agentAllowQueryToken: true } });
  try {
    assert.equal((await rest(port, "/overview")).status, 200);
    assert.equal((await rest(port, "/overview", LEGACY_TOKEN)).status, 401, "the persisted agentToken is not accepted implicitly");
    assert.equal((await rest(port, "/overview", null)).status, 401);
    assert.equal((await request(port, { path: `/overview?token=${PERSONAL_TOKEN}`, token: null })).status, 401, "no ?token= on the Personal connection");
    assert.equal((await request(port, { path: "/overview", headers: { "x-api-key": PERSONAL_TOKEN }, token: null })).status, 200);
    assert.equal((await request(port, { path: "/overview", headers: { Host: "evil.example" } })).status, 403);
    assert.equal((await modern(port, "tools/list", {}, LEGACY_TOKEN)).status, 401);
    assert.equal((await legacy(port, "2025-06-18", { jsonrpc: "2.0", id: 1, method: "tools/list" }, LEGACY_TOKEN)).status, 401);

    // Rotation: the old token stops working at once.
    setup.setToken("rotated-device-token-0987654321");
    server.reconfigureAccess();
    assert.equal((await rest(port, "/overview")).status, 401);
    assert.equal((await rest(port, "/overview", "rotated-device-token-0987654321")).status, 200);
    // Disconnect: no token means every request is refused.
    setup.setToken("");
    server.reconfigureAccess();
    assert.equal((await rest(port, "/overview", "")).status, 401);
    assert.equal((await rest(port, "/overview", "rotated-device-token-0987654321")).status, 401);
  } finally { server.stop(); }
});

test("runtime absent: the Personal profile fails closed instead of serving the existing profile", async () => {
  const { server, port } = await start({ setup: null });
  try {
    for (const path of ["/overview", "/graph", "/note?path=Notes/A.md", "/"]) {
      const r = await rest(port, path, LEGACY_TOKEN);
      assert.equal(r.status, 503, path);
      assert.equal(r.json().error, "not_ready");
    }
    const mcp = await modern(port, "tools/list", {}, LEGACY_TOKEN);
    assert.equal(mcp.status, 503);
    assert.match(mcp.json().error.message, /not ready/);
    const s = personalSetup();
    server.setPersonalRuntime(s.runtime);
    assert.equal((await rest(port, "/overview")).status, 200);
    server.setPersonalRuntime(null);
    assert.equal((await rest(port, "/overview")).status, 503);
  } finally { server.stop(); }
});

test("LAN bind on the Personal connection needs the device token to start", () => {
  const s = personalSetup({ token: "" });
  const server = new KosmosAgentServer(http, { ...migrateAgentSettings({}), agentPort: 0, agentToken: LEGACY_TOKEN, activeProfile: "personal",
    personalNotes: { ...defaultPersonalNotesSettings(), connection: { ...defaultPersonalNotesSettings().connection, bindMode: "lan" } } }, untouchableProvider());
  server.setPersonalRuntime(s.runtime);
  server.start();
  assert.match(server.status, /LAN mode requires an auth token/);
  assert.equal(server.server, null);
});

/* --------------------------------------------------------------- MCP */

test("modern MCP: discovery, exactly six tools with modern shapes, calls and hidden-tool denial", async () => {
  const { server, port } = await start();
  try {
    const discover = (await modern(port, "server/discover")).json().result;
    assert.ok(discover.instructions.includes(PERSONAL_CONTENT_RULE));
    const list = await modern(port, "tools/list");
    assert.equal(list.status, 200);
    const tools = list.json().result.tools;
    assert.deepEqual(tools.map((t) => t.name), SIX);
    for (const t of tools) {
      assert.ok(t.title && t.outputSchema && t.annotations?.readOnlyHint === true, `${t.name} keeps the modern fields`);
      assert.equal("agent_name" in t.inputSchema.properties, false);
    }
    assert.equal(list.json().result.cacheScope, "private");

    const found = (await modern(port, "tools/call", { name: "search_notes", arguments: { query: "plumber" } })).json().result;
    assert.equal(found.isError, false);
    assert.deepEqual(found.structuredContent.results.map((r) => r.path).sort(), ["Notes/A.md", "Notes/B.md", "Notes/Long.md"]);

    for (const hidden of ["get_assessment", "graph_at_time", "export_graphiti_episodes", "get_gkx_note"]) {
      const r = await modern(port, "tools/call", { name: hidden, arguments: { path: "Notes/A.md" } });
      assert.equal(r.json().error.code, -32602, hidden);
      assert.match(r.json().error.message, /Unknown tool/);
    }
    const invalid = await modern(port, "tools/call", { name: "get_note", arguments: { path: "Notes/A.md", offset_chars: 1.5 } });
    assert.equal(invalid.json().error.code, -32602);
    const absent = (await modern(port, "tools/call", { name: "get_note", arguments: { path: "Private/Secret.md" } })).json().result;
    assert.equal(absent.isError, true);
    assert.deepEqual(absent.structuredContent, { error: "not_found", message: "note not found" });
  } finally { server.stop(); }
});

test("legacy MCP: every native revision initializes, lists exactly six minimal tools and calls them", async () => {
  const { server, port } = await start();
  try {
    for (const version of NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS) {
      const init = await legacy(port, version, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: version, capabilities: {}, clientInfo: { name: "Legacy Fixture", version: "1" } } });
      assert.equal(init.json().result.protocolVersion, version);
      assert.ok(init.json().result.instructions.includes(PERSONAL_CONTENT_RULE));
      const tools = (await legacy(port, version, { jsonrpc: "2.0", id: 2, method: "tools/list" })).json().result.tools;
      assert.deepEqual(tools.map((t) => t.name), SIX, version);
      for (const t of tools) assert.deepEqual(Object.keys(t).sort(), ["description", "inputSchema", "name"]);
      const note = (await legacy(port, version, call("get_note", { path: "Notes/A.md" }))).json().result;
      assert.deepEqual(Object.keys(note).sort(), ["content", "isError"]);
      assert.equal(toolJson(note).content, NOTE_A);
      const hidden = (await legacy(port, version, call("get_assessment", { path: "Notes/A.md" }))).json();
      assert.equal(hidden.error.code, -32602, `${version}: a hidden tool is denied on a direct call`);
    }
  } finally { server.stop(); }
});

test("legacy MCP: a March 2025 batch lists six tools, answers calls, skips notifications and denies hidden tools", async () => {
  const { server, port } = await start();
  try {
    const batch = [
      { jsonrpc: "2.0", id: "list", method: "tools/list" },
      call("search_notes", { query: "plumber" }, "search"),
      { jsonrpc: "2.0", method: "notifications/initialized" },
      call("get_assessment", { path: "Notes/A.md" }, "hidden"),
      call("get_note", { path: "Private/Secret.md" }, "secret"),
    ];
    const r = await legacy(port, "2025-03-26", batch);
    assert.equal(r.status, 200);
    const byId = Object.fromEntries(sse(r.text).map((m) => [m.id, m]));
    assert.deepEqual(Object.keys(byId).sort(), ["hidden", "list", "search", "secret"]);
    assert.deepEqual(byId.list.result.tools.map((t) => t.name), SIX);
    assert.equal(toolJson(byId.search.result).total, 3);
    assert.equal(byId.hidden.error.code, -32602);
    assert.equal(byId.secret.result.isError, true);
    assertNoHidden(r.text, "batch");
  } finally { server.stop(); }
});

/* ------------------------------------------------------- exact pages */

async function readAllPages(fetchPage) {
  let offset = 0, hash, text = "", pages = 0;
  for (;;) {
    const page = await fetchPage(offset, hash);
    assert.equal(page.contract ?? "kosmos-personal-notes/1", "kosmos-personal-notes/1");
    text += page.content;
    hash = page.content_hash;
    pages++;
    if (!page.truncated) return { text, pages };
    offset = page.next_offset_chars;
  }
}

test("exact page reconstruction and note_changed through REST, modern MCP and legacy MCP", async () => {
  const { server, setup, port } = await start();
  try {
    const viaRest = await readAllPages(async (offset, hash) => (await rest(port, `/note?path=Notes/Long.md&limit_chars=64000&offset_chars=${offset}${hash ? `&expected_hash=${hash}` : ""}`)).json());
    assert.equal(viaRest.text, LONG, "REST pages concatenate to the exact source");
    assert.ok(viaRest.pages >= 3);
    const viaModern = await readAllPages(async (offset, hash) => (await modern(port, "tools/call", { name: "get_note", arguments: { path: "Notes/Long.md", limit_chars: 64000, offset_chars: offset, ...(hash ? { expected_hash: hash } : {}) } })).json().result.structuredContent);
    assert.equal(viaModern.text, LONG);
    const viaLegacy = await readAllPages(async (offset, hash) => toolJson((await legacy(port, "2025-11-25", call("get_note", { path: "Notes/Long.md", limit_chars: 64000, offset_chars: offset, ...(hash ? { expected_hash: hash } : {}) }))).json().result));
    assert.equal(viaLegacy.text, LONG);

    const first = (await rest(port, "/note?path=Notes/Long.md&limit_chars=64000")).json();
    setup.vault.write("Notes/Long.md", LONG + "edited");
    const changed = await rest(port, `/note?path=Notes/Long.md&limit_chars=64000&offset_chars=${first.next_offset_chars}&expected_hash=${first.content_hash}`);
    assert.equal(changed.status, 409);
    assert.equal(changed.json().error, "note_changed");
    const changedMcp = (await modern(port, "tools/call", { name: "get_note", arguments: { path: "Notes/Long.md", offset_chars: first.next_offset_chars, expected_hash: first.content_hash } })).json().result;
    assert.equal(changedMcp.isError, true);
    assert.equal(changedMcp.structuredContent.error, "note_changed");
    const changedLegacy = toolJson((await legacy(port, "2025-06-18", call("get_note", { path: "Notes/Long.md", offset_chars: first.next_offset_chars, expected_hash: first.content_hash }))).json().result);
    assert.equal(changedLegacy.error, "note_changed");
  } finally { server.stop(); }
});

/* ------------------------------------------ in-flight access changes (S04) */

const CHANGES = {
  scope: ({ setup }) => setup.setScope({ includeFolders: [] }),
  token: ({ setup }) => setup.setToken("rotated-device-token-0987654321"),
  profile: ({ server }) => { server.settings.activeProfile = "existing"; },
  bind: ({ server }) => { server.settings.personalNotes.connection.bindMode = "lan"; },
};
const TRANSPORTS = {
  rest: (port) => rest(port, "/note?path=Notes/A.md"),
  modern: (port) => modern(port, "tools/call", { name: "get_note", arguments: { path: "Notes/A.md" } }),
  legacy: (port) => legacy(port, "2025-11-25", call("get_note", { path: "Notes/A.md" })),
  batch: (port) => legacy(port, "2025-03-26", [call("get_note", { path: "Notes/A.md" }), { jsonrpc: "2.0", id: "p", method: "ping" }]),
};

test("a profile, scope, token or bind change mid-request prevents the stale response on every transport", async () => {
  for (const [kind, change] of Object.entries(CHANGES)) {
    for (const [transport, send] of Object.entries(TRANSPORTS)) {
      const ctx = await start({ setup: personalSetup() });
      try {
        let outcome;
        ctx.setup.vault.onRead = async (path) => {
          if (path !== "Notes/A.md") return;
          change(ctx);
          outcome = ctx.server.reconfigureAccess();
        };
        const r = await send(ctx.port);
        const where = `${kind} via ${transport}`;
        assert.ok(!r.text.includes("Alpha plumber note"), `${where}: the note text must not be delivered`);
        assert.ok(r.aborted || r.status === 503, `${where}: got ${r.status}`);
        assert.equal(outcome.restartRequired, kind === "bind", `${where}: restart only when the bind address changes`);
      } finally { ctx.server.stop(); }
    }
  }
});

test("a generation bump by the plugin alone (no reconfigureAccess) also blocks the response", async () => {
  const ctx = await start();
  try {
    ctx.setup.vault.onRead = async () => { ctx.setup.runtime.generation.bump(); };
    const r = await rest(ctx.port, "/note?path=Notes/A.md");
    assert.ok(!r.text.includes("Alpha plumber note"));
    assert.ok(r.aborted || r.status === 503);
  } finally { ctx.server.stop(); }
});

/* ------------------------------------------------- traversal highlights */

test("live traversal highlights carry only paths the Personal policy allows", async () => {
  const { server, port } = await start();
  const seen = [];
  server.onTraversal = (paths, tool) => seen.push({ tool, paths });
  try {
    await rest(port, "/notes?query=plumber");
    await rest(port, "/related?path=Notes/A.md");
    await modern(port, "tools/call", { name: "get_lineage", arguments: { path: "Notes/B.md" } });
    await legacy(port, "2025-06-18", call("get_note", { path: "Notes/A.md" }));
    const all = seen.flatMap((s) => s.paths);
    assert.ok(all.includes("Notes/A.md") && all.includes("Notes/B.md"));
    assert.ok(all.every((p) => p.startsWith("Notes/") && p !== "Notes/Labelled.md"), JSON.stringify(seen));
  } finally { server.stop(); }
});

/* -------------------------------------------- existing profile unchanged */

const EXISTING_TOOLS = ["vault_overview", "search_notes", "get_note", "get_lineage", "get_related", "graph_at_time", "export_graphiti_episodes",
  "graphiti_ingestion_status", "get_gkx_note", "get_assessment", "get_diagnostics", "get_effective_labels", "get_evidence", "get_relationships",
  "get_policy", "validate_note", "assess_note", "assess_vault"];

function existingProvider() {
  const files = [
    { relativePath: "Home.md", content: "---\nsensitivity: internal\n---\n# Home\n[[Engine v2]]" },
    { relativePath: "Ideas/Engine v2.md", content: "---\ntype: idea\nsensitivity: internal\n---\nNew engine." },
  ];
  const graph = buildGraph(files, ["Ideas"], undefined, { defaultSensitivity: "internal" });
  const bodies = new Map(files.map((f) => [f.relativePath, stripFrontmatter(f.content)]));
  return { getGraph: async () => graph, getNoteContent: async (p) => bodies.get(p) ?? null, vaultName: () => "V", lanAddresses: () => [] };
}

test("existing profile: tools, shapes and token unchanged, even with a Personal runtime injected", async () => {
  const { server, port } = await start({ profile: "existing", provider: existingProvider() });
  try {
    const list = await modern(port, "tools/list", {}, LEGACY_TOKEN);
    assert.deepEqual(list.json().result.tools.map((t) => t.name), EXISTING_TOOLS);
    assert.equal((await rest(port, "/overview", PERSONAL_TOKEN)).status, 401, "the Personal token does not open the existing profile");
    const note = (await rest(port, "/note?path=Ideas/Engine v2.md".replace(" ", "%20"), LEGACY_TOKEN)).json();
    assert.equal(note.content, "New engine.");
    assert.ok(note.gkx && note.links, "existing get_note shape");
    assert.equal("contract" in note, false);
    const overview = (await rest(port, "/overview", LEGACY_TOKEN)).json();
    assert.equal(overview.notes, 1, "the unlabelled non-GKX Home note still fails closed to the existing default (secret)");
    assert.equal("personalNotes" in overview, false);
    assert.equal((await rest(port, "/graph", LEGACY_TOKEN)).status, 200);
    const legacyTools = (await legacy(port, "2025-06-18", { jsonrpc: "2.0", id: 1, method: "tools/list" }, LEGACY_TOKEN)).json().result.tools;
    assert.deepEqual(legacyTools.map((t) => t.name), EXISTING_TOOLS);
  } finally { server.stop(); }
});
