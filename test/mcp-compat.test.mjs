/**
 * Dual-era MCP over native Streamable HTTP `/mcp` (build instructions §8,
 * acceptance rows M01, M02, M05, N03). Every exchange goes through a real
 * socket to a started server. Historical revisions are pinned by RAW WIRE
 * FIXTURES; the official SDK client (@modelcontextprotocol/client 2.4.0)
 * supplements them, and the revision it actually negotiates is asserted.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { build } from "esbuild";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { buildGraph, stripFrontmatter } from "../dist/kosmos-core.mjs";
import {
  KosmosAgentServer,
  MCP_META_CLIENT_CAPABILITIES,
  MCP_META_CLIENT_INFO,
  MCP_META_PROTOCOL_VERSION,
  MODERN_MCP_PROTOCOL_VERSION,
  NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS,
  MCP_TRANSPORT_PROTOCOL_VERSIONS,
  migrateAgentSettings,
} from "../dist/kosmos-agent-server.mjs";

// The adapter module on its own (no obsidian, no server).
const compatBundle = await build({ entryPoints: ["src/plugin/mcp-compat.ts"], bundle: true, platform: "node", format: "esm", write: false });
const compat = await import(`data:text/javascript;base64,${Buffer.from(compatBundle.outputFiles[0].text).toString("base64")}`);

const TOKEN = "compat-test-token-1234567890";
const BODY = "Hello from the compatibility canary.";
const SLOW_BODY = "Slow note text that must never be delivered after a policy change.";
const FILES = [
  { relativePath: "Notes/Hello.md", content: `---\nsensitivity: internal\n---\n${BODY}` },
  { relativePath: "Notes/Slow.md", content: `---\nsensitivity: internal\n---\n${SLOW_BODY}` },
];

function provider(hooks = {}) {
  const graph = buildGraph(FILES, ["Notes"], undefined, { defaultSensitivity: "internal" });
  const bodies = new Map(FILES.map((f) => [f.relativePath, stripFrontmatter(f.content)]));
  return {
    getGraph: async () => graph,
    getNoteContent: async (p) => { await hooks.beforeRead?.(p); return bodies.get(p) ?? null; },
    getIndexedBody: (p, g) => (g === graph ? bodies.get(p) ?? null : null),
    vaultName: () => "CompatVault",
    lanAddresses: () => [],
  };
}

/** Start a real server. `raw` settings bypass migration, as older tests did. */
async function start(overrides = {}, { hooks, raw = false } = {}) {
  const base = raw
    ? { agentEnabled: true, agentPort: 0, agentToken: TOKEN, agentRequireToken: true, agentBindMode: "localhost", agentSensitivityCeiling: "internal", defaultSensitivity: "internal", agentGraphNamespace: "compat" }
    : { ...migrateAgentSettings({}), agentEnabled: true, agentPort: 0, agentToken: TOKEN, defaultSensitivity: "internal" };
  const server = new KosmosAgentServer(http, { ...base, ...overrides }, provider(hooks));
  await new Promise((resolve) => { server.start(); server.server.on("listening", resolve); });
  return { server, port: server.server.address().port, url: `http://127.0.0.1:${server.server.address().port}/mcp` };
}

function post(port, body, headers = {}, { method = "POST", auth = true } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: "/mcp", setHost: !headers.Host, headers: {
      ...(auth ? { Authorization: `Bearer ${TOKEN}` } : {}), "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers,
    } }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: data, json: () => JSON.parse(data || "null") }));
      res.on("aborted", () => resolve({ status: res.statusCode, headers: res.headers, text: data, aborted: true }));
      res.on("error", () => resolve({ status: res.statusCode, headers: res.headers, text: data, aborted: true }));
    });
    req.on("error", reject);
    req.end(body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body));
  });
}

