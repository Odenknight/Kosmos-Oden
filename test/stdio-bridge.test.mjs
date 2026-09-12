import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { buildGraph } from "../dist/kosmos-core.mjs";
import {
  KosmosAgentServer,
  MODERN_MCP_PROTOCOL_VERSION,
  MCP_META_PROTOCOL_VERSION,
  MCP_META_CLIENT_INFO,
  MCP_META_CLIENT_CAPABILITIES,
  MCP_META_SERVER_INFO,
} from "../dist/kosmos-agent-server.mjs";

test("bundled stdio adapter mirrors modern request metadata into headers", async (t) => {
  const token = "bridge-test-token";
  const graph = buildGraph([{ relativePath: "Hello.md", content: "# Hello" }], []);
  const server = new KosmosAgentServer(http, {
    schemaVersion: 3,
    agentEnabled: true,
    agentPort: 0,
    agentToken: token,
    agentRequireToken: true,
    agentBindMode: "localhost",
    agentAllowQueryToken: false,
    agentSensitivityCeiling: "internal",
    agentGraphNamespace: "bridgetest",
  }, {
    getGraph: async () => graph,
    getNoteContent: async () => "# Hello",
    vaultName: () => "BridgeTest",
    vaultIdentity: () => "bridge-test",
    lanAddresses: () => [],
  });
  await new Promise((resolve) => { server.start(); server.server.on("listening", resolve); });
  const port = server.server.address().port;
  t.after(() => server.stop());

  const child = spawn(process.execPath, ["kosmos-mcp-stdio.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, KOSMOS_MCP_URL: `http://127.0.0.1:${port}/mcp`, KOSMOS_MCP_TOKEN: token },
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
  const next = () => queued.length ? Promise.resolve(queued.shift()) : new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for stdio response")), 5000);
    waiters.push((value) => { clearTimeout(timer); resolve(value); });
  });
  const send = (message) => child.stdin.write(JSON.stringify(message) + "\n");

  // The stdio client supplies _meta; the adapter mirrors it into the HTTP
  // headers the server validates. No handshake and no session are involved.
  const meta = {
    [MCP_META_PROTOCOL_VERSION]: MODERN_MCP_PROTOCOL_VERSION,
    [MCP_META_CLIENT_INFO]: { name: "stdio-test", version: "1" },
    [MCP_META_CLIENT_CAPABILITIES]: {},
  };

  send({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: meta } });
  const discovered = await next();
  assert.deepEqual(discovered.result.supportedVersions, [MODERN_MCP_PROTOCOL_VERSION]);
  assert.equal(discovered.result._meta[MCP_META_SERVER_INFO].name, "kosmos-oden");

  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: meta } });
  const listed = await next();
  assert.ok(listed.result.tools.some((tool) => tool.name === "get_note"));

  // Mcp-Name is mirrored for tools/call, so a call through the adapter passes
  // header/body validation without the test supplying any header itself.
  send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_policy", arguments: {}, _meta: meta } });
  const called = await next();
  assert.equal(called.error, undefined);
  assert.ok(called.result.structuredContent);

  // A client that omits _meta gets the real server diagnostic, not a request
  // the adapter silently repaired on its behalf.
  send({ jsonrpc: "2.0", id: 4, method: "tools/list", params: {} });
  const unmetaed = await next();
  assert.equal(unmetaed.error.code, -32020);
  assert.match(unmetaed.error.message, /MCP-Protocol-Version header is required/);

  send({ jsonrpc: "2.0", id: 5, method: "initialize", params: {
    protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "legacy", version: "1" },
  } });
  const legacy = await next();
  assert.equal(legacy.id, 5);
  assert.equal(legacy.error.code, -32020);
  assert.match(legacy.error.message, /supported protocol versions: 2026-07-28/);

  send({ jsonrpc: "2.0", id: 6, method: "server/discover", params: { _meta: { ...meta, [MCP_META_PROTOCOL_VERSION]: "1900-01-01" } } });
  const unsupported = await next();
  assert.equal(unsupported.error.code, -32022);
  assert.deepEqual(unsupported.error.data, { supported: [MODERN_MCP_PROTOCOL_VERSION], requested: "1900-01-01" });

  send({ jsonrpc: "2.0", id: 7, method: "subscriptions/listen", params: { _meta: meta } });
  const unknown = await next();
  assert.equal(unknown.error.code, -32601);

  send({ jsonrpc: "2.0", id: 8, method: "tools/list", params: { _meta: meta } });
  const metadataResult = await next();
  assert.equal(metadataResult.result.resultType, "complete");
  assert.equal(metadataResult.result._meta[MCP_META_SERVER_INFO].name, "kosmos-oden");

  child.stdin.end();
  const exitCode = await new Promise((resolve) => child.on("exit", resolve));
  assert.equal(exitCode, 0);
});

test("configured ship identity survives generic and omitted client names without repairing invalid metadata", async (t) => {
  const received = [];
  const upstream = http.createServer(async (req, res) => {
    let text = "";
    for await (const part of req) text += part;
    const message = JSON.parse(text);
    received.push(message);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: {} }));
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  t.after(() => upstream.close());
  const child = spawn(process.execPath, ["kosmos-mcp-stdio.mjs"], {
    env: { ...process.env, KOSMOS_MCP_URL: `http://127.0.0.1:${upstream.address().port}/mcp`, KOSMOS_MCP_TOKEN: "", KOSMOS_AGENT_NAME: "JEFFREY" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  child.stdout.resume(); child.stderr.resume();
  const metas = [
    { [MCP_META_CLIENT_INFO]: { name: "mcp", version: "1" } },
    {},
    { [MCP_META_CLIENT_INFO]: { name: "jeffrey", version: "2" } },
    { [MCP_META_CLIENT_INFO]: 42 },
    undefined,
  ];
  child.stdin.end(metas.map((_meta, id) => JSON.stringify({ jsonrpc: "2.0", id,
    method: id === 1 ? "ping" : id === 2 ? "tools/call" : "tools/list",
    params: { _meta, ...(id === 2 ? { name: "get_policy", arguments: { agent_name: "jeffrey" } } : {}) },
  })).join("\n") + "\n");
  const [code] = await once(child, "exit");
  assert.equal(code, 0);
  assert.equal(received.length, 5);
  assert.deepEqual(received.slice(0, 3).map(m => m.params._meta[MCP_META_CLIENT_INFO].name), ["JEFFREY", "JEFFREY", "JEFFREY"]);
  assert.equal(received[0].params._meta[MCP_META_CLIENT_INFO].version, "1");
  assert.equal(received[2].params.arguments.agent_name, "JEFFREY");
  assert.equal(received[3].params._meta[MCP_META_CLIENT_INFO], 42);
  assert.equal(received[4].params._meta, undefined);
  assert.equal(received[1].params._meta[MCP_META_PROTOCOL_VERSION], undefined);
  assert.equal(received[1].params._meta[MCP_META_CLIENT_CAPABILITIES], undefined);
});
