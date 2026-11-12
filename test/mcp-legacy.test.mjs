/**
 * Dual-era MCP (0.9.0): the server keeps the modern 2026-07-28 path unchanged
 * and, only while agentLegacyMcp is true, also answers clients that open with
 * the legacy `initialize` handshake. Both eras are stateless.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { buildGraph, stripFrontmatter } from "../dist/kosmos-core.mjs";
import {
  KosmosAgentServer,
  LATEST_LEGACY_MCP_PROTOCOL_VERSION,
  LEGACY_MCP_PROTOCOL_VERSIONS,
  MCP_META_CLIENT_CAPABILITIES,
  MCP_META_CLIENT_INFO,
  MCP_META_PROTOCOL_VERSION,
  MODERN_MCP_PROTOCOL_VERSION,
  SUPPORTED_MCP_PROTOCOL_VERSIONS,
  migrateAgentSettings,
} from "../dist/kosmos-agent-server.mjs";

const TOKEN = "legacy-test-token-1234567890";
const FILES = [
  { relativePath: "Notes/Hello.md", content: "---\nsensitivity: internal\n---\nHello from the legacy test." },
];

function provider() {
  const graph = buildGraph(FILES, ["Notes"], undefined, { defaultSensitivity: "internal" });
  const bodies = new Map(FILES.map((f) => [f.relativePath, stripFrontmatter(f.content)]));
  return {
    getGraph: async () => graph,
    getNoteContent: async (p) => bodies.get(p) ?? null,
    getIndexedBody: (p, g) => (g === graph ? bodies.get(p) ?? null : null),
    vaultName: () => "LegacyVault",
    lanAddresses: () => [],
  };
}

async function start(overrides = {}) {
  const settings = { ...migrateAgentSettings({}), agentEnabled: true, agentPort: 0, agentToken: TOKEN, defaultSensitivity: "internal", ...overrides };
  const server = new KosmosAgentServer(http, settings, provider());
  await new Promise((resolve) => { server.start(); server.server.on("listening", resolve); });
  return { server, port: server.server.address().port };
}

function post(port, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/mcp", headers: {
      Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers,
    } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, json: () => JSON.parse(data || "null"), text: data }));
    });
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

const initialize = (protocolVersion) => ({
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion, capabilities: {}, clientInfo: { name: "Legacy Client", version: "1.0.0" } },
});

test("legacy handshake negotiates a version and creates no session", async (t) => {
  const { server, port } = await start();
  t.after(() => server.stop());

  const res = await post(port, initialize("2025-06-18"));
  assert.equal(res.status, 200);
  const out = res.json();
  assert.equal(out.id, 1);
  assert.equal(out.result.protocolVersion, "2025-06-18", "a supported requested version is echoed");
  assert.equal(out.result.serverInfo.name, "kosmos-oden");
  assert.deepEqual(out.result.capabilities, { tools: { listChanged: false } });
  assert.equal(typeof out.result.instructions, "string");
  assert.equal(res.headers["mcp-session-id"], undefined, "no session is minted");
  assert.equal("resultType" in out.result, false, "legacy results carry no modern fields");

  const unknown = (await post(port, initialize("1999-01-01"))).json();
  assert.equal(unknown.result.protocolVersion, LATEST_LEGACY_MCP_PROTOCOL_VERSION, "an unsupported request gets the newest legacy version");
  for (const version of LEGACY_MCP_PROTOCOL_VERSIONS) {
    assert.equal((await post(port, initialize(version))).json().result.protocolVersion, version);
  }

  const note = await post(port, { jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(note.status, 202);
  assert.equal(note.text, "");
});

test("legacy clients can list and call the same tools", async (t) => {
  const { server, port } = await start();
  t.after(() => server.stop());
  const legacyHeader = { "MCP-Protocol-Version": "2025-06-18" };

  const list = (await post(port, { jsonrpc: "2.0", id: 2, method: "tools/list" }, legacyHeader)).json();
  const names = list.result.tools.map((tool) => tool.name);
  for (const name of ["vault_overview", "search_notes", "get_note", "get_related"]) assert.ok(names.includes(name), `${name} missing`);
  assert.equal("resultType" in list.result, false);
  assert.equal("cacheScope" in list.result, false);

  // Revisions before 2025-06-18 send no version header after the handshake.
  const noHeader = (await post(port, { jsonrpc: "2.0", id: 3, method: "tools/list" })).json();
  assert.equal(noHeader.result.tools.length, list.result.tools.length);

  const call = (await post(port, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_note", arguments: { path: "Notes/Hello.md" } } }, legacyHeader)).json();
  assert.equal(call.result.isError, false);
  assert.equal(call.result.content[0].type, "text");
  assert.match(call.result.structuredContent.content, /Hello from the legacy test/);

  const ping = (await post(port, { jsonrpc: "2.0", id: 5, method: "ping" }, legacyHeader)).json();
  assert.deepEqual(ping.result, {});

  const missing = await post(port, { jsonrpc: "2.0", id: 6, method: "no/such" }, legacyHeader);
  assert.equal(missing.status, 200, "legacy JSON-RPC errors travel in a 200 body");
  assert.equal(missing.json().error.code, -32601);

  const badTool = (await post(port, { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "nope", arguments: {} } }, legacyHeader)).json();
  assert.equal(badTool.error.code, -32602);
});

test("the modern path is unchanged while legacy is on", async (t) => {
  const { server, port } = await start();
  t.after(() => server.stop());
  const modern = (id, method, params = {}) => ({
    jsonrpc: "2.0", id, method,
    params: { ...params, _meta: { [MCP_META_PROTOCOL_VERSION]: MODERN_MCP_PROTOCOL_VERSION, [MCP_META_CLIENT_INFO]: { name: "Modern Client", version: "1.0.0" }, [MCP_META_CLIENT_CAPABILITIES]: {} } },
  });
  const headers = (method) => ({ "MCP-Protocol-Version": MODERN_MCP_PROTOCOL_VERSION, "Mcp-Method": method });

  const list = await post(port, modern(1, "tools/list"), headers("tools/list"));
  assert.equal(list.status, 200);
  assert.equal(list.json().result.resultType, "complete", "modern results keep their modern shape");

  // A modern version header without modern body metadata is a broken modern
  // request, not a legacy one: it keeps the modern diagnostic.
  const broken = await post(port, { jsonrpc: "2.0", id: 2, method: "tools/list" }, headers("tools/list"));
  assert.equal(broken.status, 400);
  assert.ok(broken.json().error);

  const get = await new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: "GET", path: "/mcp", headers: { Authorization: `Bearer ${TOKEN}` } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on("error", reject); req.end();
  });
  assert.equal(get, 405, "no GET stream in either era");

  const unauthorized = await new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/mcp", headers: { "Content-Type": "application/json" } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on("error", reject); req.end(JSON.stringify(initialize("2025-06-18")));
  });
  assert.equal(unauthorized, 401, "the token is required in both eras");
});

test("with the setting off, or absent, the server is modern-only", async (t) => {
  for (const overrides of [{ agentLegacyMcp: false }, { agentLegacyMcp: undefined }]) {
    const { server, port } = await start(overrides);
    const res = await post(port, initialize("2025-06-18"));
    server.stop();
    assert.notEqual(res.status, 200);
    const out = res.json();
    assert.ok(out.error, "the handshake is refused");
    assert.ok(JSON.stringify(out.error).includes(SUPPORTED_MCP_PROTOCOL_VERSIONS[0]), "the refusal names the supported modern version");
  }
});

test("a legacy stdio client works through the bundled adapter", async (t) => {
  const { server, port } = await start();
  t.after(() => server.stop());
  const child = spawn(process.execPath, ["kosmos-mcp-stdio.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, KOSMOS_MCP_URL: `http://127.0.0.1:${port}/mcp`, KOSMOS_MCP_TOKEN: TOKEN },
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => { try { child.kill(); } catch {} });
  const queued = [];
  const waiters = [];
  let partial = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    partial += chunk;
    let nl;
    while ((nl = partial.indexOf("\n")) >= 0) {
      const line = partial.slice(0, nl); partial = partial.slice(nl + 1);
      if (!line) continue;
      const value = JSON.parse(line);
      const waiter = waiters.shift();
      if (waiter) waiter(value); else queued.push(value);
    }
  });
  const next = () => (queued.length ? Promise.resolve(queued.shift()) : new Promise((resolve) => waiters.push(resolve)));
  const send = (message) => child.stdin.write(JSON.stringify(message) + "\n");

  send(initialize("2025-06-18"));
  const init = await next();
  assert.equal(init.id, 1);
  assert.equal(init.result.protocolVersion, "2025-06-18");
  send({ jsonrpc: "2.0", method: "notifications/initialized" }); // answered 202, so the adapter prints nothing
  send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const list = await next();
  assert.equal(list.id, 2);
  assert.ok(list.result.tools.some((tool) => tool.name === "search_notes"));
  send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_note", arguments: { path: "Notes/Hello.md" } } });
  const call = await next();
  assert.match(call.result.structuredContent.content, /Hello from the legacy test/);
});
