/** Agent API tests (§15–§18, §24): auth, Host/Origin, byte limits, REST, MCP negotiation. */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { buildGraph, stripFrontmatter } from "../dist/kosmos-core.mjs";
import {
  KosmosAgentServer,
  LATEST_MCP_PROTOCOL_VERSION,
  MAX_BODY_BYTES,
  MAX_CONCURRENT_PER_AGENT,
  MAX_CONCURRENT_REQUESTS,
  MAX_NOTE_CONTENT_CHARS,
  SUPPORTED_MCP_PROTOCOL_VERSIONS,
  MODERN_MCP_PROTOCOL_VERSION,
  MCP_META_PROTOCOL_VERSION,
  MCP_META_CLIENT_INFO,
  MCP_META_CLIENT_CAPABILITIES,
  MCP_META_SERVER_INFO,
  MCP_NAME_SOURCE,
  MCP_CACHE_SCOPE_DEFAULT,
  MCP_CACHE_TTL_MS_DEFAULT,
  MCP_CACHEABLE_RESULT_METHODS,
  AGENT_SETTINGS_SCHEMA,
  DEFAULT_AGENT_SETTINGS,
  migrateAgentSettings,
  makeToken,
} from "../dist/kosmos-agent-server.mjs";

const buildProductGraph = (files, folders) => buildGraph(files, folders, undefined, { defaultSensitivity: "internal" });

const FILES = [
  { relativePath: "Home.md", content: "# Home\n[[Engine v2]]" },
  { relativePath: "Ideas/Engine v1.md", content: "---\ntype: idea\ntimestamp: 2026-01-01T00:00:00Z\nsensitivity: internal\n---\nOld engine." },
  { relativePath: "Ideas/Engine v2.md", content: "---\ntype: idea\ntimestamp: 2026-03-01T00:00:00Z\nsensitivity: internal\nsupersedes:\n  - Engine v1\n---\nNew engine.\n\n**Related:** [[Home]]" },
];

function fixtureProvider() {
  const graph = buildProductGraph(FILES, ["Ideas"]);
  const contents = new Map(FILES.map((f) => [f.relativePath, stripFrontmatter(f.content)]));
  return {
    getGraph: async () => graph,
    getNoteContent: async (p) => contents.get(p) ?? null,
    vaultName: () => "TestVault",
    lanAddresses: () => [],
  };
}

const TOKEN = "test-token-1234567890";

test("Graphiti export uses snapshot bodies and refuses a policy change during fallback reads", async () => {
  const provider = fixtureProvider();
  const graph = await provider.getGraph();
  const server = new KosmosAgentServer(http, settings(), {
    ...provider,
    getIndexedBody: (path, snapshot) => { assert.equal(snapshot, graph); return "snapshot body"; },
    getNoteContent: async () => { throw new Error("must not reread live files"); },
  });
  const episodes = await server.qEpisodes();
  assert.ok(episodes.filter(e => e.source === "json").every(e => JSON.parse(e.episode_body).content === "snapshot body"));
  const changing = new KosmosAgentServer(http, settings(), {
    ...provider, getNoteContent: async () => { changing.settings.agentSensitivityCeiling = "public"; return "now restricted"; },
  });
  await assert.rejects(() => changing.qEpisodes(), /Vault provider unavailable/);
});

test("search exposes the same projection UID accepted by note selectors", async () => {
  const provider = fixtureProvider();
  const graph = await provider.getGraph();
  const note = graph.nodes.find(n => n.path === "Ideas/Engine v2.md");
  const uid = "11111111-2222-4333-8444-555555555555";
  note.gkx.uid = undefined;
  note.gkx.projection.authored.uid = uid;
  const server = new KosmosAgentServer(http, settings(), provider);
  const result = await server.qSearch("Engine v2");
  assert.equal(result.results.find(n => n.path === note.path).uid, uid);
  const selected = await server.callTool("get_note", { uid });
  assert.equal(selected.path, note.path);
  assert.equal(selected.uid, uid);
  assert.equal(selected.gkx.uid, uid);
});

test("missing projection is actionable only for readable notes", async () => {
  const provider = fixtureProvider();
  const graph = await provider.getGraph();
  const note = graph.nodes.find(n => n.path === "Ideas/Engine v2.md");
  note.gkx.projection = undefined;
  note.gkx.sensitivity = "internal";
  const server = new KosmosAgentServer(http, settings(), provider);
  for (const tool of ["assess_note", "get_assessment", "get_diagnostics", "validate_note"]) {
    const result = await server.callTool(tool, { path: note.path });
    assert.equal(result.code, "GKX_PROJECTION_UNAVAILABLE");
    assert.equal(result.path, note.path);
    assert.match(result.error, /get_note/);
    note.gkx.sensitivity = "secret";
    assert.deepEqual(await server.callTool(tool, { path: note.path }),
      await server.callTool(tool, { path: "Absent.md" }), "hidden and missing notes must remain indistinguishable");
    note.gkx.sensitivity = "internal";
  }
});

test("temporal queries explain time arguments and expose bounded readable scope", async () => {
  const server = new KosmosAgentServer(http, settings(), fixtureProvider());
  await assert.rejects(server.callTool("graph_at_time", { at: "2026-09-01" }), /expects time, not at/);
  await assert.rejects(server.callTool("graph_at_time", { time: "2026-09-01", area: "Ideas" }), /Unexpected argument: area/);
  const result = await server.callTool("graph_at_time", { time: "2026-09-01", limit: 1 });
  assert.equal(result.scope, "all-readable-notes");
  assert.equal(result.truncated, result.counts.valid > 1 || result.counts.superseded > 1);
  assert.ok(result.valid.length <= 1 && result.superseded.length <= 1);
  const full = await server.callTool("graph_at_time", { time: "2026-09-01", limit: 200 });
  assert.equal(full.truncated, false);
  assert.deepEqual(full.counts, result.counts);
});

test("Graphiti export uses snapshot bodies and refuses a policy change during fallback reads", async () => {
  const provider = fixtureProvider();
  const graph = await provider.getGraph();
  const server = new KosmosAgentServer(http, settings(), {
    ...provider,
    getIndexedBody: (path, snapshot) => { assert.equal(snapshot, graph); return "snapshot body"; },
    getNoteContent: async () => { throw new Error("must not reread live files"); },
  });
  const episodes = await server.qEpisodes();
  assert.ok(episodes.filter(e => e.source === "json").every(e => JSON.parse(e.episode_body).content === "snapshot body"));
  const changing = new KosmosAgentServer(http, settings(), {
    ...provider, getNoteContent: async () => { changing.settings.agentSensitivityCeiling = "public"; return "now restricted"; },
  });
  await assert.rejects(() => changing.qEpisodes(), /Vault provider unavailable/);
});

test("opt-in body search uses only readable snapshot bodies and reports bounded coverage", async () => {
  const files = [
    { relativePath: "Visible.md", content: "---\ntype: semantic\nsensitivity: internal\n---\nA DOI appears only in the body." },
    { relativePath: "Hidden.md", content: "---\ntype: semantic\nsensitivity: secret\n---\nPrivate DOI." },
    { relativePath: "Long.md", content: "---\ntype: semantic\nsensitivity: internal\n---\n" + "x".repeat(64000) + "DOI" },
  ];
  const graph = buildProductGraph(files, []), reads = [];
  const server = new KosmosAgentServer(http, settings(), {
    ...fixtureProvider(), getGraph: async () => graph,
    getNoteContent: async () => { throw new Error("Search must not read the vault"); },
    getIndexedBody: (path, snapshot) => { assert.equal(snapshot, graph); reads.push(path); return stripFrontmatter(files.find(f => f.relativePath === path).content); },
  });
  assert.equal((await server.qSearch("DOI")).total, 0);
  const result = await server.qSearch("DOI", { body: true });
  assert.deepEqual(result.results.map(n => n.path), ["Visible.md"]);
  assert.ok(!reads.includes("Hidden.md"));
  assert.equal(result.bodySearch.truncated, true);
  assert.equal(result.bodySearch.coverage, "partial");
  assert.ok(result.bodySearch.charactersScanned <= 8_000_000);
  await assert.rejects(server.callTool("search_notes", { query: "DOI", body: "true" }), /boolean/);
  const metadataOnly = new KosmosAgentServer(http, settings(), fixtureProvider());
  await assert.rejects(metadataOnly.qSearch("DOI", { body: true }), /unavailable/);
});

