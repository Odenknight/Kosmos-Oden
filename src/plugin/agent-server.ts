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
 *  - MCP `initialize` negotiates against an explicit supported-version list;
 *    unknown client versions get the server's latest, never an echo (§15).
 *  - Request bodies are limited by ACTUAL BYTES (4 MiB default) using a byte
 *    accumulator, not JS string length (§17).
 *  - Host and Origin headers are validated against the bind mode to block
 *    DNS-rebinding and cross-site requests (§17).
 *  - Read-only: REST is GET-only; MCP exposes query tools only. No write
 *    endpoints exist (§18).
 */
import { projectAtTime, type ProjectableNote } from "../core/temporal";
import { buildGraphitiEpisodesWithContent } from "../core/graphiti";
import { KOSMOS_VERSION } from "../core/version";
import type { KosmosGraph, KosmosNode } from "../core/types";

export const SUPPORTED_MCP_PROTOCOL_VERSIONS = ["2025-03-26", "2024-11-05"];
export const LATEST_MCP_PROTOCOL_VERSION = SUPPORTED_MCP_PROTOCOL_VERSIONS[0];

/** Request-body cap in BYTES (4 MiB). Documented unit: bytes, not JS chars. */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

export type AgentBindMode = "localhost" | "lan";

/** Settings schema version — bump when the shape changes so old data migrates (Doc1 §3.7). */
export const AGENT_SETTINGS_SCHEMA = 2;

export interface AgentSettings {
  /** Settings schema version for migration on load. */
  schemaVersion?: number;
  agentEnabled: boolean;
  agentPort: number;
  agentToken: string;
  agentRequireToken: boolean;
  agentBindMode: AgentBindMode;
  /** Accept `?token=` query authentication. Deprecated, OFF by default (Doc1 §3.6);
   *  always rejected in LAN mode regardless of this flag. */
  agentAllowQueryToken: boolean;
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  schemaVersion: AGENT_SETTINGS_SCHEMA,
  agentEnabled: false,
  agentPort: 4816,
  agentToken: "",
  agentRequireToken: true,
  agentBindMode: "localhost",
  agentAllowQueryToken: false,
};

/** Migrate persisted settings from any prior schema to the current one (Doc1 §3.7). */
export function migrateAgentSettings(raw: any): AgentSettings {
  const s: AgentSettings = Object.assign({}, DEFAULT_AGENT_SETTINGS, raw || {});
  // v1 had no agentAllowQueryToken and accepted query tokens implicitly. Migrating
  // to v2 turns that OFF by default; the user can re-enable it explicitly.
  if (!raw || raw.schemaVersion == null) s.agentAllowQueryToken = false;
  s.schemaVersion = AGENT_SETTINGS_SCHEMA;
  return s;
}

/** Output caps returned by the read-only API (Doc2 §5.6). */
export const MAX_NOTE_CONTENT_CHARS = 200_000;
export const MAX_SEARCH_RESULTS = 200;
export const MAX_EPISODES = 50_000;

/** Rate + concurrency limits per client (Doc2 §5.4). Enforced in LAN mode; loopback is exempt. */
export const RATE_WINDOW_MS = 10_000;
export const RATE_MAX_REQUESTS = 240;      // ~24 req/s sustained per client
export const MAX_CONCURRENT_REQUESTS = 24;
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Generate an auth token from a cryptographically secure source (§16).
 * 32 random bytes, base64url-encoded. Throws when no secure RNG exists —
 * never silently downgrades to Math.random().
 */
export function makeToken(): string {
  const c: any = (globalThis as any).crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error(
      "Vault Kosmos: no cryptographically secure random source (crypto.getRandomValues) is available; refusing to create an insecure token."
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
  getGraph(): Promise<KosmosGraph>;
  /** Note body with frontmatter stripped, or null when unknown. */
  getNoteContent(path: string): Promise<string | null>;
  vaultName(): string;
  /** Extra hostnames (LAN IPs) accepted in Host/Origin checks when binding to LAN. */
  lanAddresses(): string[];
}

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);

export class KosmosAgentServer {
  settings: AgentSettings;
  provider: AgentDataProvider;
  private http: any;
  server: any = null;
  status = "stopped";
  private inFlight = 0;
  private hits = new Map<string, number[]>(); // client -> recent request timestamps
  /** Fired with the note paths one query touched, so the viewer can render a
   *  live agent-traversal trail. Read-only queries only; broad/whole-vault
   *  queries (vault_overview, graph_at_time, export_graphiti_episodes) are
   *  intentionally not reported — lighting up the entire vault isn't a trail. */
  onTraversal?: (paths: string[], tool: string) => void;

