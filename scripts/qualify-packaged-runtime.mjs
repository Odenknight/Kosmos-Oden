// Isolated packaged-byte qualification, not real Obsidian/Hermes acceptance.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { once } from "node:events";
import http from "node:http";

const require = createRequire(import.meta.url);
const artifact = readFileSync(new URL("../main.js", import.meta.url));
const stopRegistration = new Error("synthetic host registration boundary");
class Plugin {
  async loadData() { return { agentEnabled: false, agentToken: "synthetic-only-token", agentGraphNamespace: "synthetic-history", defaultSensitivity: "public" }; }
  addSettingTab() {}
  addCommand() { throw stopRegistration; }
}
const obsidian = new Proxy({ Plugin }, { get: (target, key) => target[key] ?? class {} });
const module = { exports: {} };
new Function("require", "module", "exports", artifact.toString())(
  name => name === "obsidian" ? obsidian : require(name), module, module.exports,
);
const plugin = new module.exports.default();
const file = { path: "synthetic.md", name: "synthetic.md", extension: "md", stat: { size: 100, mtime: 1, ctime: 1 } };
const source = "---\nsensitivity: public\n---\n# Packaged recovery fixture\nSynthetic content only.";
let release, stalled = true, reads = 0;
const pending = new Promise(resolve => { release = resolve; });
plugin.app = { vault: {
  getName: () => "Synthetic packaged qualification",
  getMarkdownFiles: () => [file], getFiles: () => [file],
  cachedRead: async () => { reads++; return stalled ? pending : source; },
} };
try { await plugin.onload(); assert.fail("expected synthetic registration boundary"); }
catch (error) { assert.equal(error, stopRegistration); }
assert.ok(plugin.provider && plugin.agentApi, "packaged initialization did not create provider/server");
Object.assign(plugin.agentSettings, { agentEnabled: true, agentPort: 0, agentBindMode: "loopback", agentRequireToken: false });
const server = plugin.agentApi;
const outcomes = [];
const traversals = [];
server.onTraversal = (paths, tool) => traversals.push({ paths, tool });
function request(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.setTimeout(30_000, () => req.destroy(new Error("qualification request timed out")));
    req.on("error", reject);
  });
}
try {
  server.start();
  await once(server.server, "listening");
  let port = server.server.address().port;
  const started = performance.now();
  const fault = await request(port, "/overview");
  assert.equal(fault.status, 504, JSON.stringify(fault.body));
  assert.equal(fault.body.error, "timeout");
  outcomes.push({ step: "stalled-read", status: fault.status, elapsedMs: performance.now() - started });
  assert.equal((await request(port, "/health")).status, 200);
  const refused = await request(port, "/overview");
  assert.equal(refused.status, 503);
  assert.equal(reads, 1, "retry must not create another physical read");
  assert.deepEqual(traversals, [], "failed reads must not emit traversal");
  server.server.closeAllConnections();
  server.stop();
  server.start();
  await once(server.server, "listening");
  port = server.server.address().port;
  assert.equal((await request(port, "/health")).status, 200);
  assert.equal((await request(port, "/overview")).status, 503);
  assert.equal(reads, 1, "server restart must not forget the outstanding physical read");
  stalled = false; release(source);
  await new Promise(resolve => setImmediate(resolve));
  const recovered = await request(port, "/overview");
  assert.equal(recovered.status, 200);
  const search = await request(port, "/notes?q=synthetic");
  assert.equal(search.status, 200);
  assert.ok(JSON.stringify(search.body).includes("synthetic.md"), "recovery search must publish the synthetic source");
  assert.deepEqual(traversals, [{ paths: ["synthetic.md"], tool: "search_notes" }]);
  assert.equal((await request(port, "/overview")).status, 200);
  assert.equal(reads, 2, "warm request should reuse committed source");
  assert.equal(server.inFlight, 0);
  assert.equal(server.perAgentInFlight.size, 0);
  outcomes.push({ step: "physical-retry-refusal", status: refused.status },
    { step: "restart-retains-physical-read", status: 503 },
    { step: "recovered-and-warm", status: recovered.status },
    { step: "observed-search-traversal", count: traversals.length });
  console.log(JSON.stringify({ sha256: createHash("sha256").update(artifact).digest("hex"), bytes: artifact.length, outcomes,
    scope: "Packaged provider/server with synthetic partial host; no Obsidian UI, Hermes, auth-denial or installed-runtime claim" }, null, 2));
} finally {
  release(source);
  server.server?.closeAllConnections();
  server.stop();
}