/** Parse a text/event-stream body into its JSON-RPC messages. */
function sseMessages(text) {
  return text.split(/\n\n/).filter(Boolean).map((block) => {
    const lines = block.split("\n");
    assert.ok(lines.includes("event: message"), `event type in ${JSON.stringify(block)}`);
    return JSON.parse(lines.filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n"));
  });
}

const initialize = (protocolVersion, id = 1) => ({
  jsonrpc: "2.0", id, method: "initialize",
  params: { protocolVersion, capabilities: {}, clientInfo: { name: "Fixture Client", version: "1.0.0" } },
});
const modernMeta = { [MCP_META_PROTOCOL_VERSION]: MODERN_MCP_PROTOCOL_VERSION, [MCP_META_CLIENT_INFO]: { name: "Modern Fixture", version: "1" }, [MCP_META_CLIENT_CAPABILITIES]: {} };
const modernHeaders = (method, name) => ({ "MCP-Protocol-Version": MODERN_MCP_PROTOCOL_VERSION, "Mcp-Method": method, ...(name ? { "Mcp-Name": name } : {}) });
const callNote = (id, path = "Notes/Hello.md") => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "get_note", arguments: { path } } });

/** Assert a result carries only the minimal legacy shapes. */
function assertLegacyToolResult(result) {
  assert.deepEqual(Object.keys(result).sort(), ["content", "isError"]);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  return JSON.parse(result.content[0].text);
}

/* ---------------- classifier (module-level) ---------------- */

test("classifier: presence of any modern marker selects strict modern handling", () => {
  const { classifyMcpRequest } = compat;
  const legacy = { era: "legacy", version: "2025-03-26", explicit: false };
  // The two malformed probes reproduced in review.
  assert.deepEqual(classifyMcpRequest({}, { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { [MCP_META_PROTOCOL_VERSION]: 20260728 } } }), { era: "modern" });
  assert.deepEqual(classifyMcpRequest({}, { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { [MCP_META_CLIENT_CAPABILITIES]: {} } } }), { era: "modern" });
  assert.deepEqual(classifyMcpRequest({}, { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { [MCP_META_CLIENT_INFO]: null } } }), { era: "modern" });
  assert.deepEqual(classifyMcpRequest({}, { jsonrpc: "2.0", id: 1, method: "server/discover" }), { era: "modern" });
  assert.deepEqual(classifyMcpRequest({ "mcp-method": "tools/list" }, { jsonrpc: "2.0", id: 1, method: "tools/list" }), { era: "modern" });
  assert.deepEqual(classifyMcpRequest({ "mcp-param-region": "x" }, { jsonrpc: "2.0", id: 1, method: "tools/list" }), { era: "modern" });
  assert.deepEqual(classifyMcpRequest({ "mcp-protocol-version": "2026-07-28" }, { jsonrpc: "2.0", id: 1, method: "tools/list" }), { era: "modern" });
  // A modern marker beats a legacy header: never downgrade.
  assert.deepEqual(classifyMcpRequest({ "mcp-protocol-version": "2025-06-18" }, { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { [MCP_META_PROTOCOL_VERSION]: "2026-07-28" } } }), { era: "modern" });
  // Inside a batch, one marked member makes the whole array modern.
  assert.deepEqual(classifyMcpRequest({}, [{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: { [MCP_META_CLIENT_CAPABILITIES]: {} } } }]), { era: "modern" });
  // Ordinary extension _meta keys are not markers.
  assert.deepEqual(classifyMcpRequest({}, { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { "example.com/trace": "x", progressToken: 4 } } }), legacy);
  assert.deepEqual(classifyMcpRequest({}, initialize("2026-07-28")), legacy, "initialize is the legacy handshake whatever version it asks for");
  assert.deepEqual(classifyMcpRequest({ "mcp-protocol-version": "2025-06-18" }, { jsonrpc: "2.0", id: 1, method: "ping" }), { era: "legacy", version: "2025-06-18", explicit: true });
  for (const v of ["1999-01-01", "2024-11-05", "2026-01-01", "latest"]) {
    assert.deepEqual(classifyMcpRequest({ "mcp-protocol-version": v }, { jsonrpc: "2.0", id: 1, method: "ping" }), { era: "unsupported-version", requested: v });
  }
});

