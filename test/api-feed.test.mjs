/**
 * Standalone live Agent-API feed tests: query-param parsing, loopback-only
 * validation, /graph response -> viewer-graph mapping, and the connect
 * orchestration's auth/error branches (with an injected fetch, no server).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseApiFeedParams,
  normalizeApiBase,
  isLoopbackApiUrl,
  buildFeedUrls,
  normalizeGraphResponse,
  connectToEngine,
  probeHealth,
} from "../dist/kosmos-api-feed.mjs";

test("parseApiFeedParams: reads api + token, trims, drops trailing slash", () => {
  const p = parseApiFeedParams("?api=http://127.0.0.1:4814/&token=abc123");
  assert.equal(p.api, "http://127.0.0.1:4814");
  assert.equal(p.token, "abc123");
});

test("parseApiFeedParams: tolerates a leading '?'-less search and missing values", () => {
  assert.deepEqual(parseApiFeedParams("api=http://localhost:4814"), { api: "http://localhost:4814", token: null });
  assert.deepEqual(parseApiFeedParams(""), { api: null, token: null });
  assert.deepEqual(parseApiFeedParams("?token=only"), { api: null, token: "only" });
});

test("normalizeApiBase: trims whitespace and trailing slashes", () => {
  assert.equal(normalizeApiBase("  http://127.0.0.1:4814///  "), "http://127.0.0.1:4814");
});

test("isLoopbackApiUrl: accepts loopback hosts only", () => {
  assert.equal(isLoopbackApiUrl("http://127.0.0.1:4814"), true);
  assert.equal(isLoopbackApiUrl("http://localhost:4814"), true);
  assert.equal(isLoopbackApiUrl("http://[::1]:4814"), true);
  assert.equal(isLoopbackApiUrl("https://127.0.0.1:4814"), true);
  // non-loopback / non-http must be refused (no LAN or public capability)
  assert.equal(isLoopbackApiUrl("http://192.168.1.10:4814"), false);
  assert.equal(isLoopbackApiUrl("http://evil.example.com"), false);
  assert.equal(isLoopbackApiUrl("ftp://127.0.0.1"), false);
  assert.equal(isLoopbackApiUrl("not a url"), false);
});

test("buildFeedUrls: derives /health and /graph", () => {
  assert.deepEqual(buildFeedUrls("http://127.0.0.1:4814/"), {
    health: "http://127.0.0.1:4814/health",
    graph: "http://127.0.0.1:4814/graph",
  });
});

test("normalizeGraphResponse: accepts the sidecar's direct KosmosGraph", () => {
  const g = normalizeGraphResponse({ nodes: [{ id: "file:a" }], links: [{ id: "l1" }], stats: { files: 1 } });
  assert.equal(g.nodes.length, 1);
  assert.equal(g.links.length, 1);
});

test("normalizeGraphResponse: unwraps { graph } envelope and aliases edges->links", () => {
  const g = normalizeGraphResponse({ graph: { nodes: [{ id: "n" }], edges: [{ id: "e" }] } });
  assert.equal(g.nodes.length, 1);
  assert.deepEqual(g.links, [{ id: "e" }]);
});

test("normalizeGraphResponse: rejects shapes with no node array", () => {
  assert.equal(normalizeGraphResponse(null), null);
  assert.equal(normalizeGraphResponse({ notes: [] }), null);
  assert.equal(normalizeGraphResponse("nope"), null);
});

/** Build a fake fetch keyed by URL suffix. */
function fakeFetch(routes) {
  return async (url) => {
    for (const [suffix, resp] of Object.entries(routes)) {
      if (url.endsWith(suffix)) {
        if (resp.throw) throw new Error(resp.throw);
        return { ok: resp.status >= 200 && resp.status < 300, status: resp.status, json: async () => resp.body };
      }
    }
    return { ok: false, status: 404, json: async () => ({ error: "not_found" }) };
  };
}

const GRAPH = { nodes: [{ id: "file:a" }, { id: "file:b" }], links: [], stats: { files: 2, folders: 0 } };
const HEALTH = { state: "serving", notes_indexed: 2 };

test("connectToEngine: happy path returns health + normalized graph", async () => {
  const res = await connectToEngine(
    { api: "http://127.0.0.1:4814", token: "tok" },
    fakeFetch({ "/health": { status: 200, body: HEALTH }, "/graph": { status: 200, body: GRAPH } }),
  );
  assert.equal(res.ok, true);
  assert.equal(res.graph.nodes.length, 2);
  assert.equal(res.health.notes_indexed, 2);
});

test("connectToEngine: refuses a non-loopback address before any request", async () => {
  let called = false;
  const res = await connectToEngine(
    { api: "http://10.0.0.5:4814", token: "tok" },
    async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; },
  );
  assert.equal(res.ok, false);
  assert.equal(called, false, "no request may be issued to a non-loopback host");
  assert.match(res.error, /loopback/);
});

test("connectToEngine: 401 on /health -> clear token error", async () => {
  const res = await connectToEngine(
    { api: "http://127.0.0.1:4814", token: "bad" },
    fakeFetch({ "/health": { status: 401, body: { error: "unauthorized" } } }),
  );
  assert.equal(res.ok, false);
  assert.equal(res.status, 401);
  assert.match(res.error, /token/i);
});

test("connectToEngine: unreachable engine (fetch throws) -> graceful message", async () => {
  const res = await connectToEngine(
    { api: "http://127.0.0.1:4814", token: "tok" },
    fakeFetch({ "/health": { throw: "Failed to fetch" } }),
  );
  assert.equal(res.ok, false);
  assert.match(res.error, /Could not reach|running/i);
});

test("connectToEngine: unrecognized /graph shape -> mapping error", async () => {
  const res = await connectToEngine(
    { api: "http://127.0.0.1:4814", token: "tok" },
    fakeFetch({ "/health": { status: 200, body: HEALTH }, "/graph": { status: 200, body: { junk: true } } }),
  );
  assert.equal(res.ok, false);
  assert.match(res.error, /graph shape|nodes/i);
});

test("probeHealth: ok when reachable, not-ok when unreachable or non-loopback", async () => {
  const ok = await probeHealth({ api: "http://127.0.0.1:4814", token: "t" }, fakeFetch({ "/health": { status: 200, body: HEALTH } }));
  assert.equal(ok.ok, true);
  assert.equal(ok.health.notes_indexed, 2);
  const down = await probeHealth({ api: "http://127.0.0.1:4814", token: "t" }, fakeFetch({ "/health": { throw: "down" } }));
  assert.equal(down.ok, false);
  const lan = await probeHealth({ api: "http://192.168.0.2:4814", token: "t" }, fakeFetch({}));
  assert.equal(lan.ok, false);
});