function settings(overrides = {}) {
  return {
    schemaVersion: 3,
    agentEnabled: true,
    agentPort: 0, // ephemeral
    agentToken: TOKEN,
    agentRequireToken: true,
    agentBindMode: "localhost",
    agentSensitivityCeiling: "internal",
    // Production default: unlabeled notes without a projection fail closed to
    // "secret" (gkos-engine v1.0.6 DIV-002). Shared fixtures below carry explicit
    // sensitivity labels so the non-sensitivity tests stay deterministic.
    defaultSensitivity: "secret",
    agentGraphNamespace: "testnamespace",
    agentAllowQueryToken: false,
    ...overrides,
  };
}
function startServer(overrides = {}) {
  const server = new KosmosAgentServer(http, settings(overrides), fixtureProvider());
  return new Promise((resolve) => {
    server.start();
    server.server.on("listening", () => resolve({ server, port: server.server.address().port }));
  });
}

/** Raw request helper (fetch forbids overriding Host, so use http.request). */
function request(port, { method = "GET", path = "/", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, headers, setHost: !headers.Host }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data, json: () => JSON.parse(data || "null") }));
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

const auth = { Authorization: `Bearer ${TOKEN}` };

test("agent api", async (t) => {
  const { server, port } = await startServer();
  t.after(() => server.stop());

  await t.test("no token -> 401", async () => {
    const r = await request(port, { path: "/overview" });
    assert.equal(r.status, 401);
  });

  await t.test("wrong token -> 401", async () => {
    const r = await request(port, { path: "/overview", headers: { Authorization: "Bearer nope" } });
    assert.equal(r.status, 401);
  });

  await t.test("Bearer token -> 200", async () => {
    const r = await request(port, { path: "/overview", headers: auth });
    assert.equal(r.status, 200);
    assert.equal(r.json().vault, "TestVault");
  });

  await t.test("x-api-key -> 200", async () => {
    const r = await request(port, { path: "/health", headers: { "x-api-key": TOKEN } });
    assert.equal(r.status, 200);
  });

  await t.test("?token= query rejected by default (deprecated, off) -> 401", async () => {
    const r = await request(port, { path: `/health?token=${TOKEN}` });
    assert.equal(r.status, 401);
  });

  await t.test("responses set Cache-Control: no-store", async () => {
    const r = await request(port, { path: "/health", headers: auth });
    assert.match(r.headers["cache-control"] || "", /no-store/);
  });

  await t.test("Host rejection (DNS rebinding defence) -> 403", async () => {
    const r = await request(port, { path: "/health", headers: { ...auth, Host: "evil.example.com" } });
    assert.equal(r.status, 403);
  });

  await t.test("cross-site Origin rejection -> 403; local Origin allowed", async () => {
    const bad = await request(port, { path: "/health", headers: { ...auth, Origin: "https://evil.example.com" } });
    assert.equal(bad.status, 403);
    const nul = await request(port, { path: "/health", headers: { ...auth, Origin: "null" } });
    assert.equal(nul.status, 403);
    const good = await request(port, { path: "/health", headers: { ...auth, Origin: `http://127.0.0.1:${port}` } });
    assert.equal(good.status, 200);
  });

  await t.test("request-size rejection: > 4 MiB body -> 413 (byte-accurate)", async () => {
    const big = "x".repeat(MAX_BODY_BYTES + 1024);
    const r = await request(port, { method: "POST", path: "/mcp", headers: { ...auth, "Content-Type": "application/json" }, body: big });
    assert.equal(r.status, 413);
  });

  await t.test("REST GET routes respond", async () => {
    for (const p of ["/", "/health", "/overview", "/diagnostics", "/graph", "/notes?q=engine", "/note?title=Engine%20v2", "/lineage?title=Engine%20v2", "/related?title=Engine%20v2", "/at?time=2026-02-01", "/episodes"]) {
      const r = await request(port, { path: p, headers: auth });
      assert.equal(r.status, 200, `route ${p}`);
    }
  });

  await t.test("REST write rejection: POST/PUT/DELETE -> 405 (read-only, §18)", async () => {
    for (const method of ["POST", "PUT", "DELETE"]) {
      const r = await request(port, { method, path: "/notes", headers: auth });
      assert.equal(r.status, 405, method);
    }
  });

  await t.test("lineage matches viewer semantics: v1 superseded, v2 HEAD (§33)", async () => {
    const r = await request(port, { path: "/lineage?title=Engine%20v1", headers: auth });
    const j = r.json();
    assert.equal(j.chainLength, 2);
    const [v1, v2] = j.chain;
    assert.equal(v1.title, "Engine v1");
    assert.equal(v1.superseded, true);
    assert.equal(v1.invalidAt, "2026-03-01T00:00:00.000Z");
    assert.equal(v2.title, "Engine v2");
    assert.equal(v2.head, true);
  });

  await t.test("graph_at_time uses the shared projector (§4.1)", async () => {
    const mid = (await request(port, { path: "/at?time=2026-02-01", headers: auth })).json();
    assert.deepEqual(mid.valid.map((n) => n.title), ["Engine v1"]);
    assert.equal(mid.counts.notYetCreated >= 1, true); // Engine v2 not written yet
    const late = (await request(port, { path: "/at?time=2026-06-01", headers: auth })).json();
    assert.ok(late.valid.some((n) => n.title === "Engine v2"));
    assert.deepEqual(late.superseded.map((n) => n.title), ["Engine v1"]);
  });

  /** Client metadata for a modern request. Every request carries its own; the
   *  transport has no handshake and no session to carry it for us. */
  const meta = (client = "test-client") => ({
    [MCP_META_PROTOCOL_VERSION]: MODERN_MCP_PROTOCOL_VERSION,
    [MCP_META_CLIENT_INFO]: { name: client, version: "1.0.0" },
    [MCP_META_CLIENT_CAPABILITIES]: {},
  });

  /** POST one JSON-RPC message as a conforming modern client: inject `_meta`
   *  into params and mirror the body into the headers the server validates.
   *  `opts.client` sets clientInfo.name; `opts.headers` overrides or deletes a
   *  mirrored header (set a value to null to omit it) so header/body
   *  disagreement can be exercised; `opts.raw` sends the body untouched. */
  const mcp = async (msg, opts = {}) => {
    const { client, headers: overrides = {}, raw = false } = opts;
    const isNotification = msg && typeof msg === "object" && !Array.isArray(msg) && msg.id === undefined;
    let body = msg;
    let mirrored = {};
    if (!raw && !isNotification && msg && typeof msg === "object" && !Array.isArray(msg)) {
      body = { ...msg, params: { ...(msg.params ?? {}), _meta: meta(client) } };
      mirrored = { "MCP-Protocol-Version": MODERN_MCP_PROTOCOL_VERSION, "Mcp-Method": msg.method };
      const nameField = MCP_NAME_SOURCE[msg.method];
      const nameValue = nameField ? body.params[nameField] : undefined;
      if (typeof nameValue === "string") mirrored["Mcp-Name"] = nameValue;
    }
    const headers = {
      ...auth,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...mirrored,
      ...overrides,
    };
    for (const [k, v] of Object.entries(headers)) if (v === null) delete headers[k];
    return request(port, { method: "POST", path: "/mcp", headers, body: JSON.stringify(body) });
  };

  await t.test("server/discover reports identity, capabilities and supported versions", async () => {
    const r = await mcp({ jsonrpc: "2.0", id: 1, method: "server/discover" });
    assert.equal(r.status, 200);
    const result = r.json().result;
    assert.equal(result.resultType, "complete");
    assert.deepEqual(result.supportedVersions, [MODERN_MCP_PROTOCOL_VERSION]);
    assert.equal(result.capabilities.tools.listChanged, false);
    // serverInfo rides in _meta in this revision, and is a self-report.
    assert.equal(result._meta[MCP_META_SERVER_INFO].name, "kosmos-oden");
    assert.match(result.instructions, /read-only/);
  });

  await t.test("modern era is the only one advertised: exactly 2026-07-28", () => {
    assert.deepEqual(SUPPORTED_MCP_PROTOCOL_VERSIONS, ["2026-07-28"]);
    assert.equal(LATEST_MCP_PROTOCOL_VERSION, "2026-07-28");
    assert.equal(MODERN_MCP_PROTOCOL_VERSION, "2026-07-28");
  });

  await t.test("unsupported protocol version -> 400 with -32022 listing supported versions", async () => {
    const r = await mcp(
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: { [MCP_META_PROTOCOL_VERSION]: "2025-11-25" } } },
      { raw: true, headers: { "MCP-Protocol-Version": "2025-11-25", "Mcp-Method": "tools/list" } },
    );
    assert.equal(r.status, 400);
    const err = r.json().error;
    assert.equal(err.code, -32022);
    assert.deepEqual(err.data.supported, ["2026-07-28"]);
    assert.equal(err.data.requested, "2025-11-25");
  });

  await t.test("initialize with modern metadata -> 404 with -32601 naming supported versions", async () => {
    // A legacy client has no fall-forward mechanism, so this error message is
    // the only diagnostic it can surface. The spec asks a modern-only server
    // to name its versions here.
    const r = await mcp({ jsonrpc: "2.0", id: 3, method: "initialize" });
    assert.equal(r.status, 404);
    const err = r.json().error;
    assert.equal(err.code, -32601);
    assert.match(err.message, /2026-07-28/);
    assert.deepEqual(err.data.supported, ["2026-07-28"]);
  });

  await t.test("real legacy initialize preserves header validation and names supported versions", async () => {
    const r = await mcp({ jsonrpc: "2.0", id: "legacy", method: "initialize", params: {
      protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "legacy", version: "1" },
    } }, { raw: true });
    assert.equal(r.status, 400);
    assert.equal(r.json().id, "legacy");
    assert.equal(r.json().error.code, -32020);
    assert.match(r.json().error.message, /MCP-Protocol-Version header is required/);
    assert.match(r.json().error.message, /supported protocol versions: 2026-07-28/);
    assert.equal(r.headers["mcp-session-id"], undefined);
  });

  await t.test("every implemented result includes complete and server identity", async () => {
    for (const method of ["server/discover", "tools/list", "resources/list", "prompts/list", "tools/call"]) {
      const r = await mcp({ jsonrpc: "2.0", id: method, method, params: method === "tools/call" ? { name: "get_policy" } : {} });
      assert.equal(r.status, 200, method);
      assert.equal(r.json().result.resultType, "complete", method);
      assert.equal(r.json().result._meta[MCP_META_SERVER_INFO].name, "kosmos-oden", method);
    }
  });

  // 2026-07-28 wire conformance: cacheScope + ttlMs are REQUIRED on every
  // cacheable result and forbidden on non-cacheable ones. This is a contract
  // against the published revision, not against this implementation -- a
  // spec-strict client (e.g. the Python mcp SDK's generated wire models)
  // rejects a cacheable result missing either field. Guards the class of bug
  // the self-consistency suite cannot see (claude seq 13, jeffrey seq 10).
  await t.test("cacheable results carry required cacheScope + ttlMs at spec defaults", async () => {
    for (const method of ["server/discover", "tools/list", "resources/list", "prompts/list"]) {
      const r = await mcp({ jsonrpc: "2.0", id: method, method, params: {} });
      assert.equal(r.status, 200, method);
      const result = r.json().result;
      assert.equal(result.cacheScope, MCP_CACHE_SCOPE_DEFAULT, `${method} cacheScope`);
      assert.equal(result.ttlMs, MCP_CACHE_TTL_MS_DEFAULT, `${method} ttlMs`);
      assert.deepEqual(MCP_CACHEABLE_RESULT_METHODS.has(method), true, `${method} is cacheable`);
    }
  });

  await t.test("cache directives are private/0 -- a sensitivity-filtered vault is never publicly cacheable", () => {
    assert.equal(MCP_CACHE_SCOPE_DEFAULT, "private");
    assert.equal(MCP_CACHE_TTL_MS_DEFAULT, 0);
  });

  await t.test("non-cacheable results do NOT carry cache directives", async () => {
    for (const [method, params] of [["tools/call", { name: "get_policy" }]]) {
      const r = await mcp({ jsonrpc: "2.0", id: method, method, params });
      assert.equal(r.status, 200, method);
      const result = r.json().result;
      assert.equal(MCP_CACHEABLE_RESULT_METHODS.has(method), false, `${method} is non-cacheable`);
      assert.equal(result.cacheScope, undefined, `${method} must not claim cacheScope`);
      assert.equal(result.ttlMs, undefined, `${method} must not claim ttlMs`);
    }
  });

  await t.test("required request metadata is validated without demanding optional identity", async () => {
    const headers = { "MCP-Protocol-Version": MODERN_MCP_PROTOCOL_VERSION, "Mcp-Method": "tools/list" };
    for (const capabilities of [undefined, null, [], "invalid"]) {
      const r = await mcp({ jsonrpc: "2.0", id: "caps", method: "tools/list", params: { _meta: {
        [MCP_META_PROTOCOL_VERSION]: MODERN_MCP_PROTOCOL_VERSION, [MCP_META_CLIENT_CAPABILITIES]: capabilities,
      } } }, { raw: true, headers });
      assert.equal(r.status, 400);
      assert.equal(r.json().error.code, -32602);
    }
    const noVersion = await mcp({ jsonrpc: "2.0", id: "version", method: "tools/list", params: { _meta: {
      [MCP_META_CLIENT_CAPABILITIES]: {},
    } } }, { raw: true, headers });
    assert.equal(noVersion.status, 400);
    assert.equal(noVersion.json().error.code, -32602);
    const anonymous = await mcp({ jsonrpc: "2.0", id: "anonymous", method: "tools/list", params: { _meta: {
      [MCP_META_PROTOCOL_VERSION]: MODERN_MCP_PROTOCOL_VERSION, [MCP_META_CLIENT_CAPABILITIES]: {},
    } } }, { raw: true, headers });
    assert.equal(anonymous.status, 200);
    assert.equal(anonymous.json().result.resultType, "complete");
  });

  await t.test("invalid envelopes are rejected before metadata or identity processing", async () => {
    for (const msg of [null, 5, {}, { jsonrpc: "1.0", id: 1, method: "tools/list" },
      ...[null, true, {}, 1.5].map((id) => ({ jsonrpc: "2.0", id, method: "tools/list" })),
      { jsonrpc: "2.0", id: 1, result: {} }]) {
      const r = await mcp(msg, { raw: true });
      assert.equal(r.status, 400);
      assert.equal(r.json().error.code, -32600);
    }
  });

  await t.test("HTTP discovery truthfully advertises no protocol sessions", async () => {
    const r = await request(port, { headers: auth });
    assert.equal(r.json().mcp.sessions, false);
  });

  await t.test("a notification (no id) -> 202 accepted silently, no metadata demanded", async () => {
    // This revision defines no client-to-server notification over Streamable
    // HTTP and leaves notification header requirements undefined, so one is
    // accepted and ignored without _meta or mirrored headers.
    const r = await mcp({ jsonrpc: "2.0", method: "notifications/something" });
    assert.equal(r.status, 202);
    assert.equal(r.body, "");
  });

  await t.test("MCP tools/list exposes legacy and GKX 2.3 read-only tools", async () => {
    const r = await mcp({ jsonrpc: "2.0", id: 4, method: "tools/list" });
    const names = r.json().result.tools.map((x) => x.name);
    assert.deepEqual(names.sort(), [
      "assess_note", "assess_vault", "export_graphiti_episodes", "get_assessment",
      "get_diagnostics", "get_effective_labels", "get_evidence", "get_gkx_note",
      "get_lineage", "get_note", "get_policy", "get_related", "get_relationships",
      "graph_at_time", "graphiti_ingestion_status", "search_notes", "validate_note", "vault_overview",
    ]);
    assert.ok(r.json().result.tools.every((x) => x.annotations.readOnlyHint === true));
  });

  await t.test("GKX 2.3 assessment has REST/MCP parity and preserves read-only semantics", async () => {
    const m = await mcp({ jsonrpc: "2.0", id: 41, method: "tools/call", params: { name: "get_assessment", arguments: { title: "Engine v2" } } });
    const viaMcp = m.json().result.structuredContent;
    const r = await request(port, { path: "/gkx/assessment?title=Engine%20v2", headers: auth });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json(), viaMcp);
    assert.equal(viaMcp.profile, "gkx-2.3-validating-projection");
    assert.equal(viaMcp.interpretation, "documentation-and-support-quality-not-truth");
    assert.equal(viaMcp.policy.id, "policy:gkx23-default-v1");
  });

  await t.test("GKX policy endpoint is bundled, deterministic, and remote updates are off", async () => {
    const r = await request(port, { path: "/gkx/policy", headers: auth });
    assert.equal(r.status, 200);
    assert.equal(r.json().remoteUpdatesEnabled, false);
    assert.match(r.json().policy.hash, /^sha256:[0-9a-f]{64}$/);
  });

  await t.test("MCP tools/call get_lineage returns the canonical chain", async () => {
    const r = await mcp({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_lineage", arguments: { title: "Engine v2" } } });
    const payload = JSON.parse(r.json().result.content[0].text);
    assert.equal(payload.chainLength, 2);
    assert.equal(payload.chain[1].head, true);
    assert.equal(r.json().result.structuredContent.chainLength, 2);
  });

  await t.test("Graphiti readiness never equates queue acceptance with searchability", async () => {
    const r = await mcp({ jsonrpc: "2.0", id: 51, method: "tools/call", params: { name: "graphiti_ingestion_status", arguments: {} } });
    const payload = JSON.parse(r.json().result.content[0].text);
    assert.equal(payload.state, "export-ready");
    assert.equal(payload.searchable, false);
    assert.equal(payload.upstreamCheckRequired, true);
  });

  await t.test("MCP unknown method -> -32601", async () => {
    const r = await mcp({ jsonrpc: "2.0", id: 6, method: "does/not/exist" });
    assert.equal(r.json().error.code, -32601);
  });

  await t.test("no session is minted or echoed, and session headers are ignored", async () => {
    // The revision removed protocol sessions. A client that still sends
    // Mcp-Session-Id or Last-Event-ID is served normally and told nothing
    // about a session, rather than being rejected.
    const r = await mcp(
      { jsonrpc: "2.0", id: 7, method: "tools/list" },
      { headers: { "Mcp-Session-Id": "left-over-from-a-legacy-client", "Last-Event-ID": "42" } },
    );
    assert.equal(r.status, 200);
    assert.equal(r.json().result.resultType, "complete");
    assert.equal(r.headers["mcp-session-id"], undefined);
  });

  await t.test("traversal identity is stable per client name and stays server-side", async () => {
    const seen = [];
    server.onTraversal = (paths, tool, agent, agentId) => { seen.push({ paths, tool, agent, agentId }); };
    let last;
    for (const [id, name] of [[9, "get_lineage"], [91, "get_note"]]) {
      last = await mcp(
        { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: { title: "Engine v2" } } },
        { client: "Hermes Research Agent" },
      );
      assert.equal(last.status, 200);
    }
    server.onTraversal = undefined;
    assert.equal(seen.length, 2);
    assert.ok(seen.every(({ agent }) => agent === "Hermes Research Agent"), "clientInfo.name identifies the caller");
    assert.match(seen[0].agentId, /^agent-[A-Za-z0-9_-]{10,}$/);
    assert.equal(seen[1].agentId, seen[0].agentId, "same name keeps one trail identity across requests");
    assert.equal(last.body.includes(seen[0].agentId), false, "visual identity must remain server-side");
  });

  await t.test("tool agent_name overrides generic client labels and validates input", async () => {
    const seen = [];
    server.onTraversal = (paths, tool, agent, agentId) => seen.push({ paths, tool, agent, agentId });
    for (const name of ["Codex Game Research", "Hermes Physics", "Codex Game Research"]) {
      const result = await mcp({ jsonrpc: "2.0", id: 86, method: "tools/call",
        params: { name: "get_note", arguments: { title: "Engine v2", agent_name: name } } }, { client: "mcp" });
      assert.equal(result.status, 200);
      assert.equal(result.json().result.isError, false);
    }
    assert.deepEqual(seen.map(s => s.agent), ["Codex Game Research", "Hermes Physics", "Codex Game Research"]);
    assert.equal(seen[0].agentId, seen[2].agentId);
    assert.notEqual(seen[0].agentId, seen[1].agentId);
    for (const agent_name of [42, "", "x".repeat(81)]) {
      const result = await mcp({ jsonrpc: "2.0", id: 87, method: "tools/call",
        params: { name: "get_note", arguments: { title: "Engine v2", agent_name } } });
      assert.equal(result.json().error.code, -32602);
    }
    server.onTraversal = undefined;
  });

  await t.test("explicit HTTP ship name stays stable across tool activity without aliasing other callers", async () => {
    const seen = [];
    server.onTraversal = (paths, tool, agent, agentId) => seen.push({ agent, agentId });
    const headers = { "X-Kosmos-Agent-Name": "JEFFREY" };
    for (const client of ["mcp", "jeffrey"]) {
      const r = await mcp({ jsonrpc: "2.0", id: 881, method: "tools/call",
        params: { name: "get_note", arguments: { title: "Engine v2", agent_name: client } } }, { client, headers });
      assert.equal(r.json().result.isError, false);
    }
    await mcp({ jsonrpc: "2.0", id: 882, method: "tools/call", params: { name: "vault_overview", arguments: {} } }, { client: "mcp", headers });
    assert.equal(seen.length, 3);
    assert.ok(seen.every(e => e.agent === "JEFFREY" && e.agentId === seen[0].agentId));
    await mcp({ jsonrpc: "2.0", id: 883, method: "tools/call", params: { name: "vault_overview", arguments: {} } }, { client: "mcp" });
    assert.equal(seen[3].agent, "mcp");
    assert.notEqual(seen[3].agentId, seen[0].agentId);
    const invalid = await mcp({ jsonrpc: "2.0", id: 884, method: "server/discover" }, { headers: { "X-Kosmos-Agent-Name": "x".repeat(81) } });
    assert.equal(invalid.json().error.code, -32602);
    server.onTraversal = undefined;
  });

  await t.test("distinct client names get distinct traversal identities", async () => {
    // Consequence of a stateless transport, recorded deliberately: identity is
    // whatever the caller self-reports in clientInfo.name, so two callers using
    // the same name are one identity. Legacy sessions could separate them
    // because the server minted the key; nothing in this revision can.
    const seen = [];
    server.onTraversal = (paths, tool, agent, agentId) => { seen.push({ agent, agentId }); };
    for (const [id, client] of [[83, "Hermes"], [84, "Carson"], [85, "Hermes"]]) {
      const called = await mcp(
        { jsonrpc: "2.0", id, method: "tools/call", params: { name: "get_note", arguments: { title: "Engine v2" } } },
        { client },
      );
      assert.equal(called.status, 200);
    }
    server.onTraversal = undefined;
    assert.deepEqual(seen.map(({ agent }) => agent), ["Hermes", "Carson", "Hermes"]);
    assert.notEqual(seen[0].agentId, seen[1].agentId);
    assert.equal(seen[2].agentId, seen[0].agentId);
  });

  await t.test("MCP rejects JSON-RPC 1.0, batches, and unknown tools", async () => {
    const old = await mcp({ jsonrpc: "1.0", id: 10, method: "tools/list" });
    assert.equal(old.json().error.code, -32600);
    const unknown = await mcp({ jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "not_a_tool", arguments: {} } });
    assert.equal(unknown.json().error.code, -32602);
    const batch = await request(port, {
      method: "POST", path: "/mcp",
      headers: { ...auth, "Content-Type": "application/json", "MCP-Protocol-Version": MODERN_MCP_PROTOCOL_VERSION, "Mcp-Method": "tools/list" },
      body: JSON.stringify([{ jsonrpc: "2.0", id: 12, method: "tools/list" }]),
    });
    assert.equal(batch.status, 400);
    assert.equal(batch.json().error.code, -32600);
  });

  await t.test("mirrored headers are validated against the body: -32020 HeaderMismatch", async () => {
    const cases = [
      ["MCP-Protocol-Version missing", { "MCP-Protocol-Version": null }, /MCP-Protocol-Version header is required/],
      ["Mcp-Method missing", { "Mcp-Method": null }, /Mcp-Method header is required/],
      ["Mcp-Method disagrees with body", { "Mcp-Method": "prompts/list" }, /does not match body value 'tools\/list'/],
      ["MCP-Protocol-Version disagrees with _meta", { "MCP-Protocol-Version": "2026-01-01" }, /does not match body value/],
    ];
    for (const [label, headers, expected] of cases) {
      const r = await mcp({ jsonrpc: "2.0", id: 13, method: "tools/list" }, { headers });
      assert.equal(r.status, 400, label);
      assert.equal(r.json().error.code, -32020, label);
      assert.match(r.json().error.message, expected, label);
    }
  });

  await t.test("Mcp-Name is required for tools/call and must match the body", async () => {
    const good = await mcp({ jsonrpc: "2.0", id: 14, method: "tools/call", params: { name: "get_policy", arguments: {} } });
    assert.equal(good.status, 200);

    const missing = await mcp(
      { jsonrpc: "2.0", id: 15, method: "tools/call", params: { name: "get_policy", arguments: {} } },
      { headers: { "Mcp-Name": null } },
    );
    assert.equal(missing.status, 400);
    assert.equal(missing.json().error.code, -32020);
    assert.match(missing.json().error.message, /Mcp-Name header is required for tools\/call/);

    const wrong = await mcp(
      { jsonrpc: "2.0", id: 16, method: "tools/call", params: { name: "get_policy", arguments: {} } },
      { headers: { "Mcp-Name": "vault_overview" } },
    );
    assert.equal(wrong.status, 400);
    assert.equal(wrong.json().error.code, -32020);
    assert.match(wrong.json().error.message, /'vault_overview' does not match body value 'get_policy'/);

    // A method that does not mirror a name must not carry the header.
    const stray = await mcp({ jsonrpc: "2.0", id: 17, method: "tools/list" }, { headers: { "Mcp-Name": "tools/list" } });
    assert.equal(stray.status, 400);
    assert.equal(stray.json().error.code, -32020);
  });

  await t.test("Mcp-Name accepts the Base64 sentinel and compares the decoded value", async () => {
    // Tool names here are header-safe, so exercise the sentinel path with an
    // encoded form of a real name plus a mismatching encoded value.
    const encode = (v) => `=?base64?${Buffer.from(v, "utf8").toString("base64")}?=`;
    const ok = await mcp(
      { jsonrpc: "2.0", id: 18, method: "tools/call", params: { name: "get_policy", arguments: {} } },
      { headers: { "Mcp-Name": encode("get_policy") } },
    );
    assert.equal(ok.status, 200);

    const bad = await mcp(
      { jsonrpc: "2.0", id: 19, method: "tools/call", params: { name: "get_policy", arguments: {} } },
      { headers: { "Mcp-Name": encode("vault_overview") } },
    );
    assert.equal(bad.status, 400);
    assert.equal(bad.json().error.code, -32020);

    const malformed = await mcp(
      { jsonrpc: "2.0", id: 20, method: "tools/call", params: { name: "get_policy", arguments: {} } },
      { headers: { "Mcp-Name": "=?base64?not!valid!base64?=" } },
    );
    assert.equal(malformed.status, 400);
    assert.equal(malformed.json().error.code, -32020);
  });

  await t.test("GET and DELETE on the MCP endpoint -> 405, the removed mechanisms", async () => {
    for (const method of ["GET", "DELETE"]) {
      const r = await request(port, { method, path: "/mcp", headers: auth });
      assert.equal(r.status, 405, method);
      assert.equal(r.headers.allow, "POST", method);
    }
  });

  await t.test("an unimplemented method -> 404 carrying the JSON-RPC error", async () => {
    // 404 with a modern JSON-RPC error body is what lets a dual-era client tell
    // a modern server from a legacy one that simply does not host this path.
    const r = await mcp({ jsonrpc: "2.0", id: 21, method: "subscriptions/listen" });
    assert.equal(r.status, 404);
    assert.equal(r.json().error.code, -32601);
    const inherited = await mcp({ jsonrpc: "2.0", id: 22, method: "constructor" });
    assert.equal(inherited.status, 404);
    assert.equal(inherited.json().error.code, -32601);
  });
});