test("advertised protocol table is transport specific and follows the setting", () => {
  assert.deepEqual(MCP_TRANSPORT_PROTOCOL_VERSIONS.http, ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"]);
  assert.deepEqual(MCP_TRANSPORT_PROTOCOL_VERSIONS.stdio, ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"]);
  assert.deepEqual(compat.advertisedMcpProtocolVersions("http", false), ["2026-07-28"]);
  assert.deepEqual(compat.advertisedMcpProtocolVersions("stdio", false), ["2026-07-28"]);
});

test("legacy dispatch talks only to the narrow tool-service interface", async () => {
  // A different tool set plugs in without touching the wire code.
  const calls = [];
  const service = {
    toolDefs: () => [{ name: "only_tool", description: "d", inputSchema: { type: "object" }, title: "modern-only", outputSchema: {}, annotations: {} }],
    callTool: async (name, args) => { calls.push([name, args]); return { ok: true }; },
    isActive: () => true,
  };
  const identity = { name: "n", version: "v" };
  const opts = { supportedVersions: NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS };
  const list = await compat.legacyMcpDispatch({ jsonrpc: "2.0", id: 1, method: "tools/list" }, service, identity, opts);
  assert.deepEqual(list.result.tools, [{ name: "only_tool", description: "d", inputSchema: { type: "object" } }]);
  const call = await compat.legacyMcpDispatch({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "only_tool", arguments: { a: 1 } } }, service, identity, opts);
  assert.deepEqual(assertLegacyToolResult(call.result), { ok: true });
  assert.deepEqual(calls, [["only_tool", { a: 1 }]]);
  assert.equal(await compat.legacyMcpDispatch({ jsonrpc: "2.0", method: "notifications/initialized" }, service, identity, opts), null);
  const thrown = { ...service, callTool: async () => { throw new compat.McpRpcError(-32602, "bad args"); } };
  assert.equal((await compat.legacyMcpDispatch({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "only_tool" } }, thrown, identity, opts)).error.code, -32602);
});

/* ---------------- M02: exact-revision raw wire fixtures ---------------- */

