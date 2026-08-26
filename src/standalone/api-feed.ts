import { normalizeTraversalEvent, type TraversalEventEnvelope } from "./observability";

/**
 * Kosmos standalone — live local GKOS Engine service feed.
 *
 * A compatible GKOS Engine runtime serves a LOOPBACK-ONLY, read-only,
 * bearer-authenticated API on 127.0.0.1:4814. Its `/graph` route
 * returns the exact same GkxGraph the viewer already renders (see
 * `tryLocalGraphJson` in standalone.ts — this is the same shape, fetched live
 * instead of from a sibling graph.json).
 *
 * This module is the DOM-free, unit-testable core of that feed:
 *   - non-secret query-param parsing (`?api=...` only)
 *   - loopback-only address validation (we NEVER add a non-loopback path)
 *   - API-response → viewer-graph normalization
 *   - a connect orchestration with an injectable fetch, so the auth / error /
 *     mapping branches are all testable without a live server.
 *
 * Constraints honored here:
 *   - read-only (only GET service routes are ever issued);
 *   - the token lives in memory only — this module never touches storage;
 *   - loopback-only — a non-loopback `api` is refused before any request.
 */

/** Hosts we accept as the local engine. Non-loopback addresses are refused. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export interface ApiFeedParams {
  api: string | null;
}

/** Trim and drop any trailing slashes from an API base URL. */
export function normalizeApiBase(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

/**
 * True only for an http(s) URL whose host is loopback. This is the guard that
 * keeps the feed loopback-only: a LAN/public address can never be dialed.
 */
export function isLoopbackApiUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  // URL normalizes `[::1]` -> hostname "[::1]"; strip the brackets to compare.
  const host = u.hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  return LOOPBACK_HOSTS.has(host);
}

/**
 * Parse the non-secret `?api=...` convenience. Tokens are deliberately ignored
 * so URLs, browser history, logs, and shortcuts can never become credentials.
 */
export function parseApiFeedParams(search: string): ApiFeedParams {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const rawApi = q.get("api");
  const api = rawApi ? normalizeApiBase(rawApi) : "";
  return { api: api || null };
}

/** Unified read-only service routes used by the standalone viewer. */
export function buildFeedUrls(apiBase: string): { health: string; capabilities: string; graph: string; events: string } {
  const base = normalizeApiBase(apiBase);
  return { health: `${base}/health`, capabilities: `${base}/capabilities`, graph: `${base}/graph`, events: `${base}/events` };
}

export interface ViewerGraph {
  nodes: any[];
  links: any[];
  [k: string]: any;
}

/**
 * Coerce a `/graph` response into the shape `app.renderGraph` consumes. The
 * sidecar returns the GkxGraph directly (`{ nodes, links, ... }`); we also
 * tolerate a `{ graph: {...} }` envelope and an `edges` alias for `links`.
 * Returns null when there is no usable node array.
 */
export function normalizeGraphResponse(json: any): ViewerGraph | null {
  const g =
    json && typeof json === "object" && !Array.isArray(json.nodes) && json.graph
      ? json.graph
      : json;
  if (!g || typeof g !== "object" || !Array.isArray(g.nodes)) return null;
  if (!Array.isArray(g.links)) {
    g.links = Array.isArray(g.edges) ? g.edges : [];
  }
  return g as ViewerGraph;
}

/** Minimal structural view of a fetch Response — lets tests inject a fake. */
export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  json(): Promise<any>;
  body?: ReadableStream<Uint8Array> | null;
  headers?: { get(name: string): string | null };
}
export type FetchLike = (url: string, init?: any) => Promise<FetchLikeResponse>;

export interface ConnectResult {
  ok: boolean;
  status?: number;
  error?: string;
  health?: any;
  capabilities?: ServiceCapabilities;
  graph?: ViewerGraph;
}

export interface ServiceFeatureCapability {
  available: boolean;
  configured: boolean;
  authorized: boolean;
  enabled: boolean;
  reason_codes: string[];
}

export interface ServiceCapabilities {
  schema_version: 1;
  protocol: { id: "gkos-local-service"; version: "1.0.0-draft.1" };
  features: Record<"graph" | "notes" | "graphiti_episodes" | "mcp" | "events" | "proposal_ingress" | "navigation" | "navigation_effects", ServiceFeatureCapability>;
}