  private reportTraversal(tool: string, paths: string[]): void {
    if (this.onTraversal && paths.length) this.onTraversal(paths, tool);
  }

  constructor(http: any, settings: AgentSettings, provider: AgentDataProvider) {
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
      this.status = "error: " + (e?.code === "EADDRINUSE" ? `port ${this.settings.agentPort} is busy — pick another port in settings` : (e?.message || e));
      onError?.(this.status);
      this.server = null;
    });
    srv.listen(this.settings.agentPort, this.bindHost, () => { this.status = "running"; });
    this.server = srv;
  }

  stop(): void {
    try { this.server && this.server.close(); } catch (_) { /* already closed */ }
    this.server = null;
    this.status = "stopped";
    this.inFlight = 0;
    this.hits.clear();
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

  /** Sliding-window rate limit + concurrency cap, applied to non-loopback clients. */
  private rateLimited(req: any): { limited: boolean; reason?: string } {
    const remote = String(req.socket?.remoteAddress || "");
    const isLoopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1" || remote === "";
    if (isLoopback) return { limited: false }; // local agents are trusted for throughput
    if (this.inFlight >= MAX_CONCURRENT_REQUESTS) return { limited: true, reason: "too many concurrent requests" };
    const now = performance.now();
    const arr = (this.hits.get(remote) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (arr.length >= RATE_MAX_REQUESTS) { this.hits.set(remote, arr); return { limited: true, reason: "rate limit exceeded" }; }
    arr.push(now);
    this.hits.set(remote, arr);
    return { limited: false };
  }

  /* ---------------- security gates ---------------- */

  private allowedHostnames(): Set<string> {
    const allowed = new Set(LOCAL_HOSTNAMES);
    if (this.settings.agentBindMode === "lan") {
      for (const ip of this.provider.lanAddresses()) allowed.add(ip.toLowerCase());
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
      const chunks: any[] = [];
      let receivedBytes = 0;
      let done = false;
      const onData = (c: any) => {
        receivedBytes += typeof c === "string" ? Buffer.byteLength(c) : c.length;
        if (receivedBytes > limit) {
          done = true;
          req.removeListener("data", onData);
          req.pause();
          reject(Object.assign(new Error(`body too large (limit ${limit} bytes)`), { statusCode: 413 }));
          return;
        }
        chunks.push(typeof c === "string" ? Buffer.from(c) : c);
      };
      req.on("data", onData);
      req.on("end", () => { if (!done) resolve(Buffer.concat(chunks).toString("utf8")); });
      req.on("error", (e: any) => { if (!done) reject(e); });
    });
  }

  json(res: any, code: number, obj: any): void {
    const body = JSON.stringify(obj, null, 2);
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(body);
  }

  /* ---------------- shared query helpers (one graph, §33) ---------------- */

  private fileNodes(graph: KosmosGraph): KosmosNode[] {
    return graph.nodes.filter((n) => n.kind === "file");
  }

  private brief(n: KosmosNode): any {
    return {
      title: n.label, path: n.path, type: n.okf?.type || n.type || "note", area: n.area, tags: n.tags,
      timestamp: n.validAt ?? null,
      head: !!(n.okf && n.okf.head),
      superseded: !!(n.okf && n.okf.invalidAt),
      invalidAt: n.okf?.invalidAt ?? null,
    };
  }

  private findNode(graph: KosmosGraph, sel: { path?: string; title?: string }): KosmosNode | null {
    const files = this.fileNodes(graph);
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
      files.find((n) => (n.okf?.title || "").toLowerCase() === q) ??
      null
    );
  }

  private projectables(graph: KosmosGraph): ProjectableNote[] {
    const out: ProjectableNote[] = [];
    for (const n of this.fileNodes(graph)) {
      const v = n.validAt ? Date.parse(n.validAt) : NaN;
      if (Number.isNaN(v)) continue;
      const inv = n.okf?.invalidAt ? Date.parse(n.okf.invalidAt) : null;
      out.push({ id: n.id, validAtMs: v, invalidAtMs: inv != null && !Number.isNaN(inv) ? inv : null });
    }
    return out;
  }

  /* ---------------- queries (shared by REST + MCP tools) ---------------- */

  async qOverview(): Promise<any> {
    const graph = await this.provider.getGraph();
    const ns = this.fileNodes(graph);
    return {
      vault: this.provider.vaultName(),
      version: KOSMOS_VERSION,
      readOnly: true,
      notes: ns.length,
      areas: [...new Set(ns.map((n) => n.area))].sort(),
      okfNotes: ns.filter((n) => n.okf).length,
      heads: ns.filter((n) => n.okf && n.okf.head).length,
      superseded: ns.filter((n) => n.okf && n.okf.invalidAt).length,
      lineageEdges: graph.diagnostics.lineageEdges,
      semanticEdges: graph.links.filter((l) => l.kind === "semantic").length,
      timeSpan: (graph as any).__timeSpan ?? null,
      diagnostics: graph.diagnostics,
      indexBuiltAt: graph.stats.indexedAt,
    };
  }

  async qDiagnostics(): Promise<any> {
    const graph = await this.provider.getGraph();
    return graph.diagnostics;
  }

  async qSearch(query: string, opts: { tag?: string; area?: string; limit?: number } = {}): Promise<any> {
    const graph = await this.provider.getGraph();
    const q = String(query || "").toLowerCase();
    const lim = Math.max(1, Math.min(MAX_SEARCH_RESULTS, opts.limit || 20));
    const scored: Array<[number, KosmosNode]> = [];
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
    const top = scored.slice(0, lim).map(([, n]) => n);
    this.reportTraversal("search_notes", top.map((n) => n.path));
    return {
      query,
      method: "lexical (title/alias/tag/path substring; no embeddings)",
      total: scored.length,
      results: top.map((n) => this.brief(n)),
    };
  }

  async qNote(sel: { path?: string; title?: string }): Promise<any> {
    const graph = await this.provider.getGraph();
    const n = this.findNode(graph, sel);
    if (!n) return { error: "note not found", hint: "pass path (e.g. Ideas/Engine v2.md) or title" };
    const nameOf = (id: string) => graph.nodes.find((x) => x.id === id)?.label ?? id;
    const outgoing = graph.links.filter((l) => l.source === n.id && l.kind !== "contains" && l.kind !== "lineage").map((l) => l.target);
    const backlinks = graph.links.filter((l) => l.target === n.id && l.kind !== "contains" && l.kind !== "lineage").map((l) => l.source);
    const semantic = graph.links.filter((l) => l.source === n.id && l.kind === "semantic").map((l) => l.target);
    const content = await this.provider.getNoteContent(n.path);
    this.reportTraversal("get_note", [n.path]);
    return {
      ...this.brief(n),
      aliases: n.aliases,
      okf: n.okf ? {
        supersedes: (n.okf.supersedesIds ?? []).map(nameOf),
        superseded_by: (n.okf.supersededByIds ?? []).map(nameOf),
        declared_supersedes: n.okf.supersedes,
        declared_superseded_by: n.okf.supersededBy,
        related: n.okf.related,
      } : null,
      links: { outgoing, backlinks, semantic },
      content: this.capContent(content ?? ""),
    };
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
    const byId = new Map(graph.nodes.map((x) => [x.id, x]));
    const seen = new Set<string>();
    const chain: KosmosNode[] = [];
    const walk = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const x = byId.get(id);
      if (!x) return;
      for (const a of (x.okf?.supersedesIds ?? [])) walk(a);
      chain.push(x);
      for (const d of (x.okf?.supersededByIds ?? [])) walk(d);
    };
    walk(n.id);
    chain.sort((a, b) => (Date.parse(a.validAt || "") || 0) - (Date.parse(b.validAt || "") || 0));
    this.reportTraversal("get_lineage", chain.map((x) => x.path));
    return {
      for: n.path,
      chainLength: chain.length,
      chain: chain.map((x) => ({ ...this.brief(x), current: x.id === n.id })),
    };
  }

  async qRelated(sel: { path?: string; title?: string }): Promise<any> {
    const graph = await this.provider.getGraph();
    const n = this.findNode(graph, sel);
    if (!n) return { error: "note not found" };
    const byId = new Map(graph.nodes.map((x) => [x.id, x]));
    const b = (id: string) => { const x = byId.get(id); return x ? this.brief(x) : { path: id }; };
    const semanticIds = graph.links.filter((l) => l.source === n.id && l.kind === "semantic").map((l) => l.target);
    const outgoingIds = graph.links.filter((l) => l.source === n.id && l.kind !== "contains" && l.kind !== "lineage").map((l) => l.target);
    const backlinkIds = graph.links.filter((l) => l.target === n.id && l.kind !== "contains" && l.kind !== "lineage").map((l) => l.source);
    const touched = [n.id, ...semanticIds, ...outgoingIds, ...backlinkIds].map((id) => byId.get(id)?.path).filter(Boolean) as string[];
    this.reportTraversal("get_related", touched);
    return { for: n.path, semantic: semanticIds.map(b), outgoing: outgoingIds.map(b), backlinks: backlinkIds.map(b) };
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
      .map((n: any) => this.brief(n));
    const valid = briefs(projection.valid);
    const superseded = briefs(projection.superseded);
    return {
      at: projection.at,
      semantics: "temporal validity intervals: valid = written by T and not yet superseded; superseded = a newer version already existed at T; notes with valid_at > T did not exist yet",
      counts: { valid: valid.length, superseded: superseded.length, notYetCreated: projection.notYetCreated.length },
      valid: valid.slice(0, limit),
      superseded: superseded.slice(0, limit),
    };
  }

  async qEpisodes(limit?: number): Promise<any[]> {
    const graph = await this.provider.getGraph();
    const contents = new Map<string, string>();
    for (const n of this.fileNodes(graph)) {
      const c = await this.provider.getNoteContent(n.path);
      if (c != null) contents.set(n.path, c);
    }
    const episodes = buildGraphitiEpisodesWithContent(graph, contents, { vault: this.provider.vaultName() });
    const cap = Math.min(limit ?? MAX_EPISODES, MAX_EPISODES);
    return episodes.slice(0, cap);
  }

  async qGraph(): Promise<any> {
    const graph = await this.provider.getGraph();
    const nodes = this.fileNodes(graph).map((n) => this.brief(n));
    const links: any[] = [];
    for (const l of graph.links) {
      if (l.kind === "contains") continue;
      links.push({ source: l.source, target: l.target, kind: l.kind === "lineage" ? "lineage" : l.kind === "semantic" ? "semantic" : "wikilink" });
    }
    return { builtAt: graph.stats.indexedAt, nodes, links };
  }

  /* ---------------- MCP (Streamable HTTP, stateless, tools only) ---------------- */

  toolDefs(): any[] {
    const sel = {
      path: { type: "string", description: "Vault-relative path, e.g. Ideas/Engine v2.md" },
      title: { type: "string", description: "Note title / basename / alias" },
    };
    return [
      { name: "vault_overview", description: "Vault + OKF+ knowledge-graph stats: note counts, heads, superseded ghosts, lineage/semantic edge counts, diagnostics.", inputSchema: { type: "object", properties: {} } },
      { name: "search_notes", description: "Lexical search over titles, aliases, tags and paths (no embeddings). Optional tag/area filters. Results carry OKF+ status (head/superseded).", inputSchema: { type: "object", properties: { query: { type: "string" }, tag: { type: "string" }, area: { type: "string" }, limit: { type: "number" } }, required: ["query"] } },
      { name: "get_note", description: "Full note: content (frontmatter stripped), canonical OKF+ lineage fields, outgoing links, backlinks, semantic Related links.", inputSchema: { type: "object", properties: sel } },
      { name: "get_lineage", description: "The canonical OKF+ knowledge chain (supersedes/superseded_by, normalized bidirectionally) for a note, ordered oldest→newest with HEAD marked.", inputSchema: { type: "object", properties: sel } },
      { name: "get_related", description: "Neighbors of a note: semantic (OKF+ **Related:** footer), outgoing wikilinks, and backlinks.", inputSchema: { type: "object", properties: sel } },
      { name: "graph_at_time", description: "Point-in-time snapshot using temporal validity intervals: which notes were valid vs already superseded at the given ISO time.", inputSchema: { type: "object", properties: { time: { type: "string", description: "ISO 8601" }, limit: { type: "number" } }, required: ["time"] } },
      { name: "export_graphiti_episodes", description: "The whole vault as Graphiti-ingestable episodes (EpisodeType.json, chronological, canonical lineage in the body) — same payload as the plugin's export command.", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
    ];
  }

  async callTool(name: string, args: any): Promise<any> {
    args = args || {};
    switch (name) {
      case "vault_overview": return this.qOverview();
      case "search_notes": return this.qSearch(args.query, args);
      case "get_note": return this.qNote(args);
      case "get_lineage": return this.qLineage(args);
      case "get_related": return this.qRelated(args);
      case "graph_at_time": return this.qAtTime(args.time, args.limit);
      case "export_graphiti_episodes": return this.qEpisodes(args.limit);
      default: throw new Error("unknown tool: " + name);
    }
  }

  /** Negotiate the MCP protocol version (§15). */
  negotiateProtocolVersion(requested: unknown): string {
    if (typeof requested === "string" && SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(requested)) return requested;
    return LATEST_MCP_PROTOCOL_VERSION;
  }

  async mcpDispatch(msg: any): Promise<any | null> {
    if (!msg || typeof msg !== "object") return { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } };
    const { id, method, params } = msg;
    if (id === undefined || id === null) return null; // notification: accept silently
    const ok = (result: any) => ({ jsonrpc: "2.0", id, result });
    try {
      if (method === "initialize") {
        return ok({
          protocolVersion: this.negotiateProtocolVersion(params?.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "vault-kosmos", version: KOSMOS_VERSION },
          instructions: "Read-only Obsidian vault knowledge graph (Vault Kosmos / Kosmos-Oden, OKF+). Temporal lineage via get_lineage/graph_at_time; content via get_note; Graphiti ingest payload via export_graphiti_episodes. This server never modifies the vault.",
        });
      }
      if (method === "ping") return ok({});
      if (method === "tools/list") return ok({ tools: this.toolDefs() });
      if (method === "tools/call") {
        try {
          const r = await this.callTool(params?.name, params?.arguments);
          return ok({ content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: false });
        } catch (e: any) {
          return ok({ content: [{ type: "text", text: "Error: " + (e?.message || String(e)) }], isError: true });
        }
      }
      if (method === "resources/list") return ok({ resources: [] });
      if (method === "prompts/list") return ok({ prompts: [] });
      return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + method } };
    } catch (e: any) {
      return { jsonrpc: "2.0", id, error: { code: -32603, message: e?.message || "Internal error" } };
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
    this.inFlight++;
    try {
      await this.dispatch(req, res);
    } finally {
      this.inFlight = Math.max(0, this.inFlight - 1);
    }
  }

  private async dispatch(req: any, res: any): Promise<void> {
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
      if (req.method === "GET") { res.writeHead(405, { Allow: "POST, DELETE", "Cache-Control": "no-store" }); res.end(); return; }
      if (req.method === "DELETE") { res.writeHead(200, { "Cache-Control": "no-store" }); res.end(); return; } // stateless: nothing to terminate
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
      let parsed: any;
      try { parsed = JSON.parse(body || "null"); }
      catch (_) { this.json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); return; }
      if (Array.isArray(parsed)) {
        const outs: any[] = [];
        for (const m of parsed) { const r = await this.mcpDispatch(m); if (r) outs.push(r); }
        if (!outs.length) { res.writeHead(202); res.end(); } else this.json(res, 200, outs);
        return;
      }
      const out = await this.mcpDispatch(parsed);
      if (!out) { res.writeHead(202); res.end(); } else this.json(res, 200, out);
      return;
    }

    if (req.method !== "GET") { this.json(res, 405, { error: "GET only (read-only API)" }); return; }
    const q = (k: string) => u.searchParams.get(k) || undefined;
    switch (path) {
      case "/":
        this.json(res, 200, {
          name: "Vault Kosmos Agent API",
          version: KOSMOS_VERSION,
          readOnly: true,
          auth: "Authorization: Bearer <token> or x-api-key: <token>",
          mcp: { endpoint: "/mcp", transport: "streamable-http (stateless JSON responses)", supportedProtocolVersions: SUPPORTED_MCP_PROTOCOL_VERSIONS },
          rest: ["/health", "/overview", "/diagnostics", "/graph", "/notes?q=&tag=&area=&limit=", "/note?path=|title=", "/lineage?path=|title=", "/related?path=|title=", "/at?time=ISO", "/episodes"],
        });
        return;
      case "/health": this.json(res, 200, { ok: true, name: "vault-kosmos", version: KOSMOS_VERSION, vault: this.provider.vaultName() }); return;
      case "/overview": this.json(res, 200, await this.qOverview()); return;
      case "/diagnostics": this.json(res, 200, await this.qDiagnostics()); return;
      case "/graph": this.json(res, 200, await this.qGraph()); return;
      case "/notes": this.json(res, 200, await this.qSearch(q("q") || "", { tag: q("tag"), area: q("area"), limit: q("limit") ? Number(q("limit")) : undefined })); return;
      case "/note": this.json(res, 200, await this.qNote({ path: q("path"), title: q("title") })); return;
      case "/lineage": this.json(res, 200, await this.qLineage({ path: q("path"), title: q("title") })); return;
      case "/related": this.json(res, 200, await this.qRelated({ path: q("path"), title: q("title") })); return;
      case "/at": this.json(res, 200, await this.qAtTime(q("time") || "", q("limit") ? Number(q("limit")) : 50)); return;
      case "/episodes": this.json(res, 200, await this.qEpisodes()); return;
      default: this.json(res, 404, { error: "not found", see: "/" });
    }
  }
}