for (const version of NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS) {
  test(`raw wire fixture ${version}: initialize, initialized, tools/list, tools/call, ping, errors`, async (t) => {
    const { server, port } = await start();
    t.after(() => server.stop());
    // 2025-03-26 clients send no version header; later revisions send the
    // negotiated one on every request after initialize.
    const after = version === "2025-03-26" ? {} : { "MCP-Protocol-Version": version };

    const init = await post(port, initialize(version));
    assert.equal(init.status, 200);
    assert.match(init.headers["content-type"], /^application\/json/);
    assert.equal(init.headers["mcp-session-id"], undefined, "stateless: no session is minted");
    const r = init.json().result;
    assert.deepEqual(Object.keys(r).sort(), ["capabilities", "instructions", "protocolVersion", "serverInfo"]);
    assert.equal(r.protocolVersion, version);
    assert.deepEqual(r.capabilities, { tools: { listChanged: false } }, "only implemented capabilities are advertised");
    assert.deepEqual(Object.keys(r.serverInfo).sort(), ["name", "version"]);

    const initialized = await post(port, { jsonrpc: "2.0", method: "notifications/initialized" }, after);
    assert.equal(initialized.status, 202);
    assert.equal(initialized.text, "");

    const list = (await post(port, { jsonrpc: "2.0", id: 2, method: "tools/list" }, after)).json();
    assert.deepEqual(Object.keys(list.result), ["tools"]);
    assert.ok(list.result.tools.length > 0);
    for (const tool of list.result.tools) {
      assert.deepEqual(Object.keys(tool).sort(), ["description", "inputSchema", "name"], tool.name);
      assert.equal(tool.inputSchema.type, "object");
    }

    const call = (await post(port, callNote(3), after)).json();
    assert.equal(call.id, 3);
    assert.match(assertLegacyToolResult(call.result).content, /compatibility canary/);
    assert.equal(call.result.isError, false);

    assert.deepEqual((await post(port, { jsonrpc: "2.0", id: 4, method: "ping" }, after)).json().result, {});
    const missing = await post(port, { jsonrpc: "2.0", id: 5, method: "resources/list" }, after);
    assert.equal(missing.json().error.code, -32601, "unadvertised capabilities are not implemented");
    assert.equal((await post(port, { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nope", arguments: {} } }, after)).json().error.code, -32602);
    const badInit = await post(port, { jsonrpc: "2.0", id: 7, method: "initialize", params: { protocolVersion: version, capabilities: {} } });
    assert.equal(badInit.json().error.code, -32602, "initialize fields are validated");
    const invalid = await post(port, { jsonrpc: "2.0", id: 1.5, method: "ping" }, after);
    assert.equal(invalid.status, 400);
    assert.equal(invalid.json().error.code, -32600);
    for (const method of ["GET", "DELETE"]) assert.equal((await post(port, undefined, after, { method })).status, 405, method);
  });
}

test("version negotiation follows the lifecycle; unknown explicit versions are refused", async (t) => {
  const { server, port } = await start();
  t.after(() => server.stop());
  for (const requested of ["1999-01-01", "2024-11-05", "2026-07-28"]) {
    const out = (await post(port, initialize(requested))).json();
    assert.equal(out.result.protocolVersion, "2025-11-25", `${requested}: the server offers its latest native legacy revision`);
  }
  for (const header of ["1999-01-01", "2024-11-05"]) {
    const res = await post(port, { jsonrpc: "2.0", id: 9, method: "tools/list" }, { "MCP-Protocol-Version": header });
    assert.equal(res.status, 400, header);
    assert.equal(res.json().id, 9);
    assert.equal(res.json().error.code, -32022);
    assert.deepEqual(res.json().error.data, { supported: [...MCP_TRANSPORT_PROTOCOL_VERSIONS.http], requested: header });
  }
  const discovery = await new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: "/", headers: { Authorization: `Bearer ${TOKEN}` } }, (res) => {
      let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve(JSON.parse(d)));
    }).on("error", reject);
  });
  assert.deepEqual(discovery.mcp.supportedProtocolVersions, [...MCP_TRANSPORT_PROTOCOL_VERSIONS.http], "native discovery never lists 2024-11-05");
});

/* ---------------- M05: malformed modern traffic never reaches a tool ---------------- */

test("malformed modern probes get strict modern errors, never a legacy tool result", async (t) => {
  const { server, port } = await start();
  t.after(() => server.stop());
  let reads = 0;
  server.onTraversal = () => { reads++; };
  const probes = [
    { [MCP_META_PROTOCOL_VERSION]: 20260728 },
    { [MCP_META_CLIENT_CAPABILITIES]: {} },
  ];
  for (const _meta of probes) {
    for (const headers of [{}, { "MCP-Protocol-Version": "2025-06-18" }]) {
      const msg = { ...callNote(1), params: { ...callNote(1).params, _meta } };
      const res = await post(port, msg, headers);
      assert.equal(res.status, 400, JSON.stringify({ _meta, headers }));
      assert.equal(res.json().result, undefined);
      assert.ok([-32020, -32602].includes(res.json().error.code));
      assert.doesNotMatch(res.text, /compatibility canary/);
      const batch = await post(port, [{ jsonrpc: "2.0", id: 1, method: "ping" }, msg], headers);
      assert.equal(batch.status, 400, "a modern marker cannot be smuggled into a legacy batch");
      assert.doesNotMatch(batch.text, /compatibility canary/);
    }
  }
  assert.equal(reads, 0);
});

/* ---------------- M01: modern path unchanged ---------------- */