test("Mitigation 4: a single agent's concurrent requests are capped for fairness", async () => {
  let release; const gate = new Promise((r) => { release = r; });
  const provider = {
    getGraph: async () => { await gate; return buildProductGraph(FILES, ["Ideas"]); },
    getNoteContent: async () => "", vaultName: () => "V", lanAddresses: () => [],
  };
  const server = new KosmosAgentServer(http, settings(), provider);
  await new Promise((resolve) => { server.start(); server.server.on("listening", resolve); });
  const port = server.server.address().port;
  const N = MAX_CONCURRENT_PER_AGENT;
  const ua = { ...auth, "User-Agent": "BulkAgent/1" };
  const reqs = [];
  for (let i = 0; i < N + 2; i++) reqs.push(request(port, { path: "/overview", headers: ua }));
  // let the first N pile up in-flight (blocked on the gate), then release them
  setTimeout(() => release(), 60);
  const results = await Promise.all(reqs);
  const throttled = results.filter((r) => r.status === 429);
  assert.equal(throttled.length, 2, "the 2 requests past the per-agent cap are throttled");
  assert.match(throttled[0].json().hint, /concurrent/);
  assert.equal(results.filter((r) => r.status === 200).length, N);
  server.stop();
});

test("modern clients sharing User-Agent have independent bounded execution slots", { timeout: 10000 }, async (t) => {
  let release, reached;
  const gate = new Promise(r => { release = r; });
  let arrivals = 0;
  let target = MAX_CONCURRENT_PER_AGENT;
  let ready = new Promise(r => { reached = r; });
  const provider = { ...fixtureProvider(), getGraph: async () => {
    if (++arrivals === target) reached();
    await gate;
    return buildProductGraph(FILES, ["Ideas"]);
  } };
  const server = new KosmosAgentServer(http, settings(), provider);
  await new Promise(r => { server.start(); server.server.on("listening", r); });
  const port = server.server.address().port;
  t.after(() => { release(); server.stop(); });
  let id = 0;
  const call = (client, method = "tools/call") => request(port, {
    method: "POST", path: "/mcp", headers: { ...auth, "User-Agent": "shared-sdk/1", "Content-Type": "application/json",
      "MCP-Protocol-Version": MODERN_MCP_PROTOCOL_VERSION, "Mcp-Method": method, ...(method === "tools/call" ? { "Mcp-Name": "vault_overview" } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: {
      ...(method === "tools/call" ? { name: "vault_overview", arguments: {} } : {}),
      _meta: { [MCP_META_PROTOCOL_VERSION]: MODERN_MCP_PROTOCOL_VERSION, [MCP_META_CLIENT_CAPABILITIES]: {},
        ...(client ? { [MCP_META_CLIENT_INFO]: { name: client, version: "1" } } : {}) },
    } }),
  });
  const bulk = Array.from({ length: MAX_CONCURRENT_PER_AGENT }, () => call("bulk"));
  await ready;
  assert.equal((await call("bulk", "tools/list")).status, 429, "same client is throttled");
  assert.equal((await call("interactive", "tools/list")).status, 200, "another name sharing the SDK remains responsive");
  assert.equal((await call(undefined, "tools/list")).status, 200, "anonymous fallback is a separate bucket");
  target = MAX_CONCURRENT_REQUESTS;
  ready = new Promise(r => { reached = r; });
  const other = Array.from({ length: MAX_CONCURRENT_REQUESTS - MAX_CONCURRENT_PER_AGENT }, () => call("second"));
  await ready;
  assert.equal((await call("rotated-name", "tools/list")).status, 429, "name rotation cannot exceed global cap, even on loopback");
  release();
  assert.ok((await Promise.all([...bulk, ...other])).every(r => r.status === 200));
  assert.equal(server.inFlight, 0);
  assert.equal(server.perAgentInFlight.size, 0);
  assert.equal((await call("bulk", "tools/list")).status, 200, "slots released after completion");
});

