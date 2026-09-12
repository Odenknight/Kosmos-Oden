/**
 * Kosmos Agent API — local HTTP + MCP server core (read-only).
 *
 * Framework-free and Obsidian-free so it is unit-testable in plain Node. The
 * plugin instantiates it with Node's http module and a data provider backed
 * by the same Kosmos Core index the viewer renders (§33): `get_lineage`
 * returns exactly the lineage the cosmos displays, and `graph_at_time` uses
 * the same temporal projector as Chrono (§4.1).
 *
 * Security (§15–§17):
 *  - Tokens come from a cryptographically secure RNG ONLY (32 bytes,
 *    base64url). There is no insecure fallback: without WebCrypto, token
 *    creation fails loudly (§16).
 *  - modern MCP carries version and client identity per request, validated
 *    against the mirrored HTTP headers; there is no handshake or session;
 *    unsupported versions are rejected with the supported version list (§15).
 *  - Request bodies are limited by ACTUAL BYTES (4 MiB default) using a byte
 *    accumulator, not JS string length (§17).
 *  - Host and Origin headers are validated against the bind mode to block
 *    DNS-rebinding and cross-site requests (§17).
 *  - Read-only: REST is GET-only; MCP exposes query tools only. No write
 *    endpoints exist (§18).
 */
import { ProviderError } from "./vault-operations";
import { projectAtTime, type ProjectableNote } from "gkos-engine";
import { attachGraphitiContent, buildGraphitiEpisodes, graphitiIngestionProfile } from "gkos-engine";
import { KOSMOS_VERSION } from "../kosmos-version";
import { getKosmosNavigationManifest, KOSMOS_NAVIGATION_DEFAULT_ENABLED } from "../navigation-integration";
import { ENGINE_VERSION, GKX23_POLICY, GKX23_PROFILE, FAIL_CLOSED_SENSITIVITY_DEFAULT, SENSITIVITY_RANK } from "gkos-engine";
import { engineIdentity, retrievalCapabilities } from "../retrieval/version-metadata";
import type { GkxGraph, GkxNode, GkxSensitivity } from "gkos-engine";
import {
  DEFAULT_NAVIGATION_EFFECTS_SETTINGS,
  migrateNavigationEffectsSettings,
} from "../navigation-effects/settings";
import type {
  NavigationEffectsSettings,
  NavigationEffectsSettingsMigration,
} from "../navigation-effects/types";

// Modern-era MCP only, per owner direction of 2026-09-09. "Modern" is the
// spec's own term for revisions carrying version, identity and capabilities as
// per-request metadata (2026-07-28 and later); "legacy" revisions (2025-11-25
// and earlier) open with an `initialize` handshake and hold a server-issued
// session. This server implements no legacy path and is not dual-era: it mints
// no sessions, hosts no GET stream, and rejects a request that omits the
// per-request metadata.
//
// A legacy client therefore cannot talk to this server and has no
// fall-forward mechanism. The spec asks a modern-only server to name its
// supported versions in any error it returns to `initialize`, so that such a
// client can surface something actionable; mcpDispatch does that.
export const MODERN_MCP_PROTOCOL_VERSION = "2026-07-28";
export const SUPPORTED_MCP_PROTOCOL_VERSIONS = [MODERN_MCP_PROTOCOL_VERSION];
export const LATEST_MCP_PROTOCOL_VERSION = MODERN_MCP_PROTOCOL_VERSION;

/** `_meta` keys the transport defines, spelled exactly as the spec spells
 *  them. These are wire identifiers, not internal names. */
export const MCP_META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
export const MCP_META_CLIENT_INFO = "io.modelcontextprotocol/clientInfo";
export const MCP_META_CLIENT_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
export const MCP_META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

/** Protocol-defined JSON-RPC error codes this transport returns. */
export const MCP_ERR_HEADER_MISMATCH = -32020;
export const MCP_ERR_UNSUPPORTED_PROTOCOL_VERSION = -32022;

/** Cache directives the 2026-07-28 wire REQUIRES on every cacheable result.
 *  The values are the spec's own defaults, chosen deliberately for a
 *  sensitivity-filtered read-only vault: `cacheScope: "private"` forbids a
 *  shared cache (gateway, proxy) serving this response across authorization
 *  contexts -- never "public" here -- and `ttlMs: 0` marks the response
 *  immediately stale so a client re-fetches rather than serving a governance
 *  projection from cache. Both fields are required on the wire; omitting them
 *  makes a spec-strict client reject the result outright. */
export const MCP_CACHE_SCOPE_DEFAULT = "private";
export const MCP_CACHE_TTL_MS_DEFAULT = 0;

/** Methods whose result is a cacheable result on this revision and therefore
 *  MUST carry `cacheScope` + `ttlMs`. Every other implemented method (`ping`,
 *  `tools/call`) returns a non-cacheable result that MUST NOT carry them. */
export const MCP_CACHEABLE_RESULT_METHODS: ReadonlySet<string> = new Set([
  "server/discover",
  "tools/list",
  "resources/list",
  "resources/read",
  "resources/templates/list",
  "prompts/list",
]);

/** Methods whose `Mcp-Name` header mirrors a body field, and which field it
 *  mirrors. Other methods must not carry `Mcp-Name`. */
export const MCP_NAME_SOURCE: Record<string, "name" | "uri"> = {
  "tools/call": "name",
  "resources/read": "uri",
  "prompts/get": "name",
};

/** Request-body cap in BYTES (4 MiB). Documented unit: bytes, not JS chars. */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

export type AgentBindMode = "localhost" | "lan";

/** Settings schema version — bump when the shape changes so old data migrates (Doc1 §3.7). */
export const AGENT_SETTINGS_SCHEMA = 9;

export interface AgentSettings {
  /** Settings schema version for migration on load. */
  schemaVersion?: number;
  agentEnabled: boolean;
  agentPort: number;
  agentToken: string;
  agentRequireToken: boolean;
  agentBindMode: AgentBindMode;
  /** Highest GKX sensitivity readable through the connector. */
  agentSensitivityCeiling: GkxSensitivity;
  /** Fail-closed effective sensitivity for a note that declares none (and has no
   *  GKX projection). Governs how unlabeled notes are classified by the
   *  network-facing read gate. Defaults to the engine's fail-closed level
   *  ("secret"). The engine may RAISE effective sensitivity, never lower it. */
  defaultSensitivity: GkxSensitivity;
  /** Persistent opaque suffix for the Graphiti assertion namespace. */
  agentGraphNamespace: string;
  /** Accept `?token=` query authentication. Deprecated, OFF by default (Doc1 §3.6);
   *  always rejected in LAN mode regardless of this flag. */
  agentAllowQueryToken: boolean;
  /** Opt into GKOS-Engine 2.1 canonical-five Navigation center discovery. */
  navigationEnabled: boolean;
  /**
   * Separately versioned Navigation Effects settings. These settings describe
   * operator intent only; defaults expose no writer and enable no effect.
   */
  navigationEffects: NavigationEffectsSettings;
  /** Maintain portable ISO-8601 UTC created_at/updated_at note fields. */
  noteTimestampsEnabled: boolean;
  /** false (default) = UTC Zulu; true = local ISO-8601 with a numeric ±HH:MM offset. */
  timestampUseLocalTimezone: boolean;
  /** Frontmatter key for the creation stamp (default "created_at"). */
  timestampCreatedKey: string;
  /** Frontmatter key for the modification stamp (default "updated_at"). */
  timestampUpdatedKey: string;
  /** Graphiti 0.29 combined extraction is opt-in until benchmarked. */
  graphitiCombinedExtraction: boolean;
  /** Add deterministic saga hints to exported episodes. */
  graphitiSagaMapping: boolean;
  gkxEnrichmentProvider: "none" | "local" | "lan" | "cloud";
  gkxEnrichmentEndpoint: string;
  gkxEnrichmentModel: string;
  gkxEnrichmentApiKeyEnv: string;
  gkxEnrichmentMaxNotes: number;
  gkxEnrichmentMaxParagraphs: number;
  gkxEnrichmentMaxInputChars: number;
  gkxEnrichmentMaxTotalInputChars: number;
  gkxEnrichmentMaxSuggestions: number;
  gkxEnrichmentTimeoutMs: number;
  gkxEnrichmentCloudCeiling: "public" | "internal";
  gkxEnrichmentLanCeiling: "public" | "internal" | "confidential";
  /** Custom glob-style exclusions used only by GKX migration/enrichment. */
  gkxExcludePatterns: string[];
  /** Opt-in exact/common developer and agent-control file preset. */
  gkxDeveloperExclusions: boolean;
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  schemaVersion: AGENT_SETTINGS_SCHEMA,
  agentEnabled: false,
  agentPort: 4816,
  agentToken: "",
  agentRequireToken: true,
  agentBindMode: "localhost",
  agentSensitivityCeiling: "internal",
  defaultSensitivity: FAIL_CLOSED_SENSITIVITY_DEFAULT,
  agentGraphNamespace: "",
  agentAllowQueryToken: false,
  navigationEnabled: KOSMOS_NAVIGATION_DEFAULT_ENABLED,
  navigationEffects: {
    ...DEFAULT_NAVIGATION_EFFECTS_SETTINGS,
    policyRef: { ...DEFAULT_NAVIGATION_EFFECTS_SETTINGS.policyRef },
  },
  noteTimestampsEnabled: true,
  timestampUseLocalTimezone: false,
  timestampCreatedKey: "created_at",
  timestampUpdatedKey: "updated_at",
  graphitiCombinedExtraction: false,
  graphitiSagaMapping: false,
  gkxEnrichmentProvider: "none",
  gkxEnrichmentEndpoint: "http://127.0.0.1:11434/v1/chat/completions",
  gkxEnrichmentModel: "",
  gkxEnrichmentApiKeyEnv: "",
  gkxEnrichmentMaxNotes: 25,
  gkxEnrichmentMaxParagraphs: 4,
  gkxEnrichmentMaxInputChars: 4000,
  gkxEnrichmentMaxTotalInputChars: 50000,
  gkxEnrichmentMaxSuggestions: 12,
  gkxEnrichmentTimeoutMs: 30000,
  gkxEnrichmentCloudCeiling: "public",
  gkxEnrichmentLanCeiling: "internal",
  gkxExcludePatterns: [],
  gkxDeveloperExclusions: false,
};

const navigationEffectsMigrations = new WeakMap<AgentSettings, NavigationEffectsSettingsMigration>();

/** Return the retained repair diagnostics for this in-memory settings instance. */
export function getNavigationEffectsSettingsMigration(settings: AgentSettings): NavigationEffectsSettingsMigration {
  return navigationEffectsMigrations.get(settings) ?? migrateNavigationEffectsSettings(settings.navigationEffects);
}

