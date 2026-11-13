/**
 * The bundled stdio bridge across protocol eras (build instructions §8
 * "Update and qualify the bundled stdio bridge"; acceptance rows M02-M04,
 * N03, B03). Every test spawns the real `kosmos-mcp-stdio.mjs` process with
 * plain Node against a real started server (or a deliberately misbehaving
 * stand-in where the upstream itself is the subject).
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { buildGraph, stripFrontmatter } from "../dist/kosmos-core.mjs";
import {
  KosmosAgentServer,
  MCP_META_CLIENT_CAPABILITIES,
  MCP_META_CLIENT_INFO,
  MCP_META_PROTOCOL_VERSION,
  MODERN_MCP_PROTOCOL_VERSION,
  migrateAgentSettings,
} from "../dist/kosmos-agent-server.mjs";

const TOKEN = "bridge-compat-token-1234567890";
const FILES = [{ relativePath: "Notes/Canary.md", content: "---\nsensitivity: internal\n---\nBridge canary sentence." }];

function provider(lanAddresses = []) {
  const graph = buildGraph(FILES, ["Notes"], undefined, { defaultSensitivity: "internal" });
  const bodies = new Map(FILES.map((f) => [f.relativePath, stripFrontmatter(f.content)]));
  return {
    getGraph: async () => graph,
    getNoteContent: async (p) => bodies.get(p) ?? null,
    getIndexedBody: (p, g) => (g === graph ? bodies.get(p) ?? null : null),
    vaultName: () => "BridgeVault",
    lanAddresses: () => lanAddresses,
  };
}

async function startServer(overrides = {}, lanAddresses = []) {
  const settings = { ...migrateAgentSettings({}), agentEnabled: true, agentPort: 0, agentToken: TOKEN, defaultSensitivity: "internal", ...overrides };
  const server = new KosmosAgentServer(http, settings, provider(lanAddresses));
  await new Promise((resolve) => { server.start(); server.server.on("listening", resolve); });
  return { server, port: server.server.address().port };
}

/** A recording pass-through between bridge and server, to observe exactly
 *  what the bridge sends upstream. */
async function recordingProxy(targetPort) {
  const seen = [];
  const proxy = http.createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    seen.push({ headers: req.headers, body: body ? JSON.parse(body) : undefined });
    const headers = { ...req.headers, host: `127.0.0.1:${targetPort}` };
    const up = http.request({ host: "127.0.0.1", port: targetPort, method: req.method, path: req.url, headers }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    up.end(body);
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  return { seen, port: proxy.address().port, close: () => proxy.close() };
}

/** Spawn the bridge; every stdout line must be one JSON-RPC message. */
function spawnBridge(t, env) {
  const child = spawn(process.execPath, ["kosmos-mcp-stdio.mjs"], {
    env: { ...process.env, KOSMOS_MCP_TOKEN: TOKEN, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => { try { child.kill(); } catch {} });
  const lines = [], queued = [], waiters = [];
  let partial = "", stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (c) => (stderr += c));
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    partial += chunk;
    let nl;
    while ((nl = partial.indexOf("\n")) >= 0) {
      const line = partial.slice(0, nl); partial = partial.slice(nl + 1);
      lines.push(line);
      const value = JSON.parse(line); // stdout cleanliness: protocol messages only
      for (const m of [value].flat()) assert.equal(m.jsonrpc, "2.0", `non-protocol stdout: ${line}`);
      const waiter = waiters.shift();
      if (waiter) waiter(value); else queued.push(value);
    }
  });
  const next = (ms = 10_000) => queued.length ? Promise.resolve(queued.shift()) : new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for bridge output")), ms);
    waiters.push((v) => { clearTimeout(timer); resolve(v); });
  });
  const send = (m) => child.stdin.write((typeof m === "string" ? m : JSON.stringify(m)) + "\n");
  return { child, send, next, lines, stderr: () => stderr, partial: () => partial };
}

const initialize = (protocolVersion, id = 1) => ({
  jsonrpc: "2.0", id, method: "initialize",
  params: { protocolVersion, capabilities: {}, clientInfo: { name: "Bridge Fixture", version: "1.0.0" } },
});
const callCanary = (id) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "get_note", arguments: { path: "Notes/Canary.md" } } });

async function exitCode(child) {
  if (child.exitCode !== null) return child.exitCode;
  const [code] = await once(child, "exit");
  return code;
}

/** First non-internal IPv4 address of this machine, or undefined. */
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) return a.address;
  return undefined;
}