export function normalizeCapabilitiesResponse(value: unknown): ServiceCapabilities | null {
  if (!value || typeof value !== "object") return null;
  const v = value as any;
  const exactKeys = (object: any, expected: string[]) => {
    if (!object || typeof object !== "object" || Array.isArray(object)) return false;
    const keys = Object.keys(object).sort(), sorted = expected.slice().sort();
    return keys.length === sorted.length && keys.every((key, index) => key === sorted[index]);
  };
  if (!exactKeys(v, ["schema_version", "protocol", "features"]) || !exactKeys(v.protocol, ["id", "version"])) return null;
  if (v.schema_version !== 1 || v.protocol?.id !== "gkos-local-service" || v.protocol?.version !== "1.0.0-draft.1") return null;
  const featureNames = ["graph", "notes", "graphiti_episodes", "mcp", "events", "proposal_ingress", "navigation", "navigation_effects"];
  if (!exactKeys(v.features, featureNames)) return null;
  for (const name of featureNames) {
    const feature = v.features[name];
    if (!exactKeys(feature, ["available", "configured", "authorized", "enabled", "reason_codes"])) return null;
    if (![feature.available, feature.configured, feature.authorized, feature.enabled].every((item) => typeof item === "boolean")) return null;
    if (!Array.isArray(feature.reason_codes) || feature.reason_codes.length > 8 || new Set(feature.reason_codes).size !== feature.reason_codes.length) return null;
    if (!feature.reason_codes.every((code: unknown) => typeof code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/u.test(code))) return null;
  }
  return v as ServiceCapabilities;
}

/**
 * Connect to the local service: probe `/health`, negotiate `/capabilities`, then
 * fetch `/graph`. Read-only,
 * loopback-only, bearer-auth. Every failure mode returns a human-readable
 * `error` (unreachable, 401, bad shape) so the UI can degrade gracefully —
 * a browser CORS block surfaces here as an unreachable/network error, which
 * is exactly what the "is the engine running / is this a Tauri window?"
 * message covers.
 */
export async function connectToEngine(
  params: { api: string; token: string | null },
  fetchImpl: FetchLike,
): Promise<ConnectResult> {
  const api = normalizeApiBase(params.api);
  if (!isLoopbackApiUrl(api)) {
    return {
      ok: false,
      error:
        "Refusing to connect: the engine address must be loopback (http://127.0.0.1 or http://localhost). Non-loopback addresses are not supported.",
    };
  }

  const { health, capabilities, graph } = buildFeedUrls(api);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (params.token) headers["Authorization"] = `Bearer ${params.token}`;
  const init = { headers, cache: "no-store" as const };

  // 1) health probe — cheapest way to distinguish unreachable vs. 401.
  let hres: FetchLikeResponse;
  try {
    hres = await fetchImpl(health, init);
  } catch (e: any) {
    return {
      ok: false,
      error: `Could not reach the local GKOS Engine service at ${api}. Is it running? (${e?.message || e})`,
    };
  }
  if (hres.status === 401) {
    return {
      ok: false,
      status: 401,
      error:
        "The engine rejected the credential (401). Enter the current viewer credential from the local GKOS Engine service and try again.",
    };
  }
  if (!hres.ok) {
    return { ok: false, status: hres.status, error: `The engine returned HTTP ${hres.status} for /health.` };
  }
  let healthDoc: any = null;
  try {
    healthDoc = await hres.json();
  } catch {
    /* health body is advisory; ignore a non-JSON health response */
  }

  // 2) negotiate protocol/capabilities before accepting graph semantics.
  let cres: FetchLikeResponse;
  try { cres = await fetchImpl(capabilities, init); }
  catch (e: any) { return { ok: false, error: `Connected to the engine, but capability negotiation failed (${e?.message || e}).` }; }
  if (cres.status === 401) return { ok: false, status: 401, error: "The engine rejected the token (401) on /capabilities." };
  if (!cres.ok) return { ok: false, status: cres.status, error: `The engine returned HTTP ${cres.status} for /capabilities.` };
  let capabilityDoc: any;
  try { capabilityDoc = await cres.json(); }
  catch { return { ok: false, error: "The engine's /capabilities response was not valid JSON." }; }
  capabilityDoc = normalizeCapabilitiesResponse(capabilityDoc);
  if (!capabilityDoc) return { ok: false, error: "The engine returned an unrecognized capabilities document." };
  const graphCapability = capabilityDoc.features.graph;
  if (!(graphCapability.available && graphCapability.configured && graphCapability.authorized && graphCapability.enabled)) {
    const reasons = graphCapability.reason_codes.length ? ` (${graphCapability.reason_codes.join(", ")})` : "";
    return { ok: false, error: `The engine graph capability is not enabled for this credential${reasons}.` };
  }

  // 3) graph.
  let gres: FetchLikeResponse;
  try {
    gres = await fetchImpl(graph, init);
  } catch (e: any) {
    return { ok: false, error: `Connected to the engine, but the graph request failed (${e?.message || e}).` };
  }
  if (gres.status === 401) {
    return { ok: false, status: 401, error: "The engine rejected the token (401) on /graph." };
  }
  if (!gres.ok) {
    return { ok: false, status: gres.status, error: `The engine returned HTTP ${gres.status} for /graph.` };
  }
  let graphJson: any;
  try {
    graphJson = await gres.json();
  } catch {
    return { ok: false, error: "The engine's /graph response was not valid JSON." };
  }
  const normalized = normalizeGraphResponse(graphJson);
  if (!normalized) {
    return { ok: false, error: "The engine returned an unrecognized graph shape (no nodes array)." };
  }
  return { ok: true, status: 200, health: healthDoc, capabilities: capabilityDoc, graph: normalized };
}

