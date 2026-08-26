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
  TrafficHeatmap,
  TraversalSessionRecorder,
  TraversalReplay,
  TRAVERSAL_REDACTION,
  subscribeTraversalEvents,
  normalizeCapabilitiesResponse,
} from "../dist/kosmos-api-feed.mjs";

test("parseApiFeedParams: reads only non-secret api and ignores query tokens", () => {
  const p = parseApiFeedParams("?api=http://127.0.0.1:4814/&token=abc123");
  assert.equal(p.api, "http://127.0.0.1:4814");
  assert.equal("token" in p, false);
});

test("parseApiFeedParams: tolerates a leading '?'-less search and missing values", () => {
  assert.deepEqual(parseApiFeedParams("api=http://localhost:4814"), { api: "http://localhost:4814" });
  assert.deepEqual(parseApiFeedParams(""), { api: null });
  assert.deepEqual(parseApiFeedParams("?token=only"), { api: null });
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

test("buildFeedUrls: derives unified service routes", () => {
  assert.deepEqual(buildFeedUrls("http://127.0.0.1:4814/"), {
    health: "http://127.0.0.1:4814/health",
    capabilities: "http://127.0.0.1:4814/capabilities",
    graph: "http://127.0.0.1:4814/graph",
    events: "http://127.0.0.1:4814/events",
  });
});

test("normalizeGraphResponse: accepts the sidecar's direct GkxGraph", () => {
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

test("capability negotiation accepts only the versioned local-service envelope", () => {
  assert.equal(normalizeCapabilitiesResponse(CAPABILITIES), CAPABILITIES);
  assert.equal(normalizeCapabilitiesResponse({ protocol: CAPABILITIES.protocol, features: {} }), null);
  assert.equal(normalizeCapabilitiesResponse({ schema_version: 1, protocol: { id: "other", version: "1" }, features: {} }), null);
  assert.equal(normalizeCapabilitiesResponse({ schema_version: 1, protocol: { id: "gkos-local-service", version: "9.0" }, features: {} }), null);
  assert.equal(normalizeCapabilitiesResponse({ ...CAPABILITIES, unexpected: true }), null);
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
const feature = (enabled) => ({ available: true, configured: enabled, authorized: enabled, enabled, reason_codes: enabled ? [] : ["NOT_CONFIGURED"] });
const CAPABILITIES = { schema_version: 1, protocol: { id: "gkos-local-service", version: "1.0.0-draft.1" }, features: {
  graph: feature(true), notes: feature(true), graphiti_episodes: feature(true), mcp: feature(true), events: feature(true),
  proposal_ingress: feature(false), navigation: feature(false), navigation_effects: feature(false),
} };

test("connectToEngine: happy path returns health + normalized graph", async () => {
  const res = await connectToEngine(
    { api: "http://127.0.0.1:4814", token: "tok" },
    fakeFetch({ "/health": { status: 200, body: HEALTH }, "/capabilities": { status: 200, body: CAPABILITIES }, "/graph": { status: 200, body: GRAPH } }),
  );
  assert.equal(res.ok, true);
  assert.equal(res.graph.nodes.length, 2);
  assert.equal(res.health.notes_indexed, 2);
  assert.equal(res.capabilities.protocol.version, "1.0.0-draft.1");
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
    fakeFetch({ "/health": { status: 200, body: HEALTH }, "/capabilities": { status: 200, body: CAPABILITIES }, "/graph": { status: 200, body: { junk: true } } }),
  );
  assert.equal(res.ok, false);
  assert.match(res.error, /graph shape|nodes/i);
});

const EVENT = {
  schema_version: 1, session_id: "session-1", sequence: 2, offset_ms: 100,
  operation_id: "operation-1", agent_id: "agent-1", agent_label: "Alpha",
  tool: "search_notes", paths: ["Guides/Torpedoes.md"], status: "completed", cost_units: null,
};

test("traffic heat uses monotonic decay and reaches exact zero at its horizon", () => {
  let now = 0; const heat = new TrafficHeatmap(() => now, 1000, 5, 4000);
  heat.visit("file:a"); assert.equal(heat.value("file:a"), 0.25);
  now = 1000; assert.equal(heat.value("file:a"), 0.125);
  now = 4000; assert.equal(heat.value("file:a"), 0); assert.equal(heat.size, 0);
});

test("session recorder is explicit, redacted, bounded by count, and never records replay implicitly", () => {
  const recorder = new TraversalSessionRecorder(2, 10_000);
  assert.equal(recorder.record(EVENT), false);
  recorder.start({ started_at: "2026-08-26T12:00:00.000Z", service_protocol: "draft.1", viewer_version: "0.85", corpus_hash: null, redaction: "caller text discarded", token: "metadata-canary" });
  assert.equal(recorder.record({ ...EVENT, secret: "canary-token", body: "secret note" }), false);
  assert.equal(recorder.record(EVENT), true);
  assert.equal(recorder.record({ ...EVENT, sequence: 3, offset_ms: 200 }), true);
  assert.equal(recorder.record({ ...EVENT, sequence: 4, offset_ms: 300 }), false);
  const exported = recorder.export(); const bytes = JSON.stringify(exported);
  assert.equal(exported.events.length, 2); assert.equal(exported.truncated, true);
  assert.equal(exported.metadata.redaction, TRAVERSAL_REDACTION);
  assert.deepEqual(Object.keys(exported.metadata).sort(), ["corpus_hash", "redaction", "service_protocol", "started_at", "viewer_version"]);
  assert.doesNotMatch(bytes, /canary-token|secret note|caller text discarded|metadata-canary/);
});

test("session metadata and loaded replay bounds fail closed before retaining events", () => {
  const recorder = new TraversalSessionRecorder();
  assert.throws(() => recorder.start({ started_at: "not-a-time", service_protocol: "draft.1", viewer_version: "0.85", corpus_hash: null, redaction: "" }), /metadata/);
  assert.throws(() => recorder.start({ started_at: "2026-08-26T12:00:00.000Z", service_protocol: "draft.1", viewer_version: "0.85", corpus_hash: "A".repeat(64), redaction: "" }), /metadata/);
  const replay = new TraversalReplay(() => 0, 2, 1_500);
  const metadata = { started_at: "2026-08-26T12:00:00.000Z", service_protocol: "draft.1", viewer_version: "0.85", corpus_hash: null, redaction: TRAVERSAL_REDACTION };
  assert.throws(() => replay.load({ schema_version: 1, metadata, events: [EVENT, { ...EVENT, sequence: 3 }, { ...EVENT, sequence: 4 }], truncated: false }), /exceeds 2 events/);
  assert.throws(() => replay.load({ schema_version: 1, metadata, events: [{ ...EVENT, paths: ["x".repeat(1024)] }], truncated: false }), /exceeds 1500 bytes/);
  assert.equal(replay.state.loaded, false);
});

test("event validation rejects encoded traversal and malformed encodings", () => {
  const recorder = new TraversalSessionRecorder();
  recorder.start({ started_at: "2026-08-26T12:00:00.000Z", service_protocol: "draft.1", viewer_version: "0.85", corpus_hash: null, redaction: "" });
  assert.equal(recorder.record({ ...EVENT, paths: ["safe/%2e%2e/secret.md"] }), false);
  assert.equal(recorder.record({ ...EVENT, paths: ["safe/%252e%252e/secret.md"] }), false);
  assert.equal(recorder.record({ ...EVENT, paths: ["safe/%41.md"] }), false);
  assert.equal(recorder.record({ ...EVENT, paths: ["safe/%ZZ.md"] }), false);
  assert.equal(recorder.record({ ...EVENT, paths: ["safe/control\u0001.md"] }), false);
  assert.equal(recorder.record({ ...EVENT, paths: ["safe/CON.txt"] }), false);
  assert.equal(recorder.record({ ...EVENT, paths: ["safe/trailing.md."] }), false);
  assert.equal(recorder.record({ ...EVENT, paths: ["safe/bad?.md"] }), false);
  assert.equal(recorder.status.events, 0);
});

test("replay orders by sequence then offset, supports fake-clock speed and deterministic seek", () => {
  let now = 0; const replay = new TraversalReplay(() => now);
  replay.load({ schema_version: 1, metadata: { started_at: "2026-08-26T12:00:00.000Z", service_protocol: "draft.1", viewer_version: "0.85", corpus_hash: null, redaction: TRAVERSAL_REDACTION }, events: [
    { ...EVENT, sequence: 3, offset_ms: 300 }, { ...EVENT, sequence: 1, offset_ms: 100 }, { ...EVENT, sequence: 2, offset_ms: 200 },
  ], truncated: false });
  replay.setSpeed(2); replay.play(); now = 100;
  assert.deepEqual(replay.tick().map((e) => e.sequence), [1, 2]);
  replay.seek(300); assert.deepEqual(replay.tick().map((e) => e.sequence), [1, 2, 3]);
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

test("event stream uses bearer auth, parses SSE envelopes, and resumes strictly after Last-Event-ID", async () => {
  const encoder = new TextEncoder(); let calls = 0; let subscription;
  const resumed = new Promise((resolve, reject) => {
    const fake = async (_url, init) => {
      calls++;
      try {
        assert.equal(init.headers.Authorization, "Bearer viewer-secret");
        if (calls === 1) {
          assert.equal(init.headers["Last-Event-ID"], undefined);
          return { ok: true, status: 200, headers: { get: () => "text/event-stream; charset=utf-8" }, body: new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(`id: 2\nevent: traversal\ndata: ${JSON.stringify(EVENT)}\n\n`)); controller.close(); } }) };
        }
        assert.equal(init.headers["Last-Event-ID"], "2"); resolve();
        return { ok: true, status: 200, headers: { get: () => "text/event-stream; charset=utf-8" }, body: new ReadableStream({ start() {} }) };
      } catch (error) { reject(error); throw error; }
    };
    subscription = subscribeTraversalEvents({ api: "http://127.0.0.1:4814", token: "viewer-secret" }, {
      onEvent(event) { assert.equal(event.sequence, 2); },
    }, fake);
  });
  await resumed; subscription.close(); assert.equal(subscription.lastSequence(), 2);
});