/** Migrate persisted settings from any prior schema to the current one (Doc1 §3.7). */
export function migrateAgentSettings(raw: any): AgentSettings {
  // A missing nested value is an older/fresh install, not a repair condition.
  // Supplied malformed values are sanitized by the dedicated fail-closed
  // migrator and their diagnostics remain associated with this in-memory object.
  const navigationEffectsMigration = migrateNavigationEffectsSettings(raw?.navigationEffects);
  const s: AgentSettings = Object.assign({}, DEFAULT_AGENT_SETTINGS, raw || {});
  s.navigationEffects = navigationEffectsMigration.settings;
  // v1 had no agentAllowQueryToken and accepted query tokens implicitly. Migrating
  // to v2 turns that OFF by default; the user can re-enable it explicitly.
  if (!raw || raw.schemaVersion == null) s.agentAllowQueryToken = false;
  if (!raw || !["public", "internal", "restricted", "confidential", "regulated", "phi", "secret"].includes(raw.agentSensitivityCeiling)) {
    // The read ceiling remains internal by default. Engine 2.0 independently
    // fails missing or invalid GKX sensitivity closed to secret.
    s.agentSensitivityCeiling = "internal";
  }
  // Default sensitivity for unlabeled notes fails closed to "secret" unless a
  // valid seven-level value was persisted. Validated against the engine's frozen
  // vocabulary (no hardcoded duplicate list).
  if (!raw || !Object.prototype.hasOwnProperty.call(SENSITIVITY_RANK, s.defaultSensitivity)) {
    s.defaultSensitivity = FAIL_CLOSED_SENSITIVITY_DEFAULT;
  }
  if (!["none", "local", "lan", "cloud"].includes(s.gkxEnrichmentProvider)) s.gkxEnrichmentProvider = "none";
  if (!["public", "internal"].includes(s.gkxEnrichmentCloudCeiling)) s.gkxEnrichmentCloudCeiling = "public";
  if (!["public", "internal", "confidential"].includes(s.gkxEnrichmentLanCeiling)) s.gkxEnrichmentLanCeiling = "internal";
  s.gkxExcludePatterns = Array.isArray(s.gkxExcludePatterns) ? s.gkxExcludePatterns.map(String).slice(0, 200) : [];
  s.gkxDeveloperExclusions = s.gkxDeveloperExclusions === true;
  s.navigationEnabled = s.navigationEnabled === true;
  s.noteTimestampsEnabled = s.noteTimestampsEnabled !== false;
  s.timestampUseLocalTimezone = s.timestampUseLocalTimezone === true;
  s.timestampCreatedKey = typeof s.timestampCreatedKey === "string" && s.timestampCreatedKey.trim() ? s.timestampCreatedKey.trim() : "created_at";
  s.timestampUpdatedKey = typeof s.timestampUpdatedKey === "string" && s.timestampUpdatedKey.trim() ? s.timestampUpdatedKey.trim() : "updated_at";
  s.graphitiCombinedExtraction = s.graphitiCombinedExtraction === true;
  s.graphitiSagaMapping = s.graphitiSagaMapping === true;
  s.gkxEnrichmentMaxNotes = Math.max(1, Math.min(500, Number(s.gkxEnrichmentMaxNotes) || 25));
  s.gkxEnrichmentMaxParagraphs = Math.max(1, Math.min(8, Number(s.gkxEnrichmentMaxParagraphs) || 4));
  s.gkxEnrichmentMaxInputChars = Math.max(400, Math.min(12000, Number(s.gkxEnrichmentMaxInputChars) || 4000));
  s.gkxEnrichmentMaxTotalInputChars = Math.max(4000, Math.min(250000, Number(s.gkxEnrichmentMaxTotalInputChars) || 50000));
  s.gkxEnrichmentMaxSuggestions = Math.max(1, Math.min(24, Number(s.gkxEnrichmentMaxSuggestions) || 12));
  s.gkxEnrichmentTimeoutMs = Math.max(5000, Math.min(120000, Number(s.gkxEnrichmentTimeoutMs) || 30000));
  s.schemaVersion = AGENT_SETTINGS_SCHEMA;
  navigationEffectsMigrations.set(s, navigationEffectsMigration);
  return s;
}

/** Output caps returned by the read-only API (Doc2 §5.6). */
export const MAX_NOTE_CONTENT_CHARS = 200_000;
export const MAX_SEARCH_RESULTS = 200;
export const MAX_EPISODES = 50_000;
export const DEFAULT_EPISODE_PAGE = 20;
export const MAX_EPISODE_PAGE = 100;

/** LAN request-rate limit; the global concurrency bound includes loopback. */
export const RATE_WINDOW_MS = 10_000;
export const RATE_MAX_REQUESTS = 240;      // ~24 req/s sustained per client
export const MAX_CONCURRENT_REQUESTS = 24;
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Concurrency Mitigation 4 (fairness): cap the in-flight requests any single
 * agent may hold, so one agent's bulk/background work (e.g. a large
 * export_graphiti_episodes) cannot monopolize throughput and starve another
 * agent's interactive query. Applies to ALL clients (local agents are the
 * intended fairness case), keyed by the agent identity behind the request.
 * Generous by design — interactive use never reaches it.
 */
export const MAX_CONCURRENT_PER_AGENT = 12;

/** Agent identity records (per-agent trail colour/label + fairness key).
 *  Modern MCP has no protocol session, so identity is derived per request from
 *  `_meta` clientInfo.name and this map only *remembers* the trail colour
 *  already assigned to that name, keeping it stable across requests. It is not
 *  a session: it grants nothing, is never echoed to the client, and losing an
 *  entry costs only colour stability. Bounded + TTL'd so it cannot grow
 *  unbounded. */
export const AGENT_SESSION_TTL_MS = 30 * 60_000;
export const MAX_AGENT_SESSIONS = 64;

class McpRpcError extends Error {
  code: number;
  data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

/**
 * Generate an auth token from a cryptographically secure source (§16).
 * 32 random bytes, base64url-encoded. Throws when no secure RNG exists —
 * never silently downgrades to Math.random().
 */
export function makeToken(): string {
  const c: any = (globalThis as any).crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error(
      "Kosmos-Oden: no cryptographically secure random source (crypto.getRandomValues) is available; refusing to create an insecure token."
    );
  }
  const bytes = new Uint8Array(32);
  c.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === "function"
    ? btoa(bin)
    : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface AgentDataProvider {
  /** The shared graph snapshot — the same one the viewer renders (§33). */
  getGraph(): Promise<GkxGraph>;
  /** Note body with frontmatter stripped, or null when unknown. */
  getNoteContent(path: string): Promise<string | null>;
  vaultName(): string;
  /** Opaque stable-ish identity used to disambiguate Graphiti namespaces. */
  vaultIdentity?(): string;
  /** Extra hostnames (LAN IPs) accepted in Host/Origin checks when binding to LAN. */
  lanAddresses(): string[];
}

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);

interface AgentSession {
  name: string;
  visualId: string;
  at: number;
  protocolVersion: string;
}

export class KosmosAgentServer {
  settings: AgentSettings;
  provider: AgentDataProvider;
  private http: any;
  server: any = null;
  status = "stopped";
  private inFlight = 0;
  private epoch = 0;
  private activeRequests = new Set<(reason?: "timeout" | "provider_unavailable") => void>();
  private hits = new Map<string, number[]>(); // client -> recent request timestamps
  private lastSweep = -Infinity; // last time stale client keys were swept from `hits`
  private perAgentInFlight = new Map<string, number>(); // agent identity -> in-flight count (Mitigation 4)
  private sessions = new Map<string, AgentSession>();
  private lanCache: { at: number; ips: string[] } = { at: 0, ips: [] }; // Host validation runs per request; cache the NIC scan
  /** Fired with the note paths one query touched, so the viewer can render a
   *  live agent-traversal trail. Emission is post-hoc from result objects
   *  (queries stay pure) and capped per tool so a broad result never floods
   *  the halo budget (v0.5.1 behavior). vault_overview / export / diagnostics
   *  are not reported — lighting up the entire vault isn't a trail. MCP calls
   *  include a separate server-minted visual identity; REST calls omit it. */
  onTraversal?: (paths: string[], tool: string, agent?: string, agentId?: string) => void;

  /** Paths a query result touched, for the live traversal overlay (best-effort, capped). */
  private traversalPaths(tool: string, r: any): string[] {
    try {
      const cap = (a: any[], n: number) => a.slice(0, n).map((x: any) => x && x.path).filter(Boolean);
      if (!r || r.error) return [];
      if (tool === "get_note") return r.path ? [r.path] : [];
      if (tool === "get_lineage") return cap(r.chain || [], 12);
      if (tool === "get_related") return [r.for, ...cap([...(r.semantic || []), ...(r.outgoing || []), ...(r.backlinks || [])], 10)].filter(Boolean);
      if (tool === "search_notes") return cap(r.results || [], 8);
      if (tool === "graph_at_time") return cap(r.valid || [], 6);
      return [];
    } catch (_) { return []; }
  }

  emitTraversal(tool: string, r: any, agent?: string, agentId?: string): void {
    if (!this.onTraversal) return;
    const paths = this.traversalPaths(tool, r);
    if (paths.length) { try { this.onTraversal(paths, tool, agent, agentId); } catch (_) { /* never break a request */ } }
  }

  /* ---------------- agent identity (per-agent trail + fairness) ---------------- */

  /** Remember (or refresh) the trail identity for a modern client name and
   *  return its key. Prunes expired records and bounds the map size. */
  private pruneSessions(now = Date.now()): void {
    for (const [k, v] of this.sessions) if (now - v.at > AGENT_SESSION_TTL_MS) this.sessions.delete(k);
  }

  /** Idempotent per cleaned client name: the same name keeps the same trail
   *  colour across requests, which is what makes a stateless transport still
   *  show one agent as one agent. Keyed by the cleaned name rather than a
   *  minted token because there is no session to hang a token on, and a
   *  client-supplied token could otherwise be used to borrow another
   *  caller's identity. Two callers reporting the same name are therefore one
   *  identity; nothing in this revision can separate them. */
  private registerSession(name: string, protocolVersion: string): string {
    const now = Date.now();
    this.pruneSessions(now);
    const key = this.cleanAgentName(name);
    const existing = this.sessions.get(key);
    if (existing) { existing.at = now; existing.protocolVersion = protocolVersion; return key; }
    while (this.sessions.size >= MAX_AGENT_SESSIONS) { const first = this.sessions.keys().next().value; if (first === undefined) break; this.sessions.delete(first); }
    let visualId = "";
    do { visualId = `agent-${makeToken().slice(0, 22)}`; }
    while (Array.from(this.sessions.values()).some((session) => session.visualId === visualId));
    this.sessions.set(key, { name: key, visualId, at: now, protocolVersion });
    return key;
  }

  private getSession(id: string): AgentSession | null {
    this.pruneSessions();
    const session = this.sessions.get(id);
    if (!session) return null;
    session.at = Date.now();
    return session;
  }

  /** Trim an agent name/User-Agent to a short, safe display label. */
  private cleanAgentName(s: unknown): string {
    const raw = String(s ?? "").trim();
    if (!raw) return "agent";
    // Preserve designated multi-word names; labels are rendered with textContent.
    return raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").slice(0, 80) || "agent";
  }

  /** Best-effort identity of the agent behind a request. Modern MCP carries no
   *  session, so an MCP caller is identified from `_meta` clientInfo.name by
   *  mcpIdentity(); this remains the fallback for the REST surface and for a
   *  request whose metadata carried no usable name. `Mcp-Session-Id` is
   *  deliberately not consulted: this revision removed protocol sessions.
   *  Both names and User-Agent labels are self-reported, never authority. */
  agentLabel(req: any): string {
    return this.cleanAgentName(req?.headers?.["user-agent"]);
  }