test("2024-11-05 full stdio lifecycle through the internal adapter, carried upstream as 2025-03-26", async (t) => {
  const { server, port } = await startServer();
  t.after(() => server.stop());
  const proxy = await recordingProxy(port);
  t.after(() => proxy.close());
  const b = spawnBridge(t, { KOSMOS_MCP_URL: `http://127.0.0.1:${proxy.port}/mcp` });

  b.send(initialize("2024-11-05"));
  const init = await b.next();
  assert.equal(init.id, 1);
  assert.equal(init.result.protocolVersion, "2024-11-05", "the stdio client sees its own revision");
  assert.deepEqual(init.result.capabilities, { tools: { listChanged: false } });
  assert.deepEqual(Object.keys(init.result.serverInfo).sort(), ["name", "version"]);
  assert.equal(proxy.seen[0].body.params.protocolVersion, "2025-03-26", "upstream carriage is the oldest native revision");
  assert.match(b.stderr(), /internal adapter/);

  b.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  b.send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const list = await b.next();
  assert.equal(list.id, 2, "the initialized notification produced no stdout message");
  for (const tool of list.result.tools) assert.deepEqual(Object.keys(tool).sort(), ["description", "inputSchema", "name"]);

  b.send(callCanary(3));
  const call = await b.next();
  assert.deepEqual(Object.keys(call.result).sort(), ["content", "isError"]);
  assert.match(JSON.parse(call.result.content[0].text).content, /Bridge canary sentence/);

  b.send({ jsonrpc: "2.0", id: 4, method: "ping" });
  assert.deepEqual((await b.next()).result, {});
  b.send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "nope", arguments: {} } });
  assert.equal((await b.next()).error.code, -32602);
  b.send({ jsonrpc: "2.0", id: 6, method: "resources/list" });
  assert.equal((await b.next()).error.code, -32601);
  b.send([{ jsonrpc: "2.0", id: 7, method: "ping" }]);
  const batch = await b.next();
  assert.equal(batch.error.code, -32600, "2024-11-05 defines no batches");
  b.send("{not json");
  assert.equal((await b.next()).error.code, -32700);

  // Every upstream request after initialize carries the negotiated upstream
  // revision; none carries synthesized modern metadata or routing headers.
  for (const { headers, body } of proxy.seen.slice(1)) {
    assert.equal(headers["mcp-protocol-version"], "2025-03-26");
    assert.equal(headers["mcp-method"], undefined);
    assert.equal(body.params?._meta, undefined);
    assert.equal(headers.authorization, `Bearer ${TOKEN}`);
  }
  assert.equal(proxy.seen[0].headers["mcp-protocol-version"], undefined, "initialize carries no version header");

  b.child.stdin.end();
  assert.equal(await exitCode(b.child), 0);
  assert.equal(b.partial(), "", "no partial stdout line");
});

test("official SDK client over the spawned bridge: 2024-11-05, default legacy and pinned modern", async (t) => {
  const { server, port } = await startServer();
  t.after(() => server.stop());
  const observed = {};
  const run = async (label, options) => {
    const transport = new StdioClientTransport({
      command: process.execPath, args: ["kosmos-mcp-stdio.mjs"], cwd: process.cwd(), stderr: "pipe",
      env: { ...process.env, KOSMOS_MCP_URL: `http://127.0.0.1:${port}/mcp`, KOSMOS_MCP_TOKEN: TOKEN },
    });
    const client = new Client({ name: `sdk-stdio-${label}`, version: "1.0.0" }, options);
    await client.connect(transport);
    try {
      observed[label] = client.getNegotiatedProtocolVersion();
      assert.ok((await client.listTools()).tools.some((tool) => tool.name === "get_note"), label);
      const result = await client.callTool({ name: "get_note", arguments: { path: "Notes/Canary.md" } });
      assert.match(result.content[0].text, /Bridge canary sentence/, label);
    } finally { await client.close(); }
  };
  await run("2024-11-05", { supportedProtocolVersions: ["2024-11-05"] });
  await run("2025-03-26", { supportedProtocolVersions: ["2025-03-26"] });
  await run("default", {});
  await run("modern", { versionNegotiation: { mode: { pin: MODERN_MCP_PROTOCOL_VERSION } } });
  t.diagnostic(`SDK over stdio negotiated: ${JSON.stringify(observed)}`);
  assert.deepEqual(observed, { "2024-11-05": "2024-11-05", "2025-03-26": "2025-03-26", default: "2025-11-25", modern: "2026-07-28" });
});