export interface EventStreamCallbacks {
  onEvent(event: TraversalEventEnvelope): void;
  onState?(state: "connecting" | "connected" | "disconnected"): void;
  onError?(message: string): void;
}

/** Authenticated fetch-stream subscription with bounded reconnect and sequence resume. */
export function subscribeTraversalEvents(
  params: { api: string; token: string }, callbacks: EventStreamCallbacks,
  fetchImpl: typeof fetch = fetch,
): { close(): void; lastSequence(): number | null } {
  const api = normalizeApiBase(params.api); const controller = new AbortController();
  let closed = false, last: number | null = null, eventStreamSession: string | null = null, attempt = 0;
  const run = async () => {
    if (!isLoopbackApiUrl(api)) { callbacks.onError?.("Refusing non-loopback event stream."); return; }
    while (!closed) {
      callbacks.onState?.("connecting");
      const headers: Record<string, string> = { Accept: "text/event-stream", Authorization: `Bearer ${params.token}` };
      if (last != null && eventStreamSession != null) {
        headers["Last-Event-ID"] = String(last);
        headers["GKOS-Event-Session"] = eventStreamSession;
      }
      try {
        const response = await fetchImpl(buildFeedUrls(api).events, { headers, cache: "no-store", signal: controller.signal });
        if (response.status === 409) {
          // The process session changed or the bounded ring no longer retains
          // the acknowledged sequence. Never pretend the gap was replayed.
          last = null; eventStreamSession = null;
          throw new Error("resume reset required; retained traversal events may have been missed, reconnecting at the live tail");
        }
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
        const contentType = response.headers?.get("content-type")?.trim().toLowerCase();
        if (contentType !== "text/event-stream; charset=utf-8") throw new Error("unexpected event-stream content type");
        const responseSession = response.headers?.get("gkos-event-session")?.trim() || "";
        if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(responseSession)) throw new Error("missing or invalid event-stream session");
        if (eventStreamSession != null && responseSession !== eventStreamSession) {
          last = null; eventStreamSession = null;
          throw new Error("event-stream session changed during resume; retained traversal events may have been missed");
        }
        eventStreamSession = responseSession;
        callbacks.onState?.("connected"); attempt = 0;
        const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "";
        while (!closed) {
          const part = await reader.read(); if (part.done) break;
          buffer += decoder.decode(part.value, { stream: true });
          let boundary: number;
          while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
            const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, "");
            const lines = block.split(/\r?\n/);
            const eventLines = lines.filter((line) => line.startsWith("event:"));
            const idLines = lines.filter((line) => line.startsWith("id:"));
            const dataLines = lines.filter((line) => line.startsWith("data:"));
            if (eventLines.length !== 1 || eventLines[0] !== "event: traversal" || idLines.length !== 1 || dataLines.length !== 1) continue;
            const idText = idLines[0].slice(3).trim();
            const streamId = idText == null || idText === "" ? null : Number(idText);
            if (!Number.isSafeInteger(streamId) || Number(streamId) < 0) continue;
            const raw = dataLines[0].slice(5).trimStart();
            if (!raw) continue;
            let parsed: unknown; try { parsed = JSON.parse(raw); } catch { continue; }
            const event = normalizeTraversalEvent(parsed);
            if (!event || event.sequence !== streamId) continue;
            if (last != null && event.sequence <= last) continue;
            callbacks.onEvent(event); last = event.sequence;
          }
        }
      } catch (error: any) {
        if (closed || error?.name === "AbortError") break;
        callbacks.onError?.(`Traversal stream disconnected (${error?.message || error}).`);
      }
      callbacks.onState?.("disconnected");
      if (closed) break;
      const delay = Math.min(10_000, 500 * Math.pow(2, attempt++));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  };
  void run();
  return { close() { closed = true; controller.abort(); }, lastSequence() { return last; } };
}

export * from "./observability";

/** Probe just `/health` (connectivity dot + notes count). Never throws. */
export async function probeHealth(
  params: { api: string; token: string | null },
  fetchImpl: FetchLike,
): Promise<{ ok: boolean; status?: number; health?: any }> {
  const api = normalizeApiBase(params.api);
  if (!isLoopbackApiUrl(api)) return { ok: false };
  const { health } = buildFeedUrls(api);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (params.token) headers["Authorization"] = `Bearer ${params.token}`;
  try {
    const r = await fetchImpl(health, { headers, cache: "no-store" });
    if (!r.ok) return { ok: false, status: r.status };
    let doc: any = null;
    try {
      doc = await r.json();
    } catch {
      /* advisory */
    }
    return { ok: true, status: r.status, health: doc };
  } catch {
    return { ok: false };
  }
}