test("modern 2026-07-28 discovery, tools and calls keep strict validation and modern shapes", async (t) => {
  const { server, port } = await start();
  t.after(() => server.stop());
  const discover = (await post(port, { jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: modernMeta } }, modernHeaders("server/discover"))).json();
  assert.deepEqual(discover.result.supportedVersions, [MODERN_MCP_PROTOCOL_VERSION]);
  assert.equal(discover.result.resultType, "complete");
  const list = (await post(port, { jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: modernMeta } }, modernHeaders("tools/list"))).json();
  assert.equal(list.result.cacheScope, "private");
  assert.ok(list.result.tools.every((tool) => tool.outputSchema && tool.annotations));
  const call = (await post(port, { ...callNote(3), params: { ...callNote(3).params, _meta: modernMeta } }, modernHeaders("tools/call", "get_note"))).json();
  assert.equal(call.result.resultType, "complete");
  assert.match(call.result.structuredContent.content, /compatibility canary/);
  const noMethodHeader = await post(port, { jsonrpc: "2.0", id: 4, method: "tools/list", params: { _meta: modernMeta } }, { "MCP-Protocol-Version": MODERN_MCP_PROTOCOL_VERSION });
  assert.equal(noMethodHeader.status, 400);
  assert.equal(noMethodHeader.json().error.code, -32020);
  const discoverWithoutMeta = await post(port, { jsonrpc: "2.0", id: 5, method: "server/discover" });
  assert.equal(discoverWithoutMeta.status, 400, "a modern-only method without metadata is a broken modern request, not legacy");
});

test("official SDK client: pinned modern and each legacy revision, negotiated revision recorded", async (t) => {
  const { server, url } = await start();
  t.after(() => server.stop());
  const requestInit = { headers: { Authorization: `Bearer ${TOKEN}` } };
  const observed = {};
  const run = async (label, options) => {
    const client = new Client({ name: `sdk-${label}`, version: "1.0.0" }, options);
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit }));
    try {
      observed[label] = client.getNegotiatedProtocolVersion();
      const tools = await client.listTools();
      assert.ok(tools.tools.some((tool) => tool.name === "get_note"), label);
      const result = await client.callTool({ name: "get_note", arguments: { path: "Notes/Hello.md" } });
      assert.match(result.content[0].text, /compatibility canary/, label);
    } finally { await client.close(); }
  };
  await run("modern", { versionNegotiation: { mode: { pin: MODERN_MCP_PROTOCOL_VERSION } } });
  await run("auto", { versionNegotiation: { mode: "auto" } });
  await run("default", {});
  for (const version of NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS) await run(version, { supportedProtocolVersions: [version] });
  t.diagnostic(`SDK negotiated: ${JSON.stringify(observed)}`);
  assert.deepEqual(observed, {
    modern: "2026-07-28", auto: "2026-07-28", default: "2025-11-25",
    "2025-11-25": "2025-11-25", "2025-06-18": "2025-06-18", "2025-03-26": "2025-03-26",
  });
});

/* ---------------- M02: March-2025 batches over native HTTP ---------------- */