test("invalid modern metadata and authentication do not claim execution slots", async () => {
  const { server, port } = await startServer();
  try {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    assert.equal((await request(port, { method: "POST", path: "/mcp", headers: auth, body })).status, 400);
    assert.equal((await request(port, { method: "POST", path: "/mcp", body })).status, 401);
    assert.equal(server.inFlight, 0);
    assert.equal(server.perAgentInFlight.size, 0);
  } finally { server.stop(); }
});

test("rate-limit map does not leak: stale client keys are swept, fresh ones kept", () => {
  const server = new KosmosAgentServer(http, settings({ agentBindMode: "lan" }), fixtureProvider());
  const now = performance.now();
  // Seed one client whose only hit is well outside the window (stale) and one that is current.
  server.hits.set("192.168.1.50", [now - 60_000]);
  server.hits.set("192.168.1.51", [now - 100]);
  assert.equal(server.hits.size, 2);
  // A request from a brand-new remote triggers the periodic sweep of fully-stale keys.
  const res = server.rateLimited({ socket: { remoteAddress: "192.168.1.99" } });
  assert.equal(res.limited, false);
  assert.equal(server.hits.has("192.168.1.50"), false, "stale key pruned");
  assert.equal(server.hits.has("192.168.1.51"), true, "recently-active key retained");
  assert.equal(server.hits.has("192.168.1.99"), true, "new client recorded");
});

