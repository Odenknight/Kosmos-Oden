/**
 * Kosmos standalone — live Agent-API feed (GKOS Engine Desktop sidecar).
 *
 * The desktop app "GKOS Engine Desktop" supervises a headless sidecar
 * (`kosmos-agent`, GKOS-Engine desktop-agent.ts) that serves a LOOPBACK-ONLY,
 * read-only, bearer-token agent API on 127.0.0.1:4814. Its `/graph` route
 * returns the exact same KosmosGraph the viewer already renders (see
 * `tryLocalGraphJson` in standalone.ts — this is the same shape, fetched live
 * instead of from a sibling graph.json).
 *
 * This module is the DOM-free, unit-testable core of that feed:
 *   - query-param parsing (`?api=...&token=...`)
 *   - loopback-only address validation (we NEVER add a non-loopback path)
 *   - API-response → viewer-graph normalization
 *   - a connect orchestration with an injectable fetch, so the auth / error /
 *     mapping branches are all testable without a live server.
 *
 * Constraints honored here:
 *   - read-only (only GET /health and GET /graph are ever issued);
 *   - the token lives in memory only — this module never touches storage;
 *   - loopback-only — a non-loopback `api` is refused before any request.
 */

/** Hosts we accept as the local engine. Non-loopback addresses are refused. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export interface ApiFeedParams {
  api: string | null;
  token: string | null;
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
 * Parse `?api=...&token=...` (a raw `location.search`, with or without the
 * leading `?`). Empty/missing values normalize to null.
 */
export function parseApiFeedParams(search: string): ApiFeedParams {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const rawApi = q.get("api");
  const rawToken = q.get("token");
  const api = rawApi ? normalizeApiBase(rawApi) : "";
  const token = rawToken ? rawToken.trim() : "";
  return { api: api || null, token: token || null };
}

/** The two read-only routes the feed uses, derived from an API base. */
export function buildFeedUrls(apiBase: string): { health: string; graph: string } {
  const base = normalizeApiBase(apiBase);
  return { health: `${base}/health`, graph: `${base}/graph` };
}

export interface ViewerGraph {
  nodes: any[];
  links: any[];
  [k: string]: any;
}

/**
 * Coerce a `/graph` response into the shape `app.renderGraph` consumes. The
 * sidecar returns the KosmosGraph directly (`{ nodes, links, ... }`); we also
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
}
export type FetchLike = (url: string, init?: any) => Promise<FetchLikeResponse>;

export interface ConnectResult {
  ok: boolean;
  status?: number;
  error?: string;
  health?: any;
  graph?: ViewerGraph;
}

/**
 * Connect to the sidecar: probe `/health`, then fetch `/graph`. Read-only,
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

  const { health, graph } = buildFeedUrls(api);
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
      error: `Could not reach the engine at ${api}. Is “GKOS Engine Desktop” running? (${e?.message || e})`,
    };
  }
  if (hres.status === 401) {
    return {
      ok: false,
      status: 401,
      error:
        "The engine rejected the token (401). Copy the current bearer token from GKOS Engine Desktop and try again.",
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

  // 2) graph.
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
  return { ok: true, status: 200, health: healthDoc, graph: normalized };
}

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