test("March 2025 batches: SSE replies per request, none for notifications, per-member errors", async (t) => {
  const { server, port } = await start();
  t.after(() => server.stop());
  const batch = [
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    callNote(2),
    "not a message",
    { jsonrpc: "1.0", id: 5, method: "ping" },
    { jsonrpc: "2.0", id: 6, method: "no/such/method" },
    initialize("2025-03-26", 7),
    { jsonrpc: "2.0", id: "p", method: "ping" },
    { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "get_note", arguments: { nope: 1 } } },
  ];
  // Headerless: the specification's 2025-03-26 default, which defines batches.
  const res = await post(port, batch);
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-type"], "text/event-stream");
  assert.equal(res.headers["mcp-session-id"], undefined);
  const replies = sseMessages(res.text);
  const byId = new Map(replies.map((m) => [JSON.stringify(m.id), m]));
  assert.equal(replies.length, 8, "one reply per request or invalid entry, none for the notification");
  assert.ok(byId.get("1").result.tools.length > 0);
  assert.match(assertLegacyToolResult(byId.get("2").result).content, /compatibility canary/);
  assert.equal(byId.get("null").error.code, -32600, "an entry without a usable id is answered with id null");
  assert.equal(byId.get("5").error.code, -32600, "an invalid entry with a detectable id keeps it");
  assert.equal(byId.get("6").error.code, -32601);
  assert.equal(byId.get("7").error.code, -32600, "initialize must not be batched");
  assert.deepEqual(byId.get('"p"').result, {});
  assert.equal(byId.get("8").error.code, -32602);

  const json = await post(port, [{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", id: 2, method: "ping" }], { Accept: "application/json" });
  assert.match(json.headers["content-type"], /^application\/json/);
  assert.deepEqual(json.json().map((m) => m.id).sort(), [1, 2]);

  const notificationsOnly = await post(port, [{ jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } }]);
  assert.equal(notificationsOnly.status, 202);
  assert.equal(notificationsOnly.text, "");

  const explicit = await post(port, [{ jsonrpc: "2.0", id: 1, method: "ping" }], { "MCP-Protocol-Version": "2025-03-26" });
  assert.equal(explicit.status, 200);
  assert.equal(sseMessages(explicit.text)[0].id, 1);

  const empty = await post(port, []);
  assert.equal(empty.status, 400);
  assert.equal(empty.json().error.code, -32600);
  const oversized = await post(port, Array.from({ length: 101 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" })));
  assert.equal(oversized.status, 400);
  assert.equal(oversized.json().error.code, -32600);
  const atLimit = await post(port, Array.from({ length: 100 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" })));
  assert.equal(sseMessages(atLimit.text).length, 100);

  for (const version of ["2025-06-18", "2025-11-25"]) {
    const removed = await post(port, [{ jsonrpc: "2.0", id: 1, method: "ping" }], { "MCP-Protocol-Version": version });
    assert.equal(removed.status, 400, `${version} removed batching`);
    assert.equal(removed.json().error.code, -32600);
  }
  const modern = await post(port, [{ jsonrpc: "2.0", id: 1, method: "ping" }], { "MCP-Protocol-Version": MODERN_MCP_PROTOCOL_VERSION, "Mcp-Method": "ping" });
  assert.equal(modern.status, 400);
  assert.equal(modern.json().error.code, -32600);
});

test("a policy-generation change mid-batch stops delivery of the remaining members", async (t) => {
  let release, reached;
  const gate = new Promise((r) => { release = r; });
  const slowStarted = new Promise((r) => { reached = r; });
  const { server, port } = await start({}, { hooks: { beforeRead: async (p) => { if (p === "Notes/Slow.md") { reached(); await gate; } } } });
  t.after(() => { release(); server.stop(); });
  let generation = 1;
  server.policyGeneration = () => generation;
  const pending = post(port, [callNote(1), callNote(2, "Notes/Slow.md")]);
  await slowStarted;
  generation++; // e.g. shared folders changed while the batch was in flight
  release();
  // The stale stream is cut: either a truncated event stream or a hang-up
  // before any byte, depending on whether the first member finished first.
  const res = await pending.catch((error) => ({ text: "", error }));
  assert.ok(res.aborted || res.error, "the stream does not complete normally");
  assert.doesNotMatch(res.text, /must never be delivered/);
  const delivered = res.text ? res.text.split("\n\n").filter(Boolean) : [];
  assert.ok(delivered.length <= 1, "only the member completed before the change may have been delivered");

  // A new request under the new generation works.
  const after = (await post(port, callNote(3, "Notes/Slow.md"))).json();
  assert.match(assertLegacyToolResult(after.result).content, /must never be delivered/);
});

/* ---------------- setting ---------------- */

test("Accept older MCP clients: default on everywhere, explicit off refuses legacy while modern works", async (t) => {
  // A settings object that omits the field behaves exactly like the shipped default.
  for (const raw of [true, false]) {
    const { server, port } = await start({}, { raw });
    const out = (await post(port, initialize("2025-06-18"))).json();
    server.stop();
    assert.equal(out.result.protocolVersion, "2025-06-18", `raw=${raw}`);
  }
  assert.equal(migrateAgentSettings({}).agentLegacyMcp, true);
  assert.equal(migrateAgentSettings({ agentLegacyMcp: undefined }).agentLegacyMcp, true);

  const { server, port } = await start({ agentLegacyMcp: false });
  t.after(() => server.stop());
  const refused = await post(port, initialize("2025-06-18"));
  assert.equal(refused.status, 400);
  assert.equal(refused.json().error.code, -32022);
  assert.match(refused.json().error.message, /Accept older MCP clients/);
  assert.deepEqual(refused.json().error.data, { supported: ["2026-07-28"], requested: "2025-06-18" });
  assert.equal((await post(port, [{ jsonrpc: "2.0", id: 1, method: "ping" }])).status, 400);
  assert.equal((await post(port, { jsonrpc: "2.0", id: 2, method: "tools/list" }, { "MCP-Protocol-Version": "2025-11-25" })).json().error.code, -32022);
  const modern = await post(port, { jsonrpc: "2.0", id: 3, method: "tools/list", params: { _meta: modernMeta } }, modernHeaders("tools/list"));
  assert.equal(modern.status, 200);
  assert.equal(modern.json().result.resultType, "complete");
  const unknown = await post(port, { jsonrpc: "2.0", id: 4, method: "ping" }, { "MCP-Protocol-Version": "2025-06-18" });
  assert.equal(unknown.json().error.code, -32022);
});

/* ---------------- N03: authentication and Host/Origin on every era ---------------- */

test("token, Host and Origin checks apply to legacy requests and batches", async (t) => {
  const { server, port } = await start();
  t.after(() => server.stop());
  const bodies = [initialize("2025-06-18"), [{ jsonrpc: "2.0", id: 1, method: "ping" }], { jsonrpc: "2.0", method: "notifications/initialized" }];
  for (const body of bodies) {
    assert.equal((await post(port, body, {}, { auth: false })).status, 401);
    assert.equal((await post(port, body, { Authorization: "Bearer wrong-token" })).status, 401);
    assert.equal((await post(port, body, { Host: "evil.example.com" })).status, 403);
    assert.equal((await post(port, body, { Origin: "https://evil.example.com" })).status, 403);
  }
});

/* ---------------- isolation: both generations against one server ---------------- */

test("both eras concurrently on one server share no negotiation state", async (t) => {
  const { server, port, url } = await start();
  t.after(() => server.stop());
  const requestInit = { headers: { Authorization: `Bearer ${TOKEN}` } };
  const connect = async (name, options) => {
    const client = new Client({ name, version: "1" }, options);
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit }));
    return client;
  };
  const [modern, june, march] = await Promise.all([
    connect("modern", { versionNegotiation: { mode: { pin: MODERN_MCP_PROTOCOL_VERSION } } }),
    connect("june", { supportedProtocolVersions: ["2025-06-18"] }),
    connect("march", { supportedProtocolVersions: ["2025-03-26"] }),
  ]);
  t.after(() => Promise.all([modern.close(), june.close(), march.close()]));
  const rounds = [];
  for (let i = 0; i < 5; i++) {
    rounds.push(modern.callTool({ name: "get_note", arguments: { path: "Notes/Hello.md" } }).then((r) => assert.ok(r.structuredContent, "modern keeps structuredContent")));
    rounds.push(june.callTool({ name: "get_note", arguments: { path: "Notes/Hello.md" } }).then((r) => assert.equal(r.structuredContent, undefined)));
    rounds.push(march.listTools().then((r) => assert.ok(r.tools.every((tool) => tool.outputSchema === undefined))));
    // Raw traffic interleaved: a headerless batch is March-era no matter what
    // another client negotiated a moment ago; a 2025-06-18 header refuses it.
    rounds.push(post(port, [{ jsonrpc: "2.0", id: i, method: "ping" }]).then((r) => assert.equal(r.status, 200)));
    rounds.push(post(port, [{ jsonrpc: "2.0", id: i, method: "ping" }], { "MCP-Protocol-Version": "2025-06-18" }).then((r) => assert.equal(r.status, 400)));
    rounds.push(post(port, initialize("2025-11-25", i)).then((r) => assert.equal(r.json().result.protocolVersion, "2025-11-25")));
  }
  await Promise.all(rounds);
  assert.equal(modern.getNegotiatedProtocolVersion(), "2026-07-28");
  assert.equal(june.getNegotiatedProtocolVersion(), "2025-06-18");
  assert.equal(march.getNegotiatedProtocolVersion(), "2025-03-26");
});