test("auth disabled + empty token: requireToken(on)+empty token fails closed (§16)", async () => {
  const server = new KosmosAgentServer(http, {
    agentEnabled: true, agentPort: 0, agentToken: "", agentRequireToken: true, agentBindMode: "localhost",
  }, fixtureProvider());
  await new Promise((resolve) => { server.start(); server.server.on("listening", resolve); });
  const port = server.server.address().port;
  const r = await request(port, { path: "/health" });
  assert.equal(r.status, 401);
  server.stop();
});

test("makeToken: 32 bytes of secure randomness, base64url, no fallback (§16)", () => {
  const t1 = makeToken();
  const t2 = makeToken();
  assert.notEqual(t1, t2);
  assert.match(t1, /^[A-Za-z0-9_-]{43}$/); // 32 bytes -> 43 base64url chars, no padding
});

test("query-token auth works ONLY when explicitly enabled (Doc1 §3.6)", async () => {
  const { server, port } = await startServer({ agentAllowQueryToken: true });
  const r = await request(port, { path: `/health?token=${TOKEN}` });
  assert.equal(r.status, 200);
  server.stop();
});

test("LAN mode refuses to start without a token, fails closed (Doc1 §3.8)", () => {
  const noAuth = new KosmosAgentServer(http, settings({ agentBindMode: "lan", agentRequireToken: false }), fixtureProvider());
  noAuth.start();
  assert.match(noAuth.status, /LAN mode requires an auth token/);
  assert.equal(noAuth.server, null);
  noAuth.stop();

  const emptyToken = new KosmosAgentServer(http, settings({ agentBindMode: "lan", agentToken: "" }), fixtureProvider());
  emptyToken.start();
  assert.match(emptyToken.status, /LAN mode requires an auth token/);
  emptyToken.stop();
});