test("negotiated revision is per bridge process and forwarded as the version header", async (t) => {
  const { server, port } = await startServer();
  t.after(() => server.stop());
  const proxy = await recordingProxy(port);
  t.after(() => proxy.close());
  const june = spawnBridge(t, { KOSMOS_MCP_URL: `http://127.0.0.1:${proxy.port}/mcp`, KOSMOS_AGENT_NAME: "June Agent" });
  const nov = spawnBridge(t, { KOSMOS_MCP_URL: `http://127.0.0.1:${proxy.port}/mcp` });
  june.send(initialize("2025-06-18"));
  nov.send(initialize("2025-11-25"));
  assert.equal((await june.next()).result.protocolVersion, "2025-06-18");
  assert.equal((await nov.next()).result.protocolVersion, "2025-11-25");
  june.send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  nov.send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  await Promise.all([june.next(), nov.next()]);
  const lists = proxy.seen.filter((s) => s.body?.method === "tools/list");
  assert.deepEqual(lists.map((s) => s.headers["mcp-protocol-version"]).sort(), ["2025-06-18", "2025-11-25"]);
  const juneList = lists.find((s) => s.headers["mcp-protocol-version"] === "2025-06-18");
  assert.equal(juneList.headers["x-kosmos-agent-name"], "June Agent", "legacy identity travels in a header, not synthesized _meta");
  assert.equal(juneList.body.params, undefined);

  // Modern messages through an initialized legacy bridge keep exact mirroring.
  const meta = { [MCP_META_PROTOCOL_VERSION]: MODERN_MCP_PROTOCOL_VERSION, [MCP_META_CLIENT_CAPABILITIES]: {}, [MCP_META_CLIENT_INFO]: { name: "m", version: "1" } };
  june.send({ jsonrpc: "2.0", id: 3, method: "tools/list", params: { _meta: meta } });
  assert.equal((await june.next()).result.resultType, "complete");
  const modern = proxy.seen.at(-1);
  assert.equal(modern.headers["mcp-protocol-version"], MODERN_MCP_PROTOCOL_VERSION);
  assert.equal(modern.headers["mcp-method"], "tools/list");
  june.send([{ jsonrpc: "2.0", id: 4, method: "ping" }]);
  assert.equal((await june.next()).error.code, -32600, "2025-06-18 removed batching");
});