  /** Decode the spec's Base64 sentinel form `=?base64?<b64>?=`, else return the
   *  value unchanged. Applies to `Mcp-Name` and `Mcp-Param-*`, which clients
   *  must encode this way when a value is not header-safe. Markers are
   *  case-sensitive and lowercase. */
  static decodeHeaderSentinel(raw: string): string | null {
    if (!(raw.startsWith("=?base64?") && raw.endsWith("?=") && raw.length >= 11)) return raw;
    const b64 = raw.slice(9, -2);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return null;
    try {
      const buf = Buffer.from(b64, "base64");
      if (buf.toString("base64").replace(/=+$/, "") !== b64.replace(/=+$/, "")) return null;
      return buf.toString("utf8");
    } catch (_) { return null; }
  }

  /** Identity of a modern MCP caller, from the request body's `_meta`. */
  mcpIdentity(parsed: any, req: any): { agent: string; agentId?: string } {
    const info = parsed?.params?._meta?.[MCP_META_CLIENT_INFO];
    const name = info && typeof info === "object" && typeof info.name === "string" ? info.name : "";
    if (!name.trim()) return { agent: this.agentLabel(req) };
    const key = this.registerSession(name, MODERN_MCP_PROTOCOL_VERSION);
    const rec = this.getSession(key);
    return { agent: rec?.name ?? this.cleanAgentName(name), agentId: rec?.visualId };
  }