test("query-token is rejected in LAN mode even when allowed (Doc1 §3.6)", async () => {
  // Bind to loopback so the test can connect, but exercise the LAN gate directly.
  const server = new KosmosAgentServer(http, settings({ agentAllowQueryToken: true, agentBindMode: "lan" }), {
    getGraph: async () => buildProductGraph(FILES, ["Ideas"]), getNoteContent: async () => "", vaultName: () => "V", lanAddresses: () => [],
  });
  // authorized() must not accept a query token in LAN mode regardless of the flag.
  const u = new URL(`http://127.0.0.1/health?token=${TOKEN}`);
  assert.equal(server.authorized({ headers: {} }, u), false);
  const u2 = new URL("http://127.0.0.1/health");
  assert.equal(server.authorized({ headers: { authorization: `Bearer ${TOKEN}` } }, u2), true);
});

test("output cap: a huge note body is truncated (Doc2 §5.6)", async () => {
  const big = "x".repeat(MAX_NOTE_CONTENT_CHARS + 5000);
  const provider = {
    getGraph: async () => buildProductGraph([{ relativePath: "Big.md", content: "---\ntype: note\nsensitivity: internal\ntimestamp: 2026-01-01T00:00:00Z\n---\n# Big\n" + big }], []),
    getNoteContent: async () => big,
    vaultName: () => "V", lanAddresses: () => [],
  };
  const server = new KosmosAgentServer(http, settings(), provider);
  const note = await server.qNote({ title: "Big" });
  assert.ok(note.content.length <= MAX_NOTE_CONTENT_CHARS + 100);
  assert.match(note.content, /truncated/);
});