test("March 2025 stdio batches are split into bounded upstream requests and aggregated", async (t) => {
  const { server, port } = await startServer();
  t.after(() => server.stop());
  const proxy = await recordingProxy(port);
  t.after(() => proxy.close());
  const b = spawnBridge(t, { KOSMOS_MCP_URL: `http://127.0.0.1:${proxy.port}/mcp` });

  b.send([{ jsonrpc: "2.0", id: 1, method: "ping" }]);
  assert.equal((await b.next()).error.code, -32600, "no batches before negotiating 2025-03-26");
  b.send(initialize("2025-03-26", 2));
  assert.equal((await b.next()).result.protocolVersion, "2025-03-26");

  b.send([
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 10, method: "tools/list" },
    callCanary(11),
    { jsonrpc: "2.0", id: 12, method: "no/such" },
    42,
    initialize("2025-03-26", 13),
    { jsonrpc: "2.0", id: "s", method: "ping" },
  ]);
  const replies = await b.next();
  assert.ok(Array.isArray(replies), "one batch reply");
  const byId = new Map(replies.map((r) => [JSON.stringify(r.id), r]));
  assert.equal(replies.length, 6, "no reply for the notification");
  assert.ok(byId.get("10").result.tools.length);
  assert.match(JSON.parse(byId.get("11").result.content[0].text).content, /Bridge canary sentence/);
  assert.equal(byId.get("12").error.code, -32601);
  assert.equal(byId.get("null").error.code, -32600);
  assert.equal(byId.get("13").error.code, -32600);
  assert.deepEqual(byId.get('"s"').result, {});
  assert.ok(proxy.seen.every((s) => !Array.isArray(s.body)), "arrays are never forwarded to the single-message parser");
  assert.ok(proxy.seen.slice(1).every((s) => s.headers["mcp-protocol-version"] === "2025-03-26"));

  b.send([{ jsonrpc: "2.0", method: "notifications/initialized" }]);
  b.send({ jsonrpc: "2.0", id: 20, method: "ping" });
  assert.equal((await b.next()).id, 20, "a notification-only batch writes nothing");
  b.send([]);
  assert.equal((await b.next()).error.code, -32600);
  b.send(Array.from({ length: 101 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" })));
  assert.equal((await b.next()).error.code, -32600);
  const before = proxy.seen.length;
  b.send([{ jsonrpc: "2.0", id: 30, method: "ping" }, { jsonrpc: "2.0", id: 31, method: "tools/list", params: { _meta: { [MCP_META_CLIENT_CAPABILITIES]: {} } } }]);
  assert.equal((await b.next()).error.code, -32600, "a modern member cannot be smuggled into a legacy batch");
  assert.equal(proxy.seen.length, before, "nothing was forwarded");
});

test("remote-style upstream: LAN-bound server reached by a non-loopback address; unapproved Host refused", async (t) => {
  const address = lanAddress();
  if (!address) { t.skip("no non-internal IPv4 interface on this machine"); return; }
  const { server, port } = await startServer({ agentBindMode: "lan" }, [address]);
  t.after(() => server.stop());
  const b = spawnBridge(t, { KOSMOS_MCP_URL: `http://${address}:${port}/mcp` });
  b.send(initialize("2024-11-05"));
  assert.equal((await b.next()).result.protocolVersion, "2024-11-05");
  b.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  b.send(callCanary(2));
  assert.match(JSON.parse((await b.next()).result.content[0].text).content, /Bridge canary sentence/);
  b.child.stdin.end();
  assert.equal(await exitCode(b.child), 0);

  // Same address, but the server does not list it as one of its own: the
  // Host check refuses the bridge like any other client.
  const strict = await startServer({ agentBindMode: "lan" }, []);
  t.after(() => strict.server.stop());
  const refused = spawnBridge(t, { KOSMOS_MCP_URL: `http://${address}:${strict.port}/mcp` });
  refused.send(initialize("2025-06-18"));
  const error = await refused.next();
  assert.equal(error.error.code, -30000);
  assert.match(error.error.data.detail, /^403/);
});

test("authentication failures are reported per request, never retried with weaker validation", async (t) => {
  const { server, port } = await startServer();
  t.after(() => server.stop());
  for (const token of ["", "wrong-token"]) {
    const b = spawnBridge(t, { KOSMOS_MCP_URL: `http://127.0.0.1:${port}/mcp`, KOSMOS_MCP_TOKEN: token });
    b.send(initialize("2025-06-18"));
    const out = await b.next();
    assert.equal(out.id, 1);
    assert.equal(out.error.code, -30000);
    assert.match(out.error.data.detail, /^401/);
    assert.doesNotMatch(JSON.stringify(out), new RegExp(TOKEN));
    b.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    b.send({ jsonrpc: "2.0", id: 2, method: "ping" });
    assert.equal((await b.next()).id, 2, "the rejected notification wrote nothing to stdout");
    b.child.stdin.end();
    assert.equal(await exitCode(b.child), 0);
  }
  // Older clients turned off: the explicit refusal reaches the stdio client.
  const off = await startServer({ agentLegacyMcp: false });
  t.after(() => off.server.stop());
  const b = spawnBridge(t, { KOSMOS_MCP_URL: `http://127.0.0.1:${off.port}/mcp` });
  b.send(initialize("2024-11-05"));
  const refused = await b.next();
  assert.equal(refused.error.code, -32022);
  assert.match(refused.error.message, /Accept older MCP clients/);
});

test("an unacceptable upstream initialize reply is rejected by the bridge", async (t) => {
  const upstream = http.createServer(async (req, res) => {
    let text = ""; for await (const part of req) text += part;
    const m = JSON.parse(text);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "1999-01-01", capabilities: {}, serverInfo: { name: "x", version: "1" } } }));
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  t.after(() => upstream.close());
  const b = spawnBridge(t, { KOSMOS_MCP_URL: `http://127.0.0.1:${upstream.address().port}/mcp` });
  b.send(initialize("2025-06-18"));
  const out = await b.next();
  assert.equal(out.result, undefined);
  assert.match(out.error.message, /unsupported protocol version: 1999-01-01/);
});

test("shutdown with a pending request aborts the upstream fetch and exits cleanly", async (t) => {
  let arrived;
  const reached = new Promise((r) => { arrived = r; });
  const sockets = new Set();
  const upstream = http.createServer((req) => { arrived(); req.resume(); /* never answers */ });
  upstream.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  t.after(() => { for (const s of sockets) s.destroy(); upstream.close(); });
  const b = spawnBridge(t, { KOSMOS_MCP_URL: `http://127.0.0.1:${upstream.address().port}/mcp` });
  b.send(initialize("2025-06-18"));
  b.send({ jsonrpc: "2.0", id: 2, method: "ping" }); // queued behind the pending one
  await reached;
  const started = Date.now();
  b.child.stdin.end();
  assert.equal(await exitCode(b.child), 0);
  assert.ok(Date.now() - started < 5_000, "exit does not wait for the 65 s operation timeout");
  assert.deepEqual(b.lines, [], "nothing was written for aborted requests");
  assert.match(b.stderr(), /aborting/);
  for (let i = 0; i < 100 && sockets.size; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(sockets.size, 0, "the pending upstream connection was closed");
});