  /** Validate the mirrored request-metadata headers against the body.
   *  Returns null when the request conforms, else the JSON-RPC error to send
   *  with HTTP 400. Header names are compared case-insensitively by Node
   *  (already lowercased); header *values* are case-sensitive per the spec. */
  validateRequestMetadata(req: any, parsed: any): { code: number; message: string; data?: unknown } | null {
    const header = (k: string) => {
      const v = req?.headers?.[k];
      return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
    };
    const method = typeof parsed?.method === "string" ? parsed.method : undefined;
    const meta = parsed?.params?._meta;

    const protocolHeader = header("mcp-protocol-version");
    if (protocolHeader === undefined) {
      return { code: MCP_ERR_HEADER_MISMATCH, message: "Header mismatch: MCP-Protocol-Version header is required" };
    }
    const protocolBody = meta && typeof meta === "object" ? meta[MCP_META_PROTOCOL_VERSION] : undefined;
    if (typeof protocolBody !== "string") {
      return {
        code: -32602,
        message: `Invalid params: params._meta["${MCP_META_PROTOCOL_VERSION}"] is required and must be a string`,
      };
    }
    if (protocolHeader !== protocolBody) {
      return {
        code: MCP_ERR_HEADER_MISMATCH,
        message: `Header mismatch: MCP-Protocol-Version header value '${protocolHeader}' does not match body value '${protocolBody}'`,
      };
    }
    // Version is checked only after header/body agreement, so a disagreeing
    // request cannot pick which value gets version-checked.
    if (!SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(protocolBody)) {
      return {
        code: MCP_ERR_UNSUPPORTED_PROTOCOL_VERSION,
        message: "Unsupported protocol version",
        data: { supported: [...SUPPORTED_MCP_PROTOCOL_VERSIONS], requested: protocolBody },
      };
    }

    const methodHeader = header("mcp-method");
    if (methodHeader === undefined) {
      return { code: MCP_ERR_HEADER_MISMATCH, message: "Header mismatch: Mcp-Method header is required" };
    }
    if (methodHeader !== method) {
      return {
        code: MCP_ERR_HEADER_MISMATCH,
        message: `Header mismatch: Mcp-Method header value '${methodHeader}' does not match body value '${String(method)}'`,
      };
    }

    const nameField = method && Object.hasOwn(MCP_NAME_SOURCE, method) ? MCP_NAME_SOURCE[method] : undefined;
    const nameHeaderRaw = header("mcp-name");
    if (nameField) {
      if (nameHeaderRaw === undefined) {
        return { code: MCP_ERR_HEADER_MISMATCH, message: `Header mismatch: Mcp-Name header is required for ${method}` };
      }
      const decoded = KosmosAgentServer.decodeHeaderSentinel(nameHeaderRaw);
      if (decoded === null) {
        return { code: MCP_ERR_HEADER_MISMATCH, message: "Header mismatch: Mcp-Name header value is not valid Base64 sentinel encoding" };
      }
      const bodyValue = parsed?.params?.[nameField];
      if (typeof bodyValue !== "string" || decoded !== bodyValue) {
        return {
          code: MCP_ERR_HEADER_MISMATCH,
          message: `Header mismatch: Mcp-Name header value '${decoded}' does not match body value '${String(bodyValue)}'`,
        };
      }
    } else if (nameHeaderRaw !== undefined) {
      return {
        code: MCP_ERR_HEADER_MISMATCH,
        message: `Header mismatch: Mcp-Name header must not be sent for ${String(method)}`,
      };
    }
    // No tool parameter carries an x-mcp-header annotation, so this server
    // designates no Mcp-Param-* header and must not expect one. An unrecognised
    // Mcp-Param-* header is forwarded and ignored, as RFC 9110 requires.
    const capabilities = meta?.[MCP_META_CLIENT_CAPABILITIES];
    if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) {
      return { code: -32602, message: `Invalid params: params._meta["${MCP_META_CLIENT_CAPABILITIES}"] is required and must be an object` };
    }
    const info = meta?.[MCP_META_CLIENT_INFO];
    if (info !== undefined && (!info || typeof info !== "object" || Array.isArray(info) || typeof info.name !== "string" || typeof info.version !== "string")) {
      return { code: -32602, message: "Invalid params: clientInfo must contain string name and version" };
    }
    return null;
  }

  constructor(http: any, settings: AgentSettings, provider: AgentDataProvider, private operationTimeoutMs = 25_000) {
    this.http = http;
    this.settings = settings;
    this.provider = provider;
  }

  get bindHost(): string { return this.settings.agentBindMode === "lan" ? "0.0.0.0" : "127.0.0.1"; }
  get url(): string { return `http://127.0.0.1:${this.settings.agentPort}`; }

  /** LAN mode must never run without authentication (Doc1 §3.8, Doc2 §5.3). */
  private lanNeedsAuthButHasNone(): boolean {
    if (this.settings.agentBindMode !== "lan") return false;
    return !this.settings.agentRequireToken || !this.settings.agentToken;
  }

  start(onError?: (msg: string) => void): void {
    if (this.server) this.stop();
    if (!this.http) { this.status = "unavailable (no http module)"; return; }
    if (this.lanNeedsAuthButHasNone()) {
      this.status = "error: LAN mode requires an auth token — enable 'Require auth token' and generate one before binding to the network";
      onError?.(this.status);
      return; // fail closed: never expose the vault to the LAN without auth
    }
    this.inFlight = 0;
    this.hits.clear();
    this.perAgentInFlight.clear();
    this.sessions.clear();
    const srv = this.http.createServer((req: any, res: any) => {
      this.handle(req, res).catch((e: any) => {
        try {
          res.writeHead(500, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          res.end(JSON.stringify({ error: String(e?.message || e) }));
        } catch (_) { /* response already closed */ }
      });
    });
    // Per-connection socket timeout backstops slow-loris style stalls (Doc2 §5.4).
    if (typeof srv.setTimeout === "function") srv.setTimeout(REQUEST_TIMEOUT_MS);
    srv.on("error", (e: any) => {
      if (this.server !== srv) return;
      this.stop();
      this.status = "error: " + (e?.code === "EADDRINUSE" ? `port ${this.settings.agentPort} is busy — pick another port in settings` : (e?.message || e));
      onError?.(this.status);
    });
    this.server = srv;
    srv.listen(this.settings.agentPort, this.bindHost, () => { if (this.server === srv) this.status = "running"; });
  }

  stop(): void {
    for (const finish of [...this.activeRequests]) finish("provider_unavailable");
    this.epoch++;
    try { this.server && this.server.close(); } catch (_) { /* already closed */ }
    this.server = null;
    this.status = "stopped";
    this.inFlight = 0;
    this.hits.clear();
    this.perAgentInFlight.clear();
    this.sessions.clear();
  }

  /** Constant-time string comparison — no early return on first mismatch (Doc1 §3.6). */
  private timingSafeEqual(a: string, b: string): boolean {
    const abuf = Buffer.from(String(a), "utf8");
    const bbuf = Buffer.from(String(b), "utf8");
    // Compare against a fixed-length digest so length itself does not leak via timing.
    const pad = Math.max(abuf.length, bbuf.length, 1);
    let diff = abuf.length ^ bbuf.length;
    for (let i = 0; i < pad; i++) diff |= (abuf[i] ?? 0) ^ (bbuf[i] ?? 0);
    return diff === 0;
  }

  /** Global admission bound, then a LAN-only sliding-window rate limit. */
  private rateLimited(req: any): { limited: boolean; reason?: string } {
    if (this.inFlight >= MAX_CONCURRENT_REQUESTS) return { limited: true, reason: "too many concurrent requests" };
    const remote = String(req.socket?.remoteAddress || "");
    const isLoopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1" || remote === "";
    if (isLoopback) return { limited: false }; // local agents are trusted for throughput
    const now = performance.now();
    // Bounded housekeeping: periodically drop client keys whose timestamps are all stale so the
    // map can't grow one permanent entry per distinct LAN client IP over a long-running server.
    this.sweepStaleHits(now);
    const arr = (this.hits.get(remote) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (arr.length >= RATE_MAX_REQUESTS) { this.hits.set(remote, arr); return { limited: true, reason: "rate limit exceeded" }; }
    arr.push(now);
    this.hits.set(remote, arr);
    return { limited: false };
  }

  /** Drop client keys whose recent-hit windows have fully expired. Runs at most once per window. */
  private sweepStaleHits(now: number): void {
    if (now - this.lastSweep < RATE_WINDOW_MS) return;
    this.lastSweep = now;
    for (const [key, arr] of this.hits) {
      if (!arr.some((t) => now - t < RATE_WINDOW_MS)) this.hits.delete(key);
    }
  }

  /* ---------------- security gates ---------------- */

  private allowedHostnames(): Set<string> {
    const allowed = new Set(LOCAL_HOSTNAMES);
    if (this.settings.agentBindMode === "lan") {
      const now = Date.now();
      if (now - this.lanCache.at > 60_000) this.lanCache = { at: now, ips: this.provider.lanAddresses() };
      for (const ip of this.lanCache.ips) allowed.add(ip.toLowerCase());
    }
    return allowed;
  }

  /** Host-header validation (DNS-rebinding defence, §17). */
  hostAllowed(hostHeader: string | undefined): boolean {
    if (!hostHeader) return false;
    let hostname = String(hostHeader).trim().toLowerCase();
    // strip port — handle [v6]:port and host:port
    const v6 = /^\[([^\]]+)\](?::\d+)?$/.exec(hostname);
    if (v6) hostname = v6[1];
    else if (hostname.includes(":")) hostname = hostname.split(":")[0];
    return this.allowedHostnames().has(hostname);
  }

  /** Origin validation: absent = non-browser client (allowed); otherwise must be local (§17). */
  originAllowed(originHeader: string | undefined): boolean {
    if (originHeader == null || originHeader === "") return true;
    const o = String(originHeader).trim().toLowerCase();
    if (o === "null") return false; // opaque origins (sandboxed/file iframes of arbitrary sites)
    try {
      const u = new URL(o);
      return this.allowedHostnames().has(u.hostname);
    } catch {
      return false;
    }
  }

  authorized(req: any, urlObj: URL): boolean {
    const s = this.settings;
    if (!s.agentRequireToken) return true;
    if (!s.agentToken) return false;
    const token = s.agentToken;
    // Header auth is the documented default (Doc1 §3.6). Constant-time compare.
    const h = String(req.headers["authorization"] || "");
    if (h.toLowerCase().startsWith("bearer ") && this.timingSafeEqual(h.slice(7).trim(), token)) return true;
    if (this.timingSafeEqual(String(req.headers["x-api-key"] || ""), token)) return true;
    // Query-string tokens are deprecated: opt-in only, and NEVER accepted in LAN
    // mode (query strings leak through history/proxies/logs, Doc1 §3.6).
    if (s.agentAllowQueryToken && s.agentBindMode !== "lan") {
      const q = urlObj.searchParams.get("token");
      if (q != null && this.timingSafeEqual(q, token)) return true;
    }
    return false;
  }

  /** Read the body with a BYTE limit (§17): received_bytes > limit -> reject.
   *  On rejection the request stream is paused (not destroyed) so the 413
   *  response can still reach the client; the connection closes after it. */
  readBody(req: any, limit = MAX_BODY_BYTES): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: any[] = []; let receivedBytes = 0, done = false;
      const cleanup = () => { req.removeListener("data", onData); req.removeListener("end", onEnd); req.removeListener("error", onError); req.removeListener("aborted", onAbort); req.removeListener("kosmos-operation-ended", onAbort); };
      const onError = (error: any) => { if (!done) { done = true; cleanup(); reject(error); } };
      const onAbort = () => { req.pause?.(); onError(new ProviderError("provider_unavailable")); req.once?.("error", () => {}); };
      const onEnd = () => { if (!done) { done = true; cleanup(); resolve(Buffer.concat(chunks).toString("utf8")); } };
      const onData = (chunk: any) => {
        receivedBytes += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
        if (receivedBytes > limit) { req.pause(); onError(Object.assign(new Error(`body too large (limit ${limit} bytes)`), { statusCode: 413 })); return; }
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      };
      req.on("data", onData); req.on("end", onEnd); req.on("error", onError); req.on("aborted", onAbort); req.on("kosmos-operation-ended", onAbort);
    });
  }

  json(res: any, code: number, obj: any, extraHeaders?: Record<string, string>): void {
    const body = JSON.stringify(obj, null, 2);
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(extraHeaders || {}) });
    res.end(body);
  }

  /* ---------------- shared query helpers (one graph, §33) ---------------- */

  private sensitivityRank(value: GkxSensitivity | undefined): number {
    // Unlabeled notes fail closed to the configured default sensitivity (the
    // engine's "secret" out of the box); an unknown value ranks as secret.
    return SENSITIVITY_RANK[value || this.settings.defaultSensitivity] ?? SENSITIVITY_RANK.secret;
  }

  private canRead(n: GkxNode): boolean {
    const effective = n.gkx?.projection?.effective.sensitivity;
    return this.sensitivityRank(typeof effective === "string" ? effective as GkxSensitivity : n.gkx?.sensitivity) <= this.sensitivityRank(this.settings.agentSensitivityCeiling);
  }

  private fileNodes(graph: GkxGraph): GkxNode[] {
    return graph.nodes.filter((n) => n.kind === "file" && this.canRead(n));
  }

  private visibleTemporal(
    n: GkxNode,
    graph: GkxGraph,
    visible = new Set(this.fileNodes(graph).map((x) => x.id)),
    byId = new Map(graph.nodes.map((x) => [x.id, x]))
  ): { head: boolean; invalidAt: string | null } {
    const successors = (n.gkx?.supersededByIds ?? [])
      .filter((id) => visible.has(id))
      .map((id) => byId.get(id))
      .filter(Boolean) as GkxNode[];
    const times = successors.map((x) => Date.parse(x.validAt || "")).filter((x) => !Number.isNaN(x));
    const participates = successors.length > 0 || (n.gkx?.supersedesIds ?? []).some((id) => visible.has(id));
    return {
      head: participates && successors.length === 0,
      invalidAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
    };
  }

  private brief(n: GkxNode, graph?: GkxGraph, visible?: Set<string>, byId?: Map<string, GkxNode>): any {
    const temporal = graph ? this.visibleTemporal(n, graph, visible, byId) : { head: !!n.gkx?.head, invalidAt: n.gkx?.invalidAt ?? null };
    return {
      id: n.id, uid: n.gkx?.uid ?? null,
      title: n.label, path: n.path, type: n.gkx?.type || n.type || "note", area: n.area, tags: n.tags,
      sensitivity: n.gkx?.projection?.effective.sensitivity ?? n.gkx?.sensitivity ?? this.settings.defaultSensitivity,
      timestamp: n.validAt ?? null,
      head: temporal.head,
      superseded: temporal.invalidAt != null,
      invalidAt: temporal.invalidAt,
    };
  }

  private findNode(graph: GkxGraph, sel: { path?: string; title?: string; uid?: string }): GkxNode | null {
    const files = this.fileNodes(graph);
    if (sel.uid) {
      const uid = sel.uid.trim();
      const hits = files.filter((n) => n.gkx?.projection?.authored.uid === uid || n.gkx?.uid === uid);
      if (hits.length > 1) {
        const exact = sel.path ? hits.filter(n => n.path === sel.path.trim()) : [];
        if (exact.length === 1) return exact[0];
        throw new McpRpcError(-32602, "Ambiguous UID: use the exact vault-relative path to select one note");
      }
      if (hits.length === 1) return hits[0];
    }
    if (sel.path) {
      const p = sel.path.trim();
      const hit = files.find((n) => n.path === p) ??
        files.find((n) => n.path.toLowerCase() === p.toLowerCase()) ??
        files.find((n) => n.path.toLowerCase() === (p + ".md").toLowerCase());
      if (hit) return hit;
    }
    const q = (sel.title ?? sel.path ?? "").trim().toLowerCase();
    if (!q) return null;
    return (
      files.find((n) => n.label.toLowerCase() === q) ??
      files.find((n) => n.aliases.some((a) => a.toLowerCase() === q)) ??
      files.find((n) => (n.gkx?.title || "").toLowerCase() === q) ??
      null
    );
  }

  private projectables(graph: GkxGraph): ProjectableNote[] {
    const out: ProjectableNote[] = [];
    const visible = new Set(this.fileNodes(graph).map((n) => n.id));
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const n of this.fileNodes(graph)) {
      const v = n.validAt ? Date.parse(n.validAt) : NaN;
      if (Number.isNaN(v)) continue;
      const visibleInvalidAt = this.visibleTemporal(n, graph, visible, byId).invalidAt;
      const inv = visibleInvalidAt ? Date.parse(visibleInvalidAt) : null;
      out.push({ id: n.id, validAtMs: v, invalidAtMs: inv != null && !Number.isNaN(inv) ? inv : null });
    }
    return out;
  }

  /* ---------------- queries (shared by REST + MCP tools) ---------------- */

  async qOverview(): Promise<any> {
    const graph = await this.provider.getGraph();
    const ns = this.fileNodes(graph);
    const visible = new Set(ns.map((n) => n.id));
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const temporal = ns.map((n) => this.visibleTemporal(n, graph, visible, byId));
    const points = ns.flatMap((n, i) => {
      const out = n.validAt ? [Date.parse(n.validAt)] : [];
      if (temporal[i].invalidAt) out.push(Date.parse(temporal[i].invalidAt as string));
      return out.filter((x) => !Number.isNaN(x));
    });
    return {
      vault: this.provider.vaultName(),
      version: KOSMOS_VERSION,
      readOnly: true,
      gkxAuthority: "source notes + accepted semantic events; this API is a read projection",
      // DO NOT interpolate ENGINE_VERSION here: "GKOS-Engine 2.1" names the
      // Navigation/profile contract generation, which is versioned separately
      // from the gkos-engine library release.
      gkxProfile: "GKX v2.3 Validating Projection Profile (GKOS-Engine 2.1; no governed writer)",
      // R3: library, service and contract generation reported separately and
      // never derived from one another. No Engine service is configured in this
      // build, so `engine.service.status` is "not_configured" rather than a
      // guess borrowed from the bundled library version.
      engine: engineIdentity(ENGINE_VERSION, null),
      retrieval: retrievalCapabilities({
        maxSearchResults: MAX_SEARCH_RESULTS,
        maxNoteCharacters: MAX_NOTE_CONTENT_CHARS,
      }),
      navigation: getKosmosNavigationManifest(this.settings.navigationEnabled),
      sensitivityCeiling: this.settings.agentSensitivityCeiling,
      notes: ns.length,
      areas: [...new Set(ns.map((n) => n.area))].sort(),
      gkxNotes: ns.filter((n) => n.gkx).length,
      gkx23Notes: ns.filter((n) => n.gkx?.projection?.sourceVersion === "2.3").length,
      assessedNotes: ns.filter((n) => n.gkx?.projection?.assessment).length,
      heads: temporal.filter((x) => x.head).length,
      superseded: temporal.filter((x) => x.invalidAt).length,
      lineageEdges: graph.links.filter((l) => l.kind === "lineage" && visible.has(l.source) && visible.has(l.target)).length,
      semanticEdges: graph.links.filter((l) => l.kind === "semantic" && visible.has(l.source) && visible.has(l.target)).length,
      timeSpan: points.length > 1 ? { min: Math.min(...points), max: Math.max(...points) } : null,
      diagnostics: await this.safeDiagnostics(graph),
      indexBuiltAt: graph.stats.indexedAt,
    };
  }

  async qDiagnostics(): Promise<any> {
    const graph = await this.provider.getGraph();
    return this.safeDiagnostics(graph);
  }

  private safeDiagnostics(graph: GkxGraph): any {
    const visible = new Set(this.fileNodes(graph).map((n) => n.id));
    const visibleLinks = graph.links.filter((l) => visible.has(l.source) && (visible.has(l.target) || l.target.startsWith("unresolved:")));
    return {
      notes: visible.size,
      unresolvedLinks: new Set(visibleLinks.filter((l) => l.target.startsWith("unresolved:")).map((l) => l.target)).size,
      lineageEdges: visibleLinks.filter((l) => l.kind === "lineage").length,
      semanticEdges: visibleLinks.filter((l) => l.kind === "semantic").length,
      sensitivityCeiling: this.settings.agentSensitivityCeiling,
      // Global warning strings can contain hidden note titles, so they are not
      // exposed through a sensitivity-filtered connector.
      lineageWarnings: [],
      warningsRedacted: graph.diagnostics.lineageWarnings.length > 0,
      lastFullBuildMs: graph.diagnostics.lastFullBuildMs,
      lastIncrementalUpdateMs: graph.diagnostics.lastIncrementalUpdateMs,
      gkx23Diagnostics: this.fileNodes(graph).reduce((sum, n) => sum + (n.gkx?.projection?.diagnostics.length ?? 0), 0),
    };
  }

  async qSearch(query: string, opts: { tag?: string; area?: string; limit?: number } = {}): Promise<any> {
    const graph = await this.provider.getGraph();
    const q = String(query || "").toLowerCase();
    const lim = Math.max(1, Math.min(MAX_SEARCH_RESULTS, opts.limit || 20));
    const scored: Array<[number, GkxNode]> = [];
    for (const n of this.fileNodes(graph)) {
      if (opts.tag && !n.tags.some((t) => t.toLowerCase() === String(opts.tag).toLowerCase())) continue;
      if (opts.area && n.area.toLowerCase() !== String(opts.area).toLowerCase()) continue;
      let s = -1;
      if (!q) s = 0;
      else if (n.label.toLowerCase().startsWith(q)) s = 3;
      else if (n.label.toLowerCase().includes(q)) s = 2;
      else if (n.aliases.some((a) => a.toLowerCase().includes(q)) || n.tags.some((t) => t.toLowerCase().includes(q))) s = 1.5;
      else if (n.path.toLowerCase().includes(q)) s = 1;
      if (s >= 0) scored.push([s, n]);
    }
    scored.sort((a, b) => (b[0] - a[0]) || ((Date.parse(b[1].validAt || "") || 0) - (Date.parse(a[1].validAt || "") || 0)));
    return {
      query,
      method: "lexical (title/alias/tag/path substring; no embeddings)",
      total: scored.length,
      results: scored.slice(0, lim).map(([, n]) => this.brief(n, graph)),
    };
  }

  async qNote(sel: { path?: string; title?: string }): Promise<any> {
    const graph = await this.provider.getGraph();
    const n = this.findNode(graph, sel);
    if (!n) return { error: "note not found", hint: "pass path (e.g. Ideas/Engine v2.md) or title" };
    const visible = new Set(this.fileNodes(graph).map((x) => x.id));
    const nameOf = (id: string) => visible.has(id) ? (graph.nodes.find((x) => x.id === id)?.label ?? id) : null;
    const outgoing = graph.links.filter((l) => l.source === n.id && visible.has(l.target) && l.kind !== "contains" && l.kind !== "lineage").map((l) => l.target);
    const backlinks = graph.links.filter((l) => l.target === n.id && visible.has(l.source) && l.kind !== "contains" && l.kind !== "lineage").map((l) => l.source);
    const semantic = graph.links.filter((l) => l.source === n.id && visible.has(l.target) && l.kind === "semantic").map((l) => l.target);
    const content = await this.provider.getNoteContent(n.path);
    return {
      ...this.brief(n, graph, visible),
      aliases: n.aliases,
      gkx: n.gkx ? {
        gkx_version: n.gkx.gkxVersion,
        uid: n.gkx.uid,
        description: n.gkx.description,
        epistemic_state: n.gkx.epistemicState,
        scope: n.gkx.scope,
        scope_id: n.gkx.scopeId,
        sensitivity: n.gkx.projection?.effective.sensitivity ?? n.gkx.sensitivity ?? this.settings.defaultSensitivity,
        supersedes: (n.gkx.supersedesIds ?? []).map(nameOf).filter(Boolean),
        superseded_by: (n.gkx.supersededByIds ?? []).map(nameOf).filter(Boolean),
        declared_supersedes: n.gkx.supersedes,
        declared_superseded_by: n.gkx.supersededBy,
        forked_from: n.gkx.forkedFrom,
        forked_to: n.gkx.forkedTo,
        typed_relationships: n.gkx.relations,
        related: n.gkx.related,
        validating_projection: n.gkx.projection ? {
          profile: n.gkx.projection.profile,
          source_version: n.gkx.projection.sourceVersion,
          authored: n.gkx.projection.authored,
          derived: n.gkx.projection.derived,
          proposed: n.gkx.projection.proposed,
          approved: n.gkx.projection.approved,
          effective: n.gkx.projection.effective,
          extensions: n.gkx.projection.extensions,
          assessment: n.gkx.projection.assessment,
          diagnostics: n.gkx.projection.diagnostics,
        } : null,
      } : null,
      links: { outgoing, backlinks, semantic },
      content: this.capContent(content ?? ""),
    };
  }

  private async gkxNode(sel: { path?: string; title?: string; uid?: string }): Promise<{ graph: GkxGraph; node: GkxNode } | null> {
    const graph = await this.provider.getGraph();
    const node = this.findNode(graph, sel);
    return node ? { graph, node } : null;
  }

  async qGkxNote(sel: { path?: string; title?: string; uid?: string }): Promise<any> {
    const found = await this.gkxNode(sel);
    if (!found) return { error: "note not found" };
    const p = found.node.gkx?.projection;
    if (!p) return { error: "note has no GKX validating projection", path: found.node.path };
    return {
      profile: p.profile, conformanceClaim: p.conformanceClaim, mode: p.mode,
      source: { path: p.sourcePath, version: p.sourceVersion, contentHash: p.contentHash },
      authored: p.authored, derived: p.derived, proposed: p.proposed,
      approved: p.approved, effective: p.effective, extensions: p.extensions,
    };
  }

  async qAssessment(sel: { path?: string; title?: string; uid?: string }): Promise<any> {
    const found = await this.gkxNode(sel);
    return found?.node.gkx?.projection?.assessment ?? { error: "assessment not found" };
  }

  async qGkxDiagnostics(sel: { path?: string; title?: string; uid?: string }): Promise<any> {
    const found = await this.gkxNode(sel);
    const p = found?.node.gkx?.projection;
    return p ? { targetUid: p.authored.uid ?? null, path: p.sourcePath, count: p.diagnostics.length, diagnostics: p.diagnostics } : { error: "diagnostics not found" };
  }

  async qEffectiveLabels(sel: { path?: string; title?: string; uid?: string }): Promise<any> {
    const found = await this.gkxNode(sel);
    const p = found?.node.gkx?.projection;
    return p ? { targetUid: p.authored.uid ?? null, authored: p.authored.labels, derived: p.derived.labels, proposed: p.proposed.labels, approved: p.approved.labels, effective: p.effective.labels } : { error: "labels not found" };
  }

  async qEvidence(sel: { path?: string; title?: string; uid?: string }): Promise<any> {
    const found = await this.gkxNode(sel);
    const p = found?.node.gkx?.projection;
    if (!p) return { error: "evidence not found" };
    const pick = (origin: any) => origin.evidence ?? { supports: [], contradicts: [] };
    return { targetUid: p.authored.uid ?? null, authored: pick(p.authored), derived: pick(p.derived), proposed: pick(p.proposed), approved: pick(p.approved), effective: pick(p.effective) };
  }

  async qRelationships(sel: { path?: string; title?: string; uid?: string }): Promise<any> {
    const found = await this.gkxNode(sel);
    const p = found?.node.gkx?.projection;
    return p ? { targetUid: p.authored.uid ?? null, authored: p.authored.relationships, derived: p.derived.relationships, proposed: p.proposed.relationships, approved: p.approved.relationships, effective: p.effective.relationships } : { error: "relationships not found" };
  }

  qPolicy(): any {
    return { profile: GKX23_PROFILE, builtIn: true, source: "bundled-read-only-policy", policy: GKX23_POLICY, remoteUpdatesEnabled: false };
  }

  async qValidate(sel: { path?: string; title?: string; uid?: string }): Promise<any> {
    const result = await this.qGkxDiagnostics(sel);
    if (result.error) return result;
    return { ...result, valid: !result.diagnostics.some((d: any) => d.severity === "error" || d.severity === "critical"), sourceUnchanged: true };
  }

  async qAssessVault(limit = 100): Promise<any> {
    const graph = await this.provider.getGraph();
    const assessments = this.fileNodes(graph).flatMap((n) => n.gkx?.projection ? [{ path: n.path, ...n.gkx.projection.assessment }] : []);
    const cap = Math.max(1, Math.min(200, Number.isFinite(limit) ? Math.floor(limit) : 100));
    const overall = assessments.map((a) => a.scores.overall).filter((x): x is number => typeof x === "number");
    return { profile: GKX23_PROFILE, readOnly: true, total: assessments.length, returned: Math.min(cap, assessments.length), averageOverall: overall.length ? Math.round(overall.reduce((a, b) => a + b, 0) / overall.length * 10_000) / 10_000 : null, assessments: assessments.slice(0, cap) };
  }

  /** Cap a returned note body so one huge note cannot flood a client (Doc2 §5.6). */
  private capContent(s: string): string {
    if (s.length <= MAX_NOTE_CONTENT_CHARS) return s;
    return s.slice(0, MAX_NOTE_CONTENT_CHARS) + `\n\n…[truncated: note exceeds ${MAX_NOTE_CONTENT_CHARS} characters]`;
  }

  /** Canonical lineage chain — identical to what the viewer displays (§33). */
  async qLineage(sel: { path?: string; title?: string }): Promise<any> {
    const graph = await this.provider.getGraph();
    const n = this.findNode(graph, sel);
    if (!n) return { error: "note not found" };
    const byId = new Map(this.fileNodes(graph).map((x) => [x.id, x]));
    const seen = new Set<string>();
    const chain: GkxNode[] = [];
    const walk = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const x = byId.get(id);
      if (!x) return;
      for (const a of (x.gkx?.supersedesIds ?? [])) walk(a);
      chain.push(x);
      for (const d of (x.gkx?.supersededByIds ?? [])) walk(d);
    };
    walk(n.id);
    chain.sort((a, b) => (Date.parse(a.validAt || "") || 0) - (Date.parse(b.validAt || "") || 0));
    return {
      for: n.path,
      chainLength: chain.length,
      chain: chain.map((x) => ({ ...this.brief(x, graph), current: x.id === n.id })),
    };
  }

  async qRelated(sel: { path?: string; title?: string }): Promise<any> {
    const graph = await this.provider.getGraph();
    const n = this.findNode(graph, sel);
    if (!n) return { error: "note not found" };
    const byId = new Map(this.fileNodes(graph).map((x) => [x.id, x]));
    const b = (id: string) => { const x = byId.get(id); return x ? this.brief(x, graph) : { path: id }; };
    const semantic = graph.links.filter((l) => l.source === n.id && byId.has(l.target) && l.kind === "semantic").map((l) => b(l.target));
    const outgoing = graph.links.filter((l) => l.source === n.id && byId.has(l.target) && l.kind !== "contains" && l.kind !== "lineage").map((l) => b(l.target));
    const backlinks = graph.links.filter((l) => l.target === n.id && byId.has(l.source) && l.kind !== "contains" && l.kind !== "lineage").map((l) => b(l.source));
    return { for: n.path, semantic, outgoing, backlinks };
  }

  /** Point-in-time snapshot — the ONE shared projector (§4.1, §33). */
  async qAtTime(time: string, limit = 50): Promise<any> {
    const graph = await this.provider.getGraph();
    const T = Date.parse(time);
    if (Number.isNaN(T)) return { error: "invalid time; use ISO 8601, e.g. 2026-04-01 or 2026-04-01T00:00:00Z" };
    const projection = projectAtTime(this.projectables(graph), T);
    const byId = new Map(graph.nodes.map((x) => [x.id, x]));
    const briefs = (ids: string[]) => ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a: any, b: any) => String(b.validAt).localeCompare(String(a.validAt)))
      .map((n: any) => this.brief(n, graph));
    const valid = briefs(projection.valid);
    const superseded = briefs(projection.superseded);
    const cap = Math.max(1, Math.min(MAX_SEARCH_RESULTS, Math.floor(Number.isFinite(limit) ? limit : 50)));
    return {
      at: projection.at,
      semantics: "temporal validity intervals: valid = written by T and not yet superseded; superseded = a newer version already existed at T; notes with valid_at > T did not exist yet",
      counts: { valid: valid.length, superseded: superseded.length, notYetCreated: projection.notYetCreated.length },
      valid: valid.slice(0, cap),
      superseded: superseded.slice(0, cap),
    };
  }

  private graphForVisibleNodes(graph: GkxGraph): GkxGraph {
    const visible = new Set(this.fileNodes(graph).map((n) => n.id));
    return {
      ...graph,
      nodes: graph.nodes.filter((n) => visible.has(n.id)).map((n) => n.gkx ? ({
        ...n,
        gkx: {
          ...n.gkx,
          supersedesIds: (n.gkx.supersedesIds ?? []).filter((id) => visible.has(id)),
          supersededByIds: [],
          invalidAt: null,
          head: false,
        },
      }) : n),
      links: graph.links.filter((l) => visible.has(l.source) && visible.has(l.target)),
    };
  }

  async qEpisodes(limit?: number, offset = 0): Promise<any[]> {
    const graph = await this.provider.getGraph();
    const visibleGraph = this.graphForVisibleNodes(graph);
    const all = buildGraphitiEpisodes(visibleGraph, {
      vault: this.provider.vaultName(),
      vaultIdentity: this.provider.vaultIdentity?.(),
      groupId: this.settings.agentGraphNamespace
        ? `gkx-${this.provider.vaultName().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "vault"}-${this.settings.agentGraphNamespace.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32)}-assertions`
        : undefined,
      corpusId: this.settings.agentGraphNamespace || this.provider.vaultIdentity?.(),
      combinedExtraction: this.settings.graphitiCombinedExtraction,
      sagaMapping: this.settings.graphitiSagaMapping,
      processingTime: graph.stats.indexedAt,
    });
    const start = Math.max(0, Math.floor(Number.isFinite(offset) ? offset : 0));
    const cap = limit == null || !Number.isFinite(limit) ? MAX_EPISODES : Math.max(1, Math.min(Math.floor(limit), MAX_EPISODES));
    const episodes = all.slice(start, start + cap);
    const contents = new Map<string, string>();
    for (const episode of episodes) {
      let path = "";
      try { path = String(JSON.parse(episode.episode_body).path || ""); } catch (_) { /* generated JSON */ }
      if (!path) continue;
      const c = await this.provider.getNoteContent(path);
      if (c != null) contents.set(path, c);
    }
    return attachGraphitiContent(episodes, contents);
  }

  async qEpisodePage(offset = 0, limit = DEFAULT_EPISODE_PAGE): Promise<any> {
    const graph = await this.provider.getGraph();
    const visibleGraph = this.graphForVisibleNodes(graph);
    const profile = graphitiIngestionProfile({ combinedExtraction: this.settings.graphitiCombinedExtraction });
    const total = buildGraphitiEpisodes(visibleGraph, {
      vault: this.provider.vaultName(), vaultIdentity: this.provider.vaultIdentity?.(),
      combinedExtraction: this.settings.graphitiCombinedExtraction, sagaMapping: this.settings.graphitiSagaMapping,
      processingTime: graph.stats.indexedAt,
    }).length;
    const start = Math.max(0, Math.floor(Number.isFinite(offset) ? offset : 0));
    const pageSize = Math.max(1, Math.min(Math.floor(Number.isFinite(limit) ? limit : DEFAULT_EPISODE_PAGE), MAX_EPISODE_PAGE));
    const episodes = await this.qEpisodes(pageSize, start);
    const next = start + episodes.length;
    return {
      authority: "non-authoritative Graphiti adapter projection with authored/derived/proposed/approved origin separation",
      adapter: "Kosmos Governed Context Projection",
      ingestionProfile: profile,
      sensitivityCeiling: this.settings.agentSensitivityCeiling,
      total,
      cursor: start,
      nextCursor: next < total ? next : null,
      episodes,
    };
  }

  async qGraphitiIngestionStatus(): Promise<any> {
    const graph = await this.provider.getGraph();
    return {
      state: "export-ready",
      searchable: false,
      reason: "Kosmos-Oden prepares episodes but does not assume a queued Graphiti MCP ingestion is searchable.",
      sourceIndexedAt: graph.stats.indexedAt,
      profile: graphitiIngestionProfile({ combinedExtraction: this.settings.graphitiCombinedExtraction }),
      upstreamCheckRequired: true,
      readyWhen: "Graphiti reports the queued job completed and a read-after-ingest query can retrieve the episode UUID.",
      benchmark: this.settings.graphitiCombinedExtraction ? { state: "measurement-required", metrics: ["token_cost","ingestion_duration_ms","entity_recall","edge_accuracy"] } : { state: "disabled" },
    };
  }

  async qGraph(): Promise<any> {
    const graph = await this.provider.getGraph();
    const visible = new Set(this.fileNodes(graph).map((n) => n.id));
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const nodes = this.fileNodes(graph).map((n) => this.brief(n, graph, visible, byId));
    const links: any[] = [];
    for (const l of graph.links) {
      if (l.kind === "contains" || !visible.has(l.source) || !visible.has(l.target)) continue;
      links.push({ source: l.source, target: l.target, kind: l.kind === "lineage" ? "lineage" : l.kind === "semantic" ? "semantic" : "wikilink" });
    }
    return { builtAt: graph.stats.indexedAt, nodes, links };
  }

  /* ---------------- MCP (Streamable HTTP sessions, read tools only) ---------------- */

  toolDefs(): any[] {
    const sel = {
      path: { type: "string", description: "Vault-relative path, e.g. Ideas/Engine v2.md" },
      title: { type: "string", description: "Note title / basename / alias" },
      uid: { type: "string", description: "Canonical GKX UID" },
    };
    const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
    const outputSchema = { type: "object", additionalProperties: true };
    const tool = (name: string, title: string, description: string, inputSchema: any) => ({
      name, title, description, inputSchema: { ...inputSchema, properties: { ...inputSchema.properties, agent_name: { type: "string", description: "Your designated ship name, e.g. Codex Game Research. Send the same name on each call; display only, not authority.", minLength: 1, maxLength: 80 } } }, outputSchema, annotations,
    });
    const selectionSchema = { type: "object", properties: sel, anyOf: [{ required: ["path"] }, { required: ["title"] }, { required: ["uid"] }], additionalProperties: false };
    return [
      tool("vault_overview", "Vault overview", `Sensitivity-filtered GKOS-Engine v${ENGINE_VERSION} GKX projection statistics and diagnostics. Source notes and accepted semantic events remain authoritative.`, { type: "object", properties: {}, additionalProperties: false }),
      tool("search_notes", "Search notes", "Lexical search over readable titles, aliases, source Markdown tags, and paths (no embeddings).", { type: "object", properties: { query: { type: "string" }, tag: { type: "string" }, area: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: MAX_SEARCH_RESULTS } }, required: ["query"], additionalProperties: false }),
      tool("get_note", "Get note", "Readable source note content, GKX metadata, resolved lineage projection, and links.", selectionSchema),
      tool("get_lineage", "Get lineage", "Readable GKX supersession chain ordered oldest to newest.", selectionSchema),
      tool("get_related", "Get related notes", "Readable semantic related_to neighbors, outgoing links, and backlinks.", selectionSchema),
      tool("graph_at_time", "Graph at time", "Point-in-time temporal-validity projection for readable notes.", { type: "object", properties: { time: { type: "string", description: "ISO 8601" }, limit: { type: "integer", minimum: 1, maximum: MAX_SEARCH_RESULTS } }, required: ["time"], additionalProperties: false }),
      tool("export_graphiti_episodes", "Export Graphiti episodes", "Paginated, chronological, non-authoritative Graphiti adapter with origin separation. Stable UUIDs identify episodes; upstream deduplication is not guaranteed. Verify searchability after ingestion.", { type: "object", properties: { cursor: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: MAX_EPISODE_PAGE } }, additionalProperties: false }),
      tool("graphiti_ingestion_status", "Graphiti ingestion status", "Reports export readiness and the mandatory upstream read-after-ingest check. Accepted never means searchable.", { type: "object", properties: {}, additionalProperties: false }),
      tool("get_gkx_note", "Get GKX note projection", `Origin-separated authored, derived, proposed, approved, and effective GKX v2.3 projection from GKOS-Engine v${ENGINE_VERSION}.`, selectionSchema),
      tool("get_assessment", "Get assessment", "Policy-bound deterministic documentation-quality assessment; never a truth or use authorization.", selectionSchema),
      tool("get_diagnostics", "Get GKX diagnostics", "Stable structured validation diagnostics for one readable note.", selectionSchema),
      tool("get_effective_labels", "Get effective labels", "Origin-separated labels plus the effective non-proposed projection.", selectionSchema),
      tool("get_evidence", "Get evidence", "Origin-separated supporting and contradicting evidence declarations.", selectionSchema),
      tool("get_relationships", "Get typed relationships", "Authored, derived, proposed, approved, and effective typed relationships.", selectionSchema),
      tool("get_policy", "Get GKX policy", "Built-in deterministic GKX 2.3 assessment policy and trust state.", { type: "object", properties: {}, additionalProperties: false }),
      tool("validate_note", "Validate note", "Validate one note in memory without modifying source bytes.", selectionSchema),
      tool("assess_note", "Assess note", "Calculate/read one deterministic assessment in memory without modifying source bytes.", selectionSchema),
      tool("assess_vault", "Assess vault", "Bounded in-memory deterministic assessment summary; writes no notes or sidecars.", { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 200 } }, additionalProperties: false }),
    ];
  }

  private validateToolArgs(name: string, args: unknown): Record<string, any> {
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new McpRpcError(-32602, "tools/call arguments must be an object");
    const a = args as Record<string, any>;
    const def = this.toolDefs().find((t) => t.name === name);
    if (!def) throw new McpRpcError(-32602, `Unknown tool: ${name}`);
    // The advertised inputSchema is the only source of truth for accepted argument
    // keys. A parallel hand-maintained allowlist drifted from selectionSchema and
    // rejected the `uid` selector that get_note, get_lineage and get_related
    // advertise, so a schema-following client got -32602 for a documented selector.
    const allowed = new Set(Object.keys((def.inputSchema as { properties?: Record<string, unknown> }).properties ?? {}));
    for (const key of Object.keys(a)) if (!allowed.has(key)) throw new McpRpcError(-32602, `Unexpected argument: ${key}`);
    for (const key of ["query", "tag", "area", "path", "title", "uid", "time"]) {
      if (a[key] != null && typeof a[key] !== "string") throw new McpRpcError(-32602, `${key} must be a string`);
    }
    if ("agent_name" in a && (typeof a.agent_name !== "string" || !a.agent_name.trim() || a.agent_name.length > 80)) throw new McpRpcError(-32602, "agent_name must be a nonempty string of at most 80 characters");
    const requireSelector = () => {
      if (!(typeof a.path === "string" && a.path.trim()) && !(typeof a.title === "string" && a.title.trim()) && !(typeof a.uid === "string" && a.uid.trim())) {
        throw new McpRpcError(-32602, `${name} requires path, title, or uid`);
      }
    };
    if (name === "search_notes" && typeof a.query !== "string") throw new McpRpcError(-32602, "search_notes requires string query");
    if (["get_note", "get_lineage", "get_related", "get_gkx_note", "get_assessment", "get_diagnostics", "get_effective_labels", "get_evidence", "get_relationships", "validate_note", "assess_note"].includes(name)) requireSelector();
    if (name === "graph_at_time" && typeof a.time !== "string") throw new McpRpcError(-32602, "graph_at_time requires string time");
    const integer = (key: string, min: number, max: number) => {
      if (a[key] == null) return;
      if (!Number.isInteger(a[key]) || a[key] < min || a[key] > max) throw new McpRpcError(-32602, `${key} must be an integer from ${min} to ${max}`);
    };
    integer("limit", 1, name === "export_graphiti_episodes" ? MAX_EPISODE_PAGE : name === "assess_vault" ? 200 : MAX_SEARCH_RESULTS);
    if (name === "export_graphiti_episodes") integer("cursor", 0, Number.MAX_SAFE_INTEGER);
    return a;
  }

  async callTool(name: string, args: any, agent?: string, agentId?: string, isActive: () => boolean = () => true): Promise<any> {
    args = this.validateToolArgs(name, args || {});
    if (args.agent_name) {
      const key = this.registerSession(args.agent_name, MODERN_MCP_PROTOCOL_VERSION);
      const session = this.getSession(key);
      agent = session!.name; agentId = session!.visualId;
    }
    const done = (r: any) => {
      if (isActive()) {
        this.emitTraversal(name, r, agent, agentId);
        // Any successful tool activity keeps an existing ship present.
        if (!r?.error && !this.traversalPaths(name, r).length) { try { this.onTraversal?.([], "ping", agent, agentId); } catch (_) { /* best effort */ } }
      }
      return r;
    };
    switch (name) {
      case "vault_overview": return this.qOverview();
      case "search_notes": return done(await this.qSearch(args.query, args));
      case "get_note": return done(await this.qNote(args));
      case "get_lineage": return done(await this.qLineage(args));
      case "get_related": return done(await this.qRelated(args));
      case "graph_at_time": return done(await this.qAtTime(args.time, args.limit));
      case "export_graphiti_episodes": return this.qEpisodePage(args.cursor ?? 0, args.limit ?? DEFAULT_EPISODE_PAGE);
      case "get_gkx_note": return done(await this.qGkxNote(args));
      case "get_assessment": return done(await this.qAssessment(args));
      case "get_diagnostics": return done(await this.qGkxDiagnostics(args));
      case "get_effective_labels": return done(await this.qEffectiveLabels(args));
      case "get_evidence": return done(await this.qEvidence(args));
      case "get_relationships": return done(await this.qRelationships(args));
      case "get_policy": return this.qPolicy();
      case "validate_note": return done(await this.qValidate(args));
      case "assess_note": return done(await this.qAssessment(args));
      case "assess_vault": return this.qAssessVault(args.limit ?? 100);
      case "graphiti_ingestion_status": return this.qGraphitiIngestionStatus();
      default: throw new McpRpcError(-32602, "Unknown tool: " + name);
    }
  }

  /** Modern MCP has no negotiation handshake: every request declares its own
   *  version and the server accepts or rejects that request on its own. The
   *  check lives in validateRequestMetadata, which returns
   *  UnsupportedProtocolVersionError (-32022) carrying the supported list. */

  async mcpDispatch(
    msg: any,
    ctx?: {
      agent?: string;
      agentId?: string;
      isActive?: () => boolean;
    }
  ): Promise<any | null> {
    const requestId = msg && typeof msg === "object" && !Array.isArray(msg) && msg.id !== undefined ? msg.id : null;
    const error = (code: number, message: string, data?: unknown) => ({
      jsonrpc: "2.0", id: requestId,
      error: { code, message, ...(data === undefined ? {} : { data }) },
    });
    if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      return error(-32600, "Invalid Request: expected one JSON-RPC 2.0 request or notification");
    }
    const isNotification = msg.id === undefined;
    if (!isNotification && !(typeof msg.id === "string" || (typeof msg.id === "number" && Number.isInteger(msg.id)))) {
      return error(-32600, "Invalid Request: id must be a string or integer");
    }
    if (msg.params !== undefined && (!msg.params || typeof msg.params !== "object" || Array.isArray(msg.params))) {
      return isNotification ? null : error(-32602, "Invalid params: expected an object");
    }
    const { id, method, params = {} } = msg;
    // The 2026-07-28 wire REQUIRES cacheScope + ttlMs on every cacheable
    // result (server/discover and the list methods); non-cacheable results
    // (ping, tools/call) must not claim cache directives. Values are the
    // spec defaults -- see MCP_CACHE_SCOPE_DEFAULT. A spec-strict client
    // rejects a cacheable result missing either field.
    const cacheDirective = MCP_CACHEABLE_RESULT_METHODS.has(method)
      ? { cacheScope: MCP_CACHE_SCOPE_DEFAULT, ttlMs: MCP_CACHE_TTL_MS_DEFAULT }
      : {};
    const ok = (result: any) => ({ jsonrpc: "2.0", id, result: {
      ...result,
      ...cacheDirective,
      resultType: "complete",
      _meta: { ...result._meta, [MCP_META_SERVER_INFO]: { name: "kosmos-oden", title: "Kosmos-Oden", version: KOSMOS_VERSION } },
    } });

    if (isNotification) {
      // This revision of the core protocol defines no client-to-server
      // notification over Streamable HTTP: cancellation is the closed response
      // stream, not a message. Notifications are still accepted and ignored as
      // JSON-RPC requires, and the transport answers 202 with no body.
      return null;
    }

    try {
      // Required of every modern server. Answers identity, capabilities and
      // supported versions in one request so a client need not probe
      // tools/list, prompts/list and resources/list separately. serverInfo is
      // a self-report and rides in _meta, which is where this revision puts
      // it -- it is not a verified claim and clients are told not to make
      // security decisions on it.
      if (method === "server/discover") {
        return ok({
          resultType: "complete",
          supportedVersions: [...SUPPORTED_MCP_PROTOCOL_VERSIONS],
          capabilities: { tools: { listChanged: false } },
          _meta: { [MCP_META_SERVER_INFO]: { name: "kosmos-oden", title: "Kosmos-Oden", version: KOSMOS_VERSION } },
          instructions: `GKOS-Engine v${ENGINE_VERSION} read-only, sensitivity-filtered GKX v2.3 Validating Projection Profile. Authored, derived, proposed, approved, and effective values remain distinct. Scores measure documentation/support quality, not truth or authorization. Use get_gkx_note/get_assessment/get_diagnostics for governance projections and get_lineage/graph_at_time for temporal views. Graphiti exports are non-authoritative projections. The server never modifies notes.`,
        });
      }
      // Legacy handshake. Not implemented, and the error names the supported
      // versions because a legacy client has no fall-forward mechanism and
      // this message may be the only diagnostic it can show a user.
      if (method === "initialize") {
        return error(
          -32601,
          `Method not found: initialize. This server implements modern MCP only; supported protocol versions: ${SUPPORTED_MCP_PROTOCOL_VERSIONS.join(", ")}. Carry the version in params._meta["${MCP_META_PROTOCOL_VERSION}"] and the MCP-Protocol-Version header instead of opening a session.`,
          { supported: [...SUPPORTED_MCP_PROTOCOL_VERSIONS] },
        );
      }
      if (method === "tools/list") return ok({ tools: this.toolDefs() });
      if (method === "tools/call") {
        if (typeof params.name !== "string") throw new McpRpcError(-32602, "tools/call requires string name");
        const args = this.validateToolArgs(params.name, params.arguments ?? {});
        try {
          const result = await this.callTool(params.name, args, ctx?.agent, ctx?.agentId, ctx?.isActive);
          const structuredContent = Array.isArray(result) ? { items: result } : result;
          return ok({
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent,
            isError: Boolean(result && typeof result === "object" && result.error),
          });
        } catch (e: any) {
          if (e instanceof McpRpcError) throw e;
          if (e instanceof ProviderError) return ok({ content: [{ type: "text", text: e.message }], structuredContent: { error: e.reason, retryable: false }, isError: true });
          return ok({ content: [{ type: "text", text: "Error: " + (e?.message || String(e)) }], isError: true });
        }
      }
      if (method === "resources/list") return ok({ resources: [] });
      if (method === "prompts/list") return ok({ prompts: [] });
      return error(-32601, "Method not found: " + method);
    } catch (e: any) {
      if (e instanceof McpRpcError) return error(e.code, e.message, e.data);
      return error(-32603, e?.message || "Internal error");
    }
  }

  /* ---------------- HTTP dispatch ---------------- */

  /** Public entry: enforce rate/concurrency limits, then dispatch. */
  async handle(req: any, res: any): Promise<void> {
    const rl = this.rateLimited(req);
    if (rl.limited) {
      res.writeHead(429, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "5" });
      res.end(JSON.stringify({ error: "too many requests", hint: rl.reason }));
      return;
    }
    const epoch = this.epoch, provider = this.provider, settings = this.settings;
    const ceiling = settings.agentSensitivityCeiling, defaultSensitivity = settings.defaultSensitivity;
    const token = settings.agentToken, requireToken = settings.agentRequireToken;
    const until = performance.now() + this.operationTimeoutMs;
    let akey: string | undefined, finished = false;
    let releaseWait!: () => void;
    const ended = new Promise<void>(resolve => { releaseWait = resolve; });
    const isActive = () => !finished && epoch === this.epoch && this.provider === provider && this.settings === settings &&
      settings.agentSensitivityCeiling === ceiling && settings.defaultSensitivity === defaultSensitivity &&
      settings.agentToken === token && settings.agentRequireToken === requireToken && performance.now() < until;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (reason?: "timeout" | "provider_unavailable") => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      req.removeListener?.("aborted", disconnected);
      res.removeListener?.("close", disconnected);
      this.activeRequests.delete(finish);
      if (epoch === this.epoch) {
        this.inFlight--;
        if (akey !== undefined) {
          const count = (this.perAgentInFlight.get(akey) || 1) - 1;
          if (count <= 0) this.perAgentInFlight.delete(akey); else this.perAgentInFlight.set(akey, count);
        }
      }
      if (reason && !res.destroyed && !res.writableEnded) {
        try {
          if (res.headersSent) res.destroy?.();
          else {
            const status = reason === "timeout" ? 504 : 503;
            const body = (req.url || "").split("?")[0] === "/mcp"
              ? { jsonrpc: "2.0", id: req.kosmosRequestId ?? null, error: { code: -33001, message: reason === "timeout" ? "Operation timed out" : "Provider unavailable", data: { reason, retryable: false } } }
              : { error: reason, retryable: false };
            res.once?.("finish", () => req.destroy?.());
            this.json(res, status, body, { Connection: "close" });
          }
        } catch (_) { /* disconnected while finalizing */ }
      }
      req.emit?.("kosmos-operation-ended");
      releaseWait();
    };
    const disconnected = () => finish();
    const claimAgent = (key: string): boolean => {
      if (!isActive()) return false;
      const cur = this.perAgentInFlight.get(key) || 0;
      if (cur >= MAX_CONCURRENT_PER_AGENT) {
        res.writeHead(429, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "1" });
        res.end(JSON.stringify({ error: "too many requests", hint: `client has too many concurrent requests (max ${MAX_CONCURRENT_PER_AGENT}); background work is throttled so other clients stay responsive` }));
        return false;
      }
      akey = key;
      this.perAgentInFlight.set(key, cur + 1);
      return true;
    };
    this.inFlight++;
    this.activeRequests.add(finish);
    timer = setTimeout(() => finish("timeout"), this.operationTimeoutMs);
    req.once?.("aborted", disconnected);
    res.once?.("close", disconnected);
    // Capture the old provider/settings context. A restarted server cannot
    // redirect an old suspended dispatch into a replacement provider.
    const context = Object.create(this) as KosmosAgentServer;
    context.provider = provider; context.settings = settings;
    const guarded = new Proxy(res, { get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      if (["writeHead", "write", "end", "setHeader", "removeHeader", "flushHeaders"].includes(String(key))) {
        return (...args: any[]) => isActive() ? value.apply(target, args) : undefined;
      }
      return value.bind(target);
    } });
    const dispatch = context.dispatch(req, guarded, claimAgent, isActive).catch((e: any) => {
      if (isActive()) {
        if (e instanceof ProviderError) this.json(guarded, e.reason === "timeout" ? 504 : 503, { error: e.reason, retryable: false });
        else this.json(guarded, 500, { error: "internal error" });
      }
    }).finally(() => finish(!isActive() && !finished ? (performance.now() >= until ? "timeout" : "provider_unavailable") : undefined));
    await Promise.race([dispatch, ended]);
  }

  private async dispatch(req: any, res: any, claimAgent: (key: string) => boolean, isActive: () => boolean = () => true): Promise<void> {
    // Host validation first (DNS-rebinding defence).
    if (!this.hostAllowed(req.headers["host"])) {
      this.json(res, 403, { error: "forbidden host", hint: "the Host header does not match an allowed address for this bind mode" });
      return;
    }
    if (!this.originAllowed(req.headers["origin"])) {
      this.json(res, 403, { error: "forbidden origin", hint: "browser cross-origin requests are not allowed" });
      return;
    }
    const u = new URL(req.url || "/", "http://127.0.0.1");
    const path = u.pathname.replace(/\/+$/, "") || "/";
    if (req.method === "OPTIONS") { res.writeHead(204, { "Cache-Control": "no-store" }); res.end(); return; }
    if (!this.authorized(req, u)) {
      // Generic message — does not distinguish missing from incorrect token (Doc1 §3.6).
      this.json(res, 401, { error: "unauthorized", hint: "send Authorization: Bearer <token> or x-api-key: <token>" });
      return;
    }

    if (path === "/mcp") {
      // This revision removed the GET stream and session termination, so the
      // endpoint accepts POST alone. The spec names 405 for exactly the GET and
      // DELETE an older client would send.
      if (req.method !== "POST") { res.writeHead(405, { Allow: "POST", "Cache-Control": "no-store" }); res.end(); return; }
      let body: string;
      try {
        body = await this.readBody(req);
      } catch (e: any) {
        const code = e?.statusCode === 413 ? 413 : 400;
        res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", Connection: "close" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: e?.message || "bad request" } }), () => {
          try { req.destroy(); } catch (_) { /* already gone */ }
        });
        return;
      }
      if (!isActive()) return;
      let parsed: any;
      try { parsed = JSON.parse(body || "null"); }
      catch (_) { this.json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); return; }
      if (Array.isArray(parsed)) {
        this.json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "JSON-RPC batching is not supported by Streamable HTTP; send one message per POST" } });
        return;
      }

      // Validate the envelope before interpreting metadata or registering a
      // caller. A malformed request is not a metadata/header disagreement.
      const validId = typeof parsed?.id === "string" || (typeof parsed?.id === "number" && Number.isInteger(parsed.id));
      if (!parsed || typeof parsed !== "object" || parsed.jsonrpc !== "2.0" || typeof parsed.method !== "string" ||
          (parsed.id !== undefined && !validId) || "result" in parsed || "error" in parsed) {
        this.json(res, 400, { jsonrpc: "2.0", ...(validId ? { id: parsed.id } : {}), error: { code: -32600, message: "Invalid Request: expected one JSON-RPC 2.0 request or notification with a string or integer id" } });
        return;
      }

      // A JSON-RPC notification is a bare POST: this revision defines no
      // client-to-server notification over Streamable HTTP and states that
      // header requirements for notification POSTs are undefined, so metadata
      // is not demanded of one. Accepted notifications answer 202 with no body.
      req.kosmosRequestId = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.id : null;
      const isNotification = parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.id === undefined;

      if (!isNotification) {
        const bad = this.validateRequestMetadata(req, parsed);
        if (bad) {
          // Keep the required validation error/status. Even a legacy request
          // with no modern metadata must explain which versions are supported.
          if (parsed.method === "initialize") {
            bad.message += `; supported protocol versions: ${SUPPORTED_MCP_PROTOCOL_VERSIONS.join(", ")}`;
          }
          const rid = parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.id !== undefined ? parsed.id : null;
          this.json(res, 400, { jsonrpc: "2.0", id: rid, error: bad });
          return;
        }
      }

      // Mcp-Session-Id and Last-Event-ID are deliberately ignored rather than
      // rejected, as the spec directs: no session is minted or echoed, and
      // streams are not resumable.
      const { agent, agentId } = isNotification ? { agent: this.agentLabel(req), agentId: undefined } : this.mcpIdentity(parsed, req);
      // Named modern clients sharing a User-Agent must not share one bucket.
      // Names remain self-reported; rotation cannot evade global admission.
      if (!claimAgent(`${agentId ? "mcp" : "ua"}:${agent}`)) return;
      const out = await this.mcpDispatch(parsed, { agent, agentId, isActive });
      if (parsed.method === "ping" && !out?.error) { try { this.onTraversal?.([], "ping", agent, agentId); } catch (_) { /* presence never breaks requests */ } }
      if (!out) { res.writeHead(202, { "Cache-Control": "no-store" }); res.end(); return; }
      // An unimplemented method is a 404 carrying the JSON-RPC error, which is
      // what distinguishes a modern server from a legacy one that simply does
      // not host this endpoint.
      const status = out?.error?.code === -32601 ? 404 : [-32600, -32602, -32021].includes(out?.error?.code) ? 400 : 200;
      this.json(res, status, out);
      return;
    }

    if (!claimAgent(`ua:${this.agentLabel(req)}`)) return;
    if (req.method !== "GET") { this.json(res, 405, { error: "GET only (read-only API)" }); return; }
    const q = (k: string) => u.searchParams.get(k) || undefined;
    switch (path) {
      case "/":
        this.json(res, 200, {
          name: "Kosmos-Oden Agent API",
          version: KOSMOS_VERSION,
          readOnly: true,
          auth: "Authorization: Bearer <token> or x-api-key: <token>",
          mcp: { endpoint: "/mcp", transport: "MCP Streamable HTTP", sessions: false, supportedProtocolVersions: SUPPORTED_MCP_PROTOCOL_VERSIONS },
          rest: ["/health", "/overview", "/diagnostics", "/graph", "/notes?q=&tag=&area=&limit=", "/note?path=|title=", "/lineage?path=|title=", "/related?path=|title=", "/at?time=ISO", "/episodes", "/graphiti/status", "/gkx/note?uid=|path=|title=", "/gkx/assessment?uid=|path=|title=", "/gkx/diagnostics?uid=|path=|title=", "/gkx/labels?uid=|path=|title=", "/gkx/evidence?uid=|path=|title=", "/gkx/relationships?uid=|path=|title=", "/gkx/validate?uid=|path=|title=", "/gkx/policy", "/gkx/assess-vault?limit="],
        });
        return;
      case "/health": this.json(res, 200, { ok: true, name: "kosmos-oden", version: KOSMOS_VERSION, vault: this.provider.vaultName(), navigation: getKosmosNavigationManifest(this.settings.navigationEnabled) }); return;
      case "/overview": this.json(res, 200, await this.qOverview()); return;
      case "/diagnostics": this.json(res, 200, await this.qDiagnostics()); return;
      case "/graph": this.json(res, 200, await this.qGraph()); return;
      case "/notes": { const a = this.agentLabel(req); const r = await this.qSearch(q("q") || "", { tag: q("tag"), area: q("area"), limit: q("limit") ? Number(q("limit")) : undefined }); if (isActive()) this.emitTraversal("search_notes", r, a); this.json(res, 200, r); return; }
      case "/note": { const a = this.agentLabel(req); const r = await this.qNote({ path: q("path"), title: q("title") }); if (isActive()) this.emitTraversal("get_note", r, a); this.json(res, 200, r); return; }
      case "/lineage": { const a = this.agentLabel(req); const r = await this.qLineage({ path: q("path"), title: q("title") }); if (isActive()) this.emitTraversal("get_lineage", r, a); this.json(res, 200, r); return; }
      case "/related": { const a = this.agentLabel(req); const r = await this.qRelated({ path: q("path"), title: q("title") }); if (isActive()) this.emitTraversal("get_related", r, a); this.json(res, 200, r); return; }
      case "/at": { const a = this.agentLabel(req); const r = await this.qAtTime(q("time") || "", q("limit") ? Number(q("limit")) : 50); if (isActive()) this.emitTraversal("graph_at_time", r, a); this.json(res, 200, r); return; }
      case "/episodes": this.json(res, 200, await this.qEpisodePage(q("cursor") ? Number(q("cursor")) : 0, q("limit") ? Number(q("limit")) : DEFAULT_EPISODE_PAGE)); return;
      case "/gkx/note": this.json(res, 200, await this.qGkxNote({ uid: q("uid"), path: q("path"), title: q("title") })); return;
      case "/gkx/assessment": this.json(res, 200, await this.qAssessment({ uid: q("uid"), path: q("path"), title: q("title") })); return;
      case "/gkx/diagnostics": this.json(res, 200, await this.qGkxDiagnostics({ uid: q("uid"), path: q("path"), title: q("title") })); return;
      case "/gkx/labels": this.json(res, 200, await this.qEffectiveLabels({ uid: q("uid"), path: q("path"), title: q("title") })); return;
      case "/gkx/evidence": this.json(res, 200, await this.qEvidence({ uid: q("uid"), path: q("path"), title: q("title") })); return;
      case "/gkx/relationships": this.json(res, 200, await this.qRelationships({ uid: q("uid"), path: q("path"), title: q("title") })); return;
      case "/gkx/validate": this.json(res, 200, await this.qValidate({ uid: q("uid"), path: q("path"), title: q("title") })); return;
      case "/gkx/policy": this.json(res, 200, this.qPolicy()); return;
      case "/gkx/assess-vault": this.json(res, 200, await this.qAssessVault(q("limit") ? Number(q("limit")) : 100)); return;
      case "/graphiti/status": this.json(res, 200, await this.qGraphitiIngestionStatus()); return;
      default: this.json(res, 404, { error: "not found", see: "/" });
    }
  }
}
