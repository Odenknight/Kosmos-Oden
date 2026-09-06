import test from "node:test";
import assert from "node:assert/strict";
import { EngineSearchClient } from "../dist/kosmos-engine-search.mjs";

function service({ denied = false, available = true, verified = true } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    const message = JSON.parse(init.body);
    if (message.method === "notifications/initialized") {
      assert.deepEqual(Object.keys(message).sort(), ["jsonrpc", "method"]);
      return new Response(null, { status: 202 });
    }
    if (message.params?.name === "gkos_search" && denied) return new Response(null, { status: 403 });
    let result;
    if (message.method === "initialize") result = { protocolVersion: "2025-11-25" };
    else if (message.method === "tools/list") result = { tools: [{ name: "gkos_search" }, { name: "gkos_capabilities" }] };
    else if (message.params.name === "gkos_capabilities") result = { structuredContent: { capabilities: [{ capability_name: "note.fulltext.search", available }] } };
    else result = { structuredContent: { extension_version: "observatory.mcp-retrieval.v0", items: [{ canonical_path: "notes/a.md", record_ref: "issued-reference", chunk: { text: "<script>not markup</script>" }, citation: { verified, stale: false, source_digest: "sha256:abc", start_line: 1, end_line: 1 } }], page: { next_cursor: "next-generation-bound", generation: 1 }, retrieval: { projection_freshness: "fresh" } } };
    return Response.json({ jsonrpc: "2.0", id: message.id, result }, { headers: { "Mcp-Session-Id": "synthetic-session" } });
  };
  return { calls, fetch };
}
test("search negotiates separate MCP session and sends issued cursor with bounded query", async () => {
  const server = service(); const client = new EngineSearchClient("http://127.0.0.1:4814", "mcp-only", server.fetch);
  await client.connect(); const page = await client.search("hello"); await client.search("hello", page.page.next_cursor); await client.close();
  assert.equal(page.items[0].canonical_path, "notes/a.md");
  const search = server.calls.filter(c => c.init.body && JSON.parse(c.init.body).params?.name === "gkos_search");
  assert.equal(JSON.parse(search[1].init.body).params.arguments.cursor, "next-generation-bound");
  for (const call of server.calls) { assert.equal(call.init.redirect, "error"); assert.equal(call.init.cache, "no-store"); assert.equal(call.init.headers.Authorization, "Bearer mcp-only"); assert.equal(call.url.includes("mcp-only"), false); }
  assert.equal(server.calls.at(-1).init.method, "DELETE");
});
test("discovered tool without ready capability does not authorize search", async () => {
  const server = service({ available: false }); const client = new EngineSearchClient("http://localhost:4814", "mcp", server.fetch);
  await assert.rejects(client.connect(), /not ready/); await assert.rejects(client.search("hello"), /Connect/); await client.close();
  assert.equal(server.calls.some(c => c.init.body && JSON.parse(c.init.body).params?.name === "gkos_search"), false);
});
test("denied search terminates identity and does not retry or expose credentials", async () => {
  const server = service({ denied: true }); const client = new EngineSearchClient("http://localhost:4814", "private-value", server.fetch);
  await client.connect(); await assert.rejects(client.search("hello"), /connection closed/); const count = server.calls.length;
  await assert.rejects(client.search("hello"), /Connect/); assert.equal(server.calls.length, count); await client.close();
});
test("unverified citations are rejected rather than displayed", async () => {
  const server = service({ verified: false }); const client = new EngineSearchClient("http://localhost:4814", "mcp", server.fetch);
  await client.connect(); await assert.rejects(client.search("hello"), /unverified/); await client.close();
});