test("GKX sensitivity ceiling filters search, note content, graph, and Graphiti pages", async () => {
  const files = [
    { relativePath: "Public.md", content: "---\ntype: semantic\nsensitivity: public\ntimestamp: 2026-01-01T00:00:00Z\n---\npublic" },
    { relativePath: "Internal.md", content: "---\ntype: semantic\nsensitivity: internal\ntimestamp: 2026-01-02T00:00:00Z\n---\ninternal" },
    { relativePath: "Secret.md", content: "---\ntype: semantic\nsensitivity: confidential\ntimestamp: 2026-01-03T00:00:00Z\nsupersedes:\n  - Public\n---\nsecret" },
    { relativePath: "Patient.md", content: "---\ntype: semantic\nsensitivity: phi\ntimestamp: 2026-01-04T00:00:00Z\n---\npatient" },
  ];
  const graph = buildProductGraph(files, []);
  const provider = {
    getGraph: async () => graph,
    getNoteContent: async (p) => files.find((f) => f.relativePath === p)?.content || null,
    vaultName: () => "Sensitive",
    vaultIdentity: () => "sensitive-vault",
    lanAddresses: () => [],
  };
  const server = new KosmosAgentServer(http, settings({ agentSensitivityCeiling: "internal" }), provider);
  assert.deepEqual((await server.qSearch("")).results.map((n) => n.title), ["Internal", "Public"]);
  assert.equal((await server.qNote({ title: "Secret" })).error, "note not found");
  assert.equal((await server.qNote({ title: "Public" })).superseded, false, "hidden successor must not leak through temporal state");
  assert.equal((await server.qGraph()).nodes.length, 2);
  assert.equal((await server.qEpisodePage()).total, 2);
  const publicEpisode = (await server.qEpisodePage()).episodes.find((e) => e.name === "Public");
  assert.deepEqual(JSON.parse(publicEpisode.episode_body).lineage.resolved_supersedes, []);
  server.settings.agentSensitivityCeiling = "confidential";
  assert.equal((await server.qNote({ title: "Secret" })).title, "Secret");
  assert.equal((await server.qNote({ title: "Patient" })).error, "note not found");
});

test("Default sensitivity threads through the projection for unlabeled notes", async () => {
  // A GKX note that declares no sensitivity field fails closed by default.
  // always resolved to "secret" regardless of the setting (the case 0.6.7's
  // Compatibility note said the dropdown could NOT restore, because the setting
  // could not reach the projection). GKOS-Engine v2.1.1 threads
  // Gkx23ProjectionOptions through buildGraph/GkxIndex so the configured default governs it.
  // In production a single setting (settings.defaultSensitivity) drives BOTH the
  // projection option and the gate fallback, so the test mirrors that.
  const files = [{ relativePath: "Unlabeled.md", content: '---\ngkx_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-7d81cfaec9aa"\ntitle: "Unlabeled"\ntype: "semantic"\ncreated_at: "2026-07-01T00:00:00Z"\nupdated_at: "2026-07-02T00:00:00Z"\nepistemic_state: "fact"\nauthorship_origin: "authored"\n---\nNo declared sensitivity.' }];

  const providerFor = (graph) => ({
    getGraph: async () => graph,
    getNoteContent: async (p) => files.find((f) => f.relativePath === p)?.content || null,
    vaultName: () => "Wiring",
    vaultIdentity: () => "wiring-vault",
    lanAddresses: () => [],
  });

  // Fail-closed default (options omitted, setting at secret): the note projects
  // to "secret" and is filtered out at the internal ceiling — as before v0.6.8.
  const closed = new KosmosAgentServer(http, settings({ agentSensitivityCeiling: "internal", defaultSensitivity: "secret" }), providerFor(buildGraph(files, [])));
  assert.equal((await closed.qNote({ title: "Unlabeled" })).error, "note not found");
  assert.deepEqual((await closed.qSearch("")).results.map((n) => n.title), []);

  // Setting threaded through (defaultSensitivity: internal): the SAME note now
  // projects to internal, clears the internal ceiling, and is readable.
  const wired = new KosmosAgentServer(http, settings({ agentSensitivityCeiling: "internal", defaultSensitivity: "internal" }), providerFor(buildGraph(files, [], undefined, { defaultSensitivity: "internal" })));
  assert.equal((await wired.qNote({ title: "Unlabeled" })).title, "Unlabeled");
  assert.deepEqual((await wired.qSearch("")).results.map((n) => n.title), ["Unlabeled"]);

  // Raise-only: the configured default never lowers a note that declares higher.
  const declared = [{ relativePath: "Secret.md", content: "---\ntype: semantic\nsensitivity: confidential\ntimestamp: 2026-01-01T00:00:00Z\n---\nbody" }];
  const raised = new KosmosAgentServer(http, settings({ agentSensitivityCeiling: "internal", defaultSensitivity: "internal" }), {
    getGraph: async () => buildGraph(declared, [], undefined, { defaultSensitivity: "internal" }),
    getNoteContent: async () => "body",
    vaultName: () => "Wiring", vaultIdentity: () => "wiring-vault", lanAddresses: () => [],
  });
  assert.equal((await raised.qNote({ title: "Secret" })).error, "note not found");
});

test("Host validation: loopback forms accepted, foreign/trailing-dot rejected", async () => {
  const s = new KosmosAgentServer(http, settings(), fixtureProvider());
  assert.equal(s.hostAllowed("127.0.0.1:4816"), true);
  assert.equal(s.hostAllowed("localhost"), true);
  assert.equal(s.hostAllowed("[::1]:4816"), true);
  assert.equal(s.hostAllowed("LOCALHOST:4816"), true);
  assert.equal(s.hostAllowed("evil.example.com"), false);
  assert.equal(s.hostAllowed("localhost."), false); // trailing dot is not in the allow-set
  assert.equal(s.hostAllowed(undefined), false);
});

test("Origin validation: absent allowed, null and cross-site rejected", () => {
  const s = new KosmosAgentServer(http, settings(), fixtureProvider());
  assert.equal(s.originAllowed(undefined), true);   // non-browser client
  assert.equal(s.originAllowed(""), true);
  assert.equal(s.originAllowed("null"), false);
  assert.equal(s.originAllowed("http://127.0.0.1:4816"), true);
  assert.equal(s.originAllowed("https://evil.example.com"), false);
});

test("onTraversal: per-note tools report touched paths (post-hoc, via callTool) for the live agent trail", async () => {
  const server = new KosmosAgentServer(http, settings(), fixtureProvider());
  const seen = [];
  server.onTraversal = (paths, tool) => seen.push({ tool, paths });

  await server.callTool("get_note", { title: "Engine v2" });
  await server.callTool("get_lineage", { title: "Engine v1" });
  await server.callTool("get_related", { title: "Engine v2" });
  await server.callTool("search_notes", { query: "engine" });
  await server.callTool("graph_at_time", { time: "2026-06-01" });

  const byTool = Object.fromEntries(seen.map((s) => [s.tool, s.paths]));
  assert.deepEqual(byTool.get_note, ["Ideas/Engine v2.md"]);
  assert.deepEqual(new Set(byTool.get_lineage), new Set(["Ideas/Engine v1.md", "Ideas/Engine v2.md"]));
  assert.ok(byTool.get_related.includes("Ideas/Engine v2.md"));
  assert.ok(byTool.search_notes.length >= 1);
  assert.ok(byTool.graph_at_time.length >= 1, "graph_at_time samples valid notes for the trail");
});

test("onTraversal: paths are CAPPED per tool so broad results never flood the halo budget", async () => {
  // 30 interlinked notes -> uncapped search/lineage results would exceed the caps.
  const files = [];
  for (let i = 0; i < 30; i++) {
    const sup = i > 0 ? `supersedes:\n  - Note ${i - 1}\n` : "";
    files.push({ relativePath: `Note ${i}.md`, content: `---\ntype: idea\ntimestamp: 2026-01-${String((i % 27) + 1).padStart(2, "0")}T00:00:00Z\nsensitivity: internal\n${sup}---\nnote body ${i}` });
  }
  const graph = buildProductGraph(files, []);
  const provider = { getGraph: async () => graph, getNoteContent: async () => "", vaultName: () => "V", lanAddresses: () => [] };
  const server = new KosmosAgentServer(http, settings(), provider);
  const seen = [];
  server.onTraversal = (paths, tool) => seen.push({ tool, paths });

  await server.callTool("search_notes", { query: "note", limit: 50 });
  await server.callTool("get_lineage", { title: "Note 29" });
  await server.callTool("graph_at_time", { time: "2026-06-01", limit: 50 });

  const byTool = Object.fromEntries(seen.map((s) => [s.tool, s.paths]));
  assert.ok(byTool.search_notes.length <= 8, `search cap: ${byTool.search_notes.length}`);
  assert.ok(byTool.get_lineage.length <= 12, `lineage cap: ${byTool.get_lineage.length}`);
  assert.ok(byTool.graph_at_time.length <= 6, `at-time cap: ${byTool.graph_at_time.length}`);
});

test("vault_overview separates Engine library, service and contract generation (R3)", async () => {
  const server = new KosmosAgentServer(http, settings(), fixtureProvider());
  const overview = await server.qOverview();

  // Library version comes from the bundled package and is authoritative here.
  assert.match(overview.engine.library.version, /^\d+\.\d+\.\d+/);
  assert.equal(overview.engine.library.source, "bundled-package");

  // No Engine service is configured in this build. It must say so rather than
  // borrow the library's number — the defect that had agents reporting a stale
  // engine version as fact.
  assert.equal(overview.engine.service.status, "not_configured");
  assert.equal(overview.engine.service.version, null);
  assert.equal(overview.engine.service.selfReported, false);
  const serviceValues = Object.values(overview.engine.service)
    .flatMap((v) => (Array.isArray(v) ? v : [v]));
  assert.ok(
    !serviceValues.includes(overview.engine.library.version),
    "library version leaked into the service block",
  );

  // Deployment coordinates stay out of the general overview (R3).
  assert.ok(!JSON.stringify(overview.engine.service).includes("http"));

  // The contract generation is its own axis and must not be rewritten to match
  // whichever library happens to be pinned.
  assert.equal(overview.engine.profile.engineContractGeneration, "GKOS-Engine 2.1");

  // Capabilities are reported honestly: no body search until a bridge exists.
  assert.deepEqual(overview.retrieval.searchModes, ["metadata"]);
  assert.equal(overview.retrieval.bodyCoverage, "none");
  assert.deepEqual(overview.retrieval.timeAxes, ["valid_at"]);
  assert.equal(overview.retrieval.limits.maxSearchResults, 200);
  assert.equal(overview.retrieval.limits.maxNoteCharacters, 200000);
});

test("onTraversal: whole-vault queries (overview/episodes/diagnostics) do NOT report a trail", async () => {
  const server = new KosmosAgentServer(http, settings(), fixtureProvider());
  let fired = false;
  server.onTraversal = () => { fired = true; };
  await server.callTool("vault_overview", {});
  await server.callTool("export_graphiti_episodes", {});
  await server.qDiagnostics();
  assert.equal(fired, false);
});

test("onTraversal: REST routes emit the same events as MCP tools without inventing stable IDs", async () => {
  const server = new KosmosAgentServer(http, settings(), fixtureProvider());
  const seen = [];
  server.onTraversal = (paths, tool, agent, agentId) => seen.push({ tool, paths, agent, agentId });
  await new Promise((resolve) => { server.start(); server.server.on("listening", resolve); });
  const port = server.server.address().port;
  await request(port, { path: "/note?title=Engine%20v2", headers: auth });
  await request(port, { path: "/at?time=2026-06-01", headers: auth });
  server.stop();
  assert.ok(seen.some((s) => s.tool === "get_note" && s.paths.includes("Ideas/Engine v2.md")));
  assert.ok(seen.some((s) => s.tool === "graph_at_time"));
  assert.ok(seen.every((s) => s.agentId === undefined));
});

test("settings migration: v1 (no schema) turns query tokens OFF (Doc1 §3.7)", () => {
  const migrated = migrateAgentSettings({ agentEnabled: true, agentPort: 5000, agentToken: "keepme" });
  assert.equal(migrated.schemaVersion, AGENT_SETTINGS_SCHEMA);
  assert.equal(migrated.agentAllowQueryToken, false); // security default on upgrade
  assert.equal(migrated.agentSensitivityCeiling, "internal");
  assert.equal(migrated.agentToken, "keepme");        // existing token preserved
  assert.equal(migrated.agentPort, 5000);
  assert.equal(migrated.gkxEnrichmentLanCeiling, "internal");
  assert.equal(migrated.gkxDeveloperExclusions, false); // no silent file omission on upgrade
  assert.equal(migrated.noteTimestampsEnabled, true);
  assert.equal(migrated.graphitiCombinedExtraction, false);
  assert.deepEqual(migrated.gkxExcludePatterns, []);
  const lan = migrateAgentSettings({ gkxEnrichmentProvider: "lan", gkxEnrichmentLanCeiling: "confidential", gkxExcludePatterns: ["**/AGENTS.md"] });
  assert.equal(lan.gkxEnrichmentProvider, "lan");
  assert.equal(lan.gkxEnrichmentLanCeiling, "confidential");
  assert.deepEqual(lan.gkxExcludePatterns, ["**/AGENTS.md"]);
  // defaults fill in for a null load
  const fresh = migrateAgentSettings(null);
  assert.equal(fresh.agentEnabled, DEFAULT_AGENT_SETTINGS.agentEnabled);
});

test("duplicate readable UIDs require an exact path across note queries", async () => {
  const graph = buildProductGraph([
    { relativePath: "A.md", content: "---\nuid: shared-id\ntype: semantic\nsensitivity: internal\n---\nA" },
    { relativePath: "B.md", content: "---\nuid: shared-id\ntype: semantic\nsensitivity: internal\n---\nB" },
  ], []);
  const server = new KosmosAgentServer({}, settings(), {
    getGraph: async () => graph, getNoteContent: async p => p,
    vaultName: () => "Duplicates", lanAddresses: () => [],
  });
  await assert.rejects(server.qNote({ uid: "shared-id" }), /Ambiguous UID/);
  assert.equal((await server.qNote({ uid: "shared-id", path: "B.md" })).path, "B.md");
  assert.equal((await server.qNote({ path: "A.md" })).path, "A.md");
});


test("non-traversal tool calls refresh the designated ship without adding hops", async () => {
  const server = new KosmosAgentServer({}, settings(), fixtureProvider());
  const seen = [];
  server.onTraversal = (...event) => seen.push(event);
  await server.callTool("vault_overview", { agent_name: "JEFFREY" });
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].slice(0, 3), [[], "ping", "JEFFREY"]);
});

test("duplicate names and aliases reject ambiguity while exact paths still work", async () => {
  const graph = buildProductGraph([
    { relativePath: "A/Shared.md", content: "---\ntype: semantic\nsensitivity: internal\naliases: [common]\n---\nA" },
    { relativePath: "B/Shared.md", content: "---\ntype: semantic\nsensitivity: internal\naliases: [common]\n---\nB" },
  ], ["A", "B"]);
  const server = new KosmosAgentServer({}, settings(), {
    getGraph: async () => graph, getNoteContent: async p => p,
    vaultName: () => "DuplicateNames", lanAddresses: () => [],
  });
  for (const title of ["Shared", "common"])
    await assert.rejects(server.qNote({ title }), /Ambiguous note name/);
  assert.equal((await server.qNote({ path: "B/Shared.md" })).path, "B/Shared.md");
});
