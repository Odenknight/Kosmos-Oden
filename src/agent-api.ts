/* Vault Kosmos — local Agent API (HTTP + MCP), read-only. — OdenKnight
 * Gives agents direct access to the vault's OKF+ temporal knowledge graph:
 * lineage chains, point-in-time queries, semantic links, lexical search, and
 * Graphiti episode export — over plain REST and MCP (Streamable HTTP, stateless).
 * Desktop only (Obsidian mobile has no Node http). Binds to 127.0.0.1 by default; an explicit opt-in allows LAN/VLAN access. Never writes notes.
 */
import { App, Notice, Plugin, PluginSettingTab, Setting, Platform } from "obsidian";

declare const require: any;
const nodeHttp: any = (() => { try { const rq: any = (typeof require !== "undefined" ? require : (window as any)?.require); return rq ? rq("http") : null; } catch (_) { return null; } })();

export type AgentBindMode = "localhost" | "lan";
export interface AgentSettings { agentEnabled: boolean; agentPort: number; agentToken: string; agentRequireToken: boolean; agentBindMode: AgentBindMode; }
export const DEFAULT_AGENT_SETTINGS: AgentSettings = { agentEnabled: false, agentPort: 4816, agentToken: "", agentRequireToken: true, agentBindMode: "localhost" };

/** The machine's own LAN IPv4 addresses (Node "os" module) — what agents on the same subnet/VLAN should use instead of 127.0.0.1. */
export function lanAddresses(): string[] {
  try {
    const rq: any = (typeof require !== "undefined" ? require : (window as any)?.require);
    const os = rq ? rq("os") : null; if (!os) return [];
    const ifaces = os.networkInterfaces(); const out: string[] = [];
    for (const name of Object.keys(ifaces || {})) for (const info of (ifaces[name] || []))
      if (info.family === "IPv4" && !info.internal) out.push(info.address);
    return out;
  } catch (_) { return []; }
}

export function makeToken(): string {
  const n = 24; let s = "";
  const c: any = (globalThis as any).crypto;
  if (c && c.getRandomValues) { const a = new Uint8Array(n); c.getRandomValues(a); for (const b of a) s += (b % 16).toString(16); }
  else { for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16); }
  return s;
}

/* ---------------- shared: OKF+ note reading + Graphiti episodes ---------------- */
const listOf = (v: unknown): string[] => Array.isArray(v) ? v.map(String).map(x => x.trim()).filter(Boolean)
  : (typeof v === "string" ? v.split(",").map(x => x.trim()).filter(Boolean) : []);
const relatedOf = (raw: string): string[] => {
  const out: string[] = []; const m = raw.match(/^\s*\*\*Related:?\*\*\s*(.+)$/mi);
  if (m) { let w; const rx = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g; while ((w = rx.exec(m[1]))) out.push(w[1].trim()); }
  return out;
};
const stripFm = (raw: string) => raw.replace(/^---[\s\S]*?---\s*/, "");

export async function buildEpisodes(app: App): Promise<any[]> {
  const md = app.vault.getMarkdownFiles(); const vaultName = app.vault.getName(); const episodes: any[] = [];
  // One Graphiti group per vault keeps multi-vault graphs separable (add_episode group_id — stable across graphiti-core 0.2x).
  const groupId = vaultName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "vault";
  for (const f of md) {
    const raw = await app.vault.cachedRead(f);
    const fm: any = (app.metadataCache.getFileCache(f) as any)?.frontmatter ?? {};
    const tsRaw = typeof fm.timestamp === "string" ? Date.parse(fm.timestamp) : NaN;
    const ts = Number.isNaN(tsRaw) ? new Date(f.stat.ctime).toISOString() : new Date(tsRaw).toISOString();
    const title = typeof fm.title === "string" && fm.title ? fm.title : f.basename;
    episodes.push({
      name: title,
      episode_body: JSON.stringify({ title, path: f.path, type: typeof fm.type === "string" ? fm.type : "note",
        tags: listOf(fm.tags), timestamp: ts, supersedes: listOf(fm.supersedes), superseded_by: listOf(fm.superseded_by ?? fm.supersededBy),
        related: relatedOf(raw), content: stripFm(raw) }),
      source: "json",
      source_description: `Obsidian OKF+ note \u00b7 vault "${vaultName}" \u00b7 ${f.path}`,
      reference_time: ts,
      group_id: groupId
    });
  }
  episodes.sort((a, b) => a.reference_time.localeCompare(b.reference_time));
  return episodes;
}

/* ---------------- vault index (cached; rebuilt when the vault changes) ---------------- */
interface IdxNote { path: string; title: string; basename: string; area: string; tags: string[]; aliases: string[];
  type: string; timestamp: string; validAt: number; supersedesTitles: string[]; supersededByTitles: string[];
  related: string[]; supersedesPaths: string[]; supersededByPaths: string[]; invalidAt: number | null; head: boolean;
  out: string[]; back: string[]; semantic: string[]; }
interface AgentIndex { builtAt: string; notes: Map<string, IdxNote>; byTitle: Map<string, string>; timeSpan: { min: number, max: number } | null; }

export class AgentApiServer {
  plugin: Plugin & { agentSettings: AgentSettings };
  server: any = null;
  index: AgentIndex | null = null;
  dirty = true;
  status = "stopped";
  /** Set by the plugin: receives the vault-relative paths each query touched (drives the Kosmos traversal overlay). */
  onTraversal: ((paths: string[], tool: string) => void) | null = null;
  private lanCache: { at: number; ips: string[] } = { at: 0, ips: [] };

  constructor(plugin: any) { this.plugin = plugin; }
  markDirty(): void { this.dirty = true; }
  get app(): App { return this.plugin.app; }
  get bindHost(): string { return this.plugin.agentSettings.agentBindMode === "lan" ? "0.0.0.0" : "127.0.0.1"; }
  get url(): string { return `http://127.0.0.1:${this.plugin.agentSettings.agentPort}`; }
  get lanUrls(): string[] { return lanAddresses().map(ip => `http://${ip}:${this.plugin.agentSettings.agentPort}`); }

  async getIndex(): Promise<AgentIndex> {
    if (this.index && !this.dirty) return this.index;
    const notes = new Map<string, IdxNote>(); const byTitle = new Map<string, string>();
    const md = this.app.vault.getMarkdownFiles();
    for (const f of md) {
      const raw = await this.app.vault.cachedRead(f);
      const fm: any = (this.app.metadataCache.getFileCache(f) as any)?.frontmatter ?? {};
      const tsRaw = typeof fm.timestamp === "string" ? Date.parse(fm.timestamp) : NaN;
      const validAt = Number.isNaN(tsRaw) ? f.stat.ctime : tsRaw;
      const title = typeof fm.title === "string" && fm.title ? fm.title : f.basename;
      const n: IdxNote = { path: f.path, title, basename: f.basename, area: f.path.includes("/") ? f.path.split("/")[0] : "Root",
        tags: listOf(fm.tags), aliases: listOf(fm.aliases), type: typeof fm.type === "string" ? fm.type : "note",
        timestamp: new Date(validAt).toISOString(), validAt,
        supersedesTitles: listOf(fm.supersedes), supersededByTitles: listOf(fm.superseded_by ?? fm.supersededBy),
        related: relatedOf(raw), supersedesPaths: [], supersededByPaths: [], invalidAt: null, head: false, out: [], back: [], semantic: [] };
      notes.set(f.path, n);
      byTitle.set(title.toLowerCase(), f.path); byTitle.set(f.basename.toLowerCase(), f.path);
      byTitle.set(f.path.replace(/\.md$/i, "").toLowerCase(), f.path);
      for (const a of n.aliases) byTitle.set(a.toLowerCase(), f.path);
    }
    const resolve = (t: string) => byTitle.get(String(t || "").trim().toLowerCase());
    const rl: any = (this.app.metadataCache as any).resolvedLinks || {};
    for (const n of notes.values()) {
      n.out = Object.keys(rl[n.path] || {}).filter(p => notes.has(p));
      n.supersedesPaths = n.supersedesTitles.map(resolve).filter(Boolean) as string[];
      n.supersededByPaths = n.supersededByTitles.map(resolve).filter(Boolean) as string[];
      n.semantic = n.related.map(resolve).filter(Boolean) as string[];
    }
    for (const n of notes.values()) for (const t of n.out) notes.get(t)!.back.push(n.path);
    let tmin = Infinity, tmax = -Infinity;
    for (const n of notes.values()) {
      let inv: number | null = null;
      for (const sp of n.supersededByPaths) { const s = notes.get(sp); if (s && (inv == null || s.validAt < inv)) inv = s.validAt; }
      n.invalidAt = inv; n.head = !inv && (n.supersedesPaths.length > 0 || n.supersededByPaths.length > 0);
      if (n.validAt < tmin) tmin = n.validAt; const hi = inv ?? n.validAt; if (hi > tmax) tmax = hi;
    }
    this.index = { builtAt: new Date().toISOString(), notes, byTitle, timeSpan: tmin < tmax ? { min: tmin, max: tmax } : null };
    this.dirty = false; return this.index;
  }

  findNote(idx: AgentIndex, q: { path?: string, title?: string }): IdxNote | null {
    if (q.path && idx.notes.has(q.path)) return idx.notes.get(q.path)!;
    if (q.path) { const p = idx.byTitle.get(q.path.toLowerCase()); if (p) return idx.notes.get(p)!; }
    if (q.title) { const p = idx.byTitle.get(q.title.toLowerCase()); if (p) return idx.notes.get(p)!; }
    return null;
  }
  brief(n: IdxNote): any { return { title: n.title, path: n.path, type: n.type, area: n.area, tags: n.tags,
    timestamp: n.timestamp, head: n.head, superseded: !!n.invalidAt,
    invalidAt: n.invalidAt ? new Date(n.invalidAt).toISOString() : null }; }

  /* ---------------- queries (shared by REST + MCP tools) ---------------- */
  async qOverview(): Promise<any> {
    const idx = await this.getIndex(); const ns = [...idx.notes.values()];
    return { vault: this.app.vault.getName(), version: "0.5.1", readOnly: true, notes: ns.length,
      areas: [...new Set(ns.map(n => n.area))].sort(),
      okfNotes: ns.filter(n => n.supersedesTitles.length || n.supersededByTitles.length || n.related.length || n.type !== "note").length,
      heads: ns.filter(n => n.head).length, superseded: ns.filter(n => n.invalidAt).length,
      lineageEdges: ns.reduce((a, n) => a + n.supersededByPaths.length, 0),
      semanticEdges: ns.reduce((a, n) => a + n.semantic.length, 0),
      timeSpan: idx.timeSpan ? { from: new Date(idx.timeSpan.min).toISOString(), to: new Date(idx.timeSpan.max).toISOString() } : null,
      indexBuiltAt: idx.builtAt };
  }
  async qSearch(query: string, opts: { tag?: string, area?: string, limit?: number } = {}): Promise<any> {
    const idx = await this.getIndex(); const q = String(query || "").toLowerCase();
    const lim = Math.max(1, Math.min(200, opts.limit || 20));
    const scored: [number, IdxNote][] = [];
    for (const n of idx.notes.values()) {
      if (opts.tag && !n.tags.some(t => t.toLowerCase() === String(opts.tag).toLowerCase())) continue;
      if (opts.area && n.area.toLowerCase() !== String(opts.area).toLowerCase()) continue;
      let s = -1;
      if (!q) s = 0;
      else if (n.title.toLowerCase().startsWith(q)) s = 3;
      else if (n.title.toLowerCase().includes(q)) s = 2;
      else if (n.aliases.some(a => a.toLowerCase().includes(q)) || n.tags.some(t => t.toLowerCase().includes(q))) s = 1.5;
      else if (n.path.toLowerCase().includes(q)) s = 1;
      if (s >= 0) scored.push([s, n]);
    }
    scored.sort((a, b) => (b[0] - a[0]) || (b[1].validAt - a[1].validAt));
    return { query, method: "lexical (title/alias/tag/path substring; no embeddings)", total: scored.length,
      results: scored.slice(0, lim).map(([, n]) => this.brief(n)) };
  }
  async qNote(sel: { path?: string, title?: string }): Promise<any> {
    const idx = await this.getIndex(); const n = this.findNote(idx, sel);
    if (!n) return { error: "note not found", hint: "pass path (e.g. Ideas/Engine v2.md) or title" };
    const file = this.app.vault.getMarkdownFiles().find(f => f.path === n.path);
    const raw = file ? await this.app.vault.cachedRead(file) : "";
    return { ...this.brief(n), aliases: n.aliases,
      okf: { supersedes: n.supersedesTitles, superseded_by: n.supersededByTitles, related: n.related },
      links: { outgoing: n.out, backlinks: n.back, semantic: n.semantic },
      content: stripFm(raw) };
  }
  async qLineage(sel: { path?: string, title?: string }): Promise<any> {
    const idx = await this.getIndex(); const n = this.findNote(idx, sel);
    if (!n) return { error: "note not found" };
    const seen = new Set<string>(); const chain: IdxNote[] = [];
    const walk = (p: string) => { if (seen.has(p)) return; seen.add(p); const x = idx.notes.get(p); if (!x) return;
      for (const a of x.supersedesPaths) walk(a); chain.push(x); for (const d of x.supersededByPaths) walk(d); };
    walk(n.path);
    chain.sort((a, b) => a.validAt - b.validAt);
    return { for: n.path, chainLength: chain.length,
      chain: chain.map(x => ({ ...this.brief(x), current: x.path === n.path })) };
  }
  async qRelated(sel: { path?: string, title?: string }): Promise<any> {
    const idx = await this.getIndex(); const n = this.findNote(idx, sel);
    if (!n) return { error: "note not found" };
    const b = (p: string) => { const x = idx.notes.get(p); return x ? this.brief(x) : { path: p }; };
    return { for: n.path, semantic: n.semantic.map(b), outgoing: n.out.map(b), backlinks: n.back.map(b) };
  }
  async qAtTime(time: string, limit = 50): Promise<any> {
    const idx = await this.getIndex(); const T = Date.parse(time);
    if (Number.isNaN(T)) return { error: "invalid time; use ISO 8601, e.g. 2026-04-01 or 2026-04-01T00:00:00Z" };
    const live: any[] = [], ghosts: any[] = [];
    for (const n of idx.notes.values()) { if (n.validAt > T) continue;
      (n.invalidAt != null && n.invalidAt <= T ? ghosts : live).push(this.brief(n)); }
    const byT = (a: any, b: any) => b.timestamp.localeCompare(a.timestamp);
    live.sort(byT); ghosts.sort(byT);
    return { at: new Date(T).toISOString(), semantics: "Graphiti-style bi-temporal snapshot: valid = written by T and not yet superseded; superseded = a newer version already existed at T",
      counts: { valid: live.length, superseded: ghosts.length },
      valid: live.slice(0, limit), superseded: ghosts.slice(0, limit) };
  }

  /* ---------------- MCP (Streamable HTTP, stateless, tools only) ---------------- */
  toolDefs(): any[] {
    const sel = { path: { type: "string", description: "Vault-relative path, e.g. Ideas/Engine v2.md" },
                  title: { type: "string", description: "Note title / basename / alias" } };
    return [
      { name: "vault_overview", description: "Vault + OKF+ knowledge-graph stats: note counts, heads, superseded ghosts, lineage/semantic edge counts, time span.", inputSchema: { type: "object", properties: {} } },
      { name: "search_notes", description: "Lexical search over titles, aliases, tags and paths (no embeddings). Optional tag/area filters. Results carry OKF+ status (head/superseded).", inputSchema: { type: "object", properties: { query: { type: "string" }, tag: { type: "string" }, area: { type: "string" }, limit: { type: "number" } }, required: ["query"] } },
      { name: "get_note", description: "Full note: content (frontmatter stripped), OKF+ fields, outgoing links, backlinks, semantic Related links.", inputSchema: { type: "object", properties: sel } },
      { name: "get_lineage", description: "The OKF+ knowledge chain (supersedes/superseded_by) for a note, ordered oldest\u2192newest with HEAD marked \u2014 Graphiti-style fact evolution.", inputSchema: { type: "object", properties: sel } },
      { name: "get_related", description: "Neighbors of a note: semantic (OKF+ **Related:** footer), outgoing wikilinks, and backlinks.", inputSchema: { type: "object", properties: sel } },
      { name: "graph_at_time", description: "Point-in-time snapshot (Graphiti bi-temporal): which notes were valid vs already superseded at the given ISO time.", inputSchema: { type: "object", properties: { time: { type: "string", description: "ISO 8601" }, limit: { type: "number" } }, required: ["time"] } },
      { name: "export_graphiti_episodes", description: "The whole vault as Graphiti-ingestable episodes (EpisodeType.json, chronological) \u2014 same payload as the plugin's export command.", inputSchema: { type: "object", properties: { limit: { type: "number" } } } }
    ];
  }
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
  emitTraversal(tool: string, r: any): void {
    if (!this.onTraversal) return;
    const paths = this.traversalPaths(tool, r);
    if (paths.length) { try { this.onTraversal(paths, tool); } catch (_) { /* never break a request */ } }
  }

  async callTool(name: string, args: any): Promise<any> {
    args = args || {};
    const done = (r: any) => { this.emitTraversal(name, r); return r; };
    switch (name) {
      case "vault_overview": return this.qOverview();
      case "search_notes": return done(await this.qSearch(args.query, args));
      case "get_note": return done(await this.qNote(args));
      case "get_lineage": return done(await this.qLineage(args));
      case "get_related": return done(await this.qRelated(args));
      case "graph_at_time": return done(await this.qAtTime(args.time, args.limit));
      case "export_graphiti_episodes": { const eps = await buildEpisodes(this.app); return args.limit ? eps.slice(0, args.limit) : eps; }
      default: throw new Error("unknown tool: " + name);
    }
  }
  async mcpDispatch(msg: any): Promise<any | null> {
    if (!msg || typeof msg !== "object") return { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } };
    const { id, method, params } = msg;
    if (id === undefined || id === null) return null;                       // notification: accept silently
    const ok = (result: any) => ({ jsonrpc: "2.0", id, result });
    try {
      if (method === "initialize") return ok({
        protocolVersion: (params && typeof params.protocolVersion === "string") ? params.protocolVersion : "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "vault-kosmos", version: "0.5.1" },
        instructions: "Read-only Obsidian vault knowledge graph (Vault Kosmos, OKF+). Temporal lineage via get_lineage/graph_at_time; content via get_note; Graphiti ingest payload via export_graphiti_episodes. This server never modifies the vault." });
      if (method === "ping") return ok({});
      if (method === "tools/list") return ok({ tools: this.toolDefs() });
      if (method === "tools/call") {
        try { const r = await this.callTool(params?.name, params?.arguments);
          return ok({ content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: false }); }
        catch (e: any) { return ok({ content: [{ type: "text", text: "Error: " + (e?.message || String(e)) }], isError: true }); }
      }
      if (method === "resources/list") return ok({ resources: [] });
      if (method === "prompts/list") return ok({ prompts: [] });
      return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + method } };
    } catch (e: any) { return { jsonrpc: "2.0", id, error: { code: -32603, message: e?.message || "Internal error" } }; }
  }

  /* ---------------- HTTP plumbing ---------------- */
  /** Constant-time token comparison (length is public; contents never short-circuit). */
  private tokenOk(presented: string | null | undefined): boolean {
    const t = this.plugin.agentSettings.agentToken || "";
    const p = String(presented ?? "");
    if (!t || p.length !== t.length) return false;
    let d = 0;
    for (let i = 0; i < t.length; i++) d |= t.charCodeAt(i) ^ p.charCodeAt(i);
    return d === 0;
  }
  /** LAN IPs cached for 60 s (Host validation runs on every request). */
  private lanIps(): string[] {
    const now = Date.now();
    if (now - this.lanCache.at > 60000) this.lanCache = { at: now, ips: lanAddresses() };
    return this.lanCache.ips;
  }
  /** DNS-rebinding / cross-site guard: Host (and Origin, when present) must point at this machine.
   *  A malicious web page can make a victim's browser hit 127.0.0.1, or rebind a public DNS name
   *  onto it — but it cannot forge the Host header the browser sends. (Per the MCP spec's
   *  guidance for local Streamable-HTTP servers.) */
  hostAllowed(req: any): boolean {
    const norm = (v: any) => String(v || "").trim().toLowerCase();
    const hostOf = (v: any) => { const s = norm(v); const m = s.match(/^\[([^\]]+)\]/); return m ? m[1] : s.split(":")[0]; };
    const ok = (h: string) => !!h && (h === "127.0.0.1" || h === "localhost" || h === "::1"
      || (this.plugin.agentSettings.agentBindMode === "lan" && this.lanIps().includes(h)));
    if (!ok(hostOf(req.headers["host"]))) return false;
    const origin = req.headers["origin"];
    if (origin) { try { if (!ok(norm(new URL(String(origin)).hostname).replace(/^\[|\]$/g, ""))) return false; } catch (_) { return false; } }
    return true;
  }
  authorized(req: any, urlObj: any): boolean {
    const s = this.plugin.agentSettings;
    if (!s.agentRequireToken) return true;
    const h = String(req.headers["authorization"] || "");
    if (h.toLowerCase().startsWith("bearer ") && this.tokenOk(h.slice(7).trim())) return true;
    if (this.tokenOk(String(req.headers["x-api-key"] || ""))) return true;
    if (this.tokenOk(urlObj.searchParams.get("token"))) return true;
    return false;
  }
  start(): void {
    const s = this.plugin.agentSettings;
    if (this.server) this.stop();
    if (!nodeHttp) { this.status = "unavailable (mobile)"; new Notice("Vault Kosmos: the Agent API needs desktop Obsidian."); return; }
    const srv = nodeHttp.createServer((req: any, res: any) => { this.handle(req, res).catch((e: any) => {
      try { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: String(e?.message || e) })); } catch (_) {} }); });
    srv.on("error", (e: any) => {
      this.status = "error: " + (e?.code === "EADDRINUSE" ? `port ${s.agentPort} is busy \u2014 pick another port in settings` : (e?.message || e));
      new Notice("Vault Kosmos Agent API: " + this.status); this.server = null;
    });
    srv.listen(s.agentPort, this.bindHost, () => { this.status = "running"; });
    this.server = srv;
  }
  stop(): void { try { this.server && this.server.close(); } catch (_) {} this.server = null; this.status = "stopped"; }

  readBody(req: any): Promise<string> { return new Promise((resolve, reject) => {
    let b = ""; req.on("data", (c: any) => { b += c; if (b.length > 4e6) { reject(new Error("body too large")); try { req.destroy(); } catch (_) {} } });
    req.on("end", () => resolve(b)); req.on("error", reject); }); }
  json(res: any, code: number, obj: any): void { const body = JSON.stringify(obj, null, 2);
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(body); }

  async handle(req: any, res: any): Promise<void> {
    const u = new URL(req.url || "/", "http://127.0.0.1");
    const path = u.pathname.replace(/\/+$/, "") || "/";
    if (!this.hostAllowed(req)) { this.json(res, 403, { error: "forbidden", hint: "DNS-rebinding protection: Host/Origin must be 127.0.0.1, localhost, or (in LAN mode) this machine's LAN address" }); return; }
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    if (!this.authorized(req, u)) { this.json(res, 401, { error: "unauthorized", hint: "send Authorization: Bearer <token>, x-api-key, or ?token=" }); return; }

    if (path === "/mcp") {
      if (req.method === "GET") { res.writeHead(405, { "Allow": "POST, DELETE" }); res.end(); return; }
      if (req.method === "DELETE") { res.writeHead(200); res.end(); return; }        // stateless: nothing to terminate
      let parsed: any; try { parsed = JSON.parse((await this.readBody(req)) || "null"); }
      catch (_) { this.json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); return; }
      if (Array.isArray(parsed)) { const outs = []; for (const m of parsed) { const r = await this.mcpDispatch(m); if (r) outs.push(r); }
        if (!outs.length) { res.writeHead(202); res.end(); } else this.json(res, 200, outs); return; }
      const out = await this.mcpDispatch(parsed);
      if (!out) { res.writeHead(202); res.end(); } else this.json(res, 200, out); return;
    }

    if (req.method !== "GET") { this.json(res, 405, { error: "GET only (read-only API)" }); return; }
    const q = (k: string) => u.searchParams.get(k) || undefined;
    switch (path) {
      case "/": this.json(res, 200, { name: "Vault Kosmos Agent API", version: "0.5.1", readOnly: true,
        mcp: { endpoint: "/mcp", transport: "streamable-http (stateless JSON responses)" },
        rest: ["/health", "/overview", "/graph", "/notes?q=&tag=&area=&limit=", "/note?path=|title=", "/lineage?path=|title=", "/related?path=|title=", "/at?time=ISO", "/episodes"] }); return;
      case "/health": this.json(res, 200, { ok: true, name: "vault-kosmos", version: "0.5.1", vault: this.app.vault.getName() }); return;
      case "/overview": this.json(res, 200, await this.qOverview()); return;
      case "/graph": { const idx = await this.getIndex(); const nodes: any[] = []; const links: any[] = [];
        for (const n of idx.notes.values()) { nodes.push(this.brief(n));
          for (const t of n.out) links.push({ source: n.path, target: t, kind: "wikilink" });
          for (const t of n.semantic) links.push({ source: n.path, target: t, kind: "semantic" });
          for (const t of n.supersededByPaths) links.push({ source: n.path, target: t, kind: "lineage" }); }
        this.json(res, 200, { builtAt: idx.builtAt, nodes, links }); return; }
      case "/notes": { const r = await this.qSearch(q("q") || "", { tag: q("tag"), area: q("area"), limit: q("limit") ? Number(q("limit")) : undefined }); this.emitTraversal("search_notes", r); this.json(res, 200, r); return; }
      case "/note": { const r = await this.qNote({ path: q("path"), title: q("title") }); this.emitTraversal("get_note", r); this.json(res, 200, r); return; }
      case "/lineage": { const r = await this.qLineage({ path: q("path"), title: q("title") }); this.emitTraversal("get_lineage", r); this.json(res, 200, r); return; }
      case "/related": { const r = await this.qRelated({ path: q("path"), title: q("title") }); this.emitTraversal("get_related", r); this.json(res, 200, r); return; }
      case "/at": { const r = await this.qAtTime(q("time") || "", q("limit") ? Number(q("limit")) : 50); this.emitTraversal("graph_at_time", r); this.json(res, 200, r); return; }
      case "/episodes": this.json(res, 200, await buildEpisodes(this.app)); return;
      default: this.json(res, 404, { error: "not found", see: "/" });
    }
  }
}

/* ---------------- setup guide (one source: shipped file + in-vault command) ---------------- */
export function buildAgentGuide(port: string | number, token: string, bindMode: string = "localhost", lanUrls: string[] = []): string {
  const URLB = `http://127.0.0.1:${port}`;
  const isLan = bindMode === "lan";
  const lanLine = isLan
    ? (lanUrls.length
        ? `**Network access: LAN/VLAN enabled.** Agents on other devices on your network can reach this vault at:\n\n${lanUrls.map(u => "- \`" + u + "\`").join("\n")}\n\n⚠️ **Anyone on that subnet/VLAN who has the token below can read every note in this vault.** Only enable this on a network you trust (e.g. your home or a private office VLAN), keep the auth token on, and turn it back to Localhost-only in Settings when you don't need remote agents.`
        : `**Network access: LAN/VLAN enabled**, but no network interface was detected on this machine right now.`)
    : `**Network access: Localhost only** (default, recommended). Only this computer can reach the API. To let agents on other devices on your subnet/VLAN connect, go to Settings → Vault Kosmos → **Network access** → *Local network (LAN/VLAN)* — the settings page will then show you the exact address to give them.`;
  return `# Vault Kosmos — Agent API guide (v0.5.1)

**Written by OdenKnight \u00b7 read-only \u00b7 localhost only**

This plugin can run a small local server so AI agents (Claude Code, Claude Desktop, Cursor, custom harnesses, C.A.R.S.O.N.-style CLI agents) can query your vault's **OKF+ temporal knowledge graph** directly \u2014 knowledge chains, point-in-time snapshots, semantic links, search, and a ready-to-ingest Graphiti export. It never modifies your notes (OKF+ \u00a73.3), defaults to your own computer only (127.0.0.1), and requires a token \u2014 both can be changed in Settings if you want other agents on your network to reach it.

## 1 \u00b7 Turn it on (about 30 seconds)

1. Obsidian \u2192 **Settings \u2192 Community plugins \u2192 Vault Kosmos** (gear icon).
2. Toggle **Enable local Agent API** on. The status line should read **running**.
3. Your address is \`${URLB}\` and your token is \`${token}\` \u2014 both have **Copy** buttons in settings.

${lanLine}

Desktop only: Obsidian on iPhone/Android can't run local servers, so this feature is unavailable there (the 3D view still works on mobile). If a LAN agent still can't connect, your OS firewall may be blocking inbound connections on this port \u2014 allow incoming connections for Obsidian (or this port) in your firewall settings.

## 2 \u00b7 Connect an agent

### Claude Code (terminal)
Paste one line (or use the **Copy** button in settings):

\`\`\`bash
claude mcp add --transport http vault-kosmos "${URLB}/mcp?token=${token}"
\`\`\`

Then ask Claude Code things like *"use vault-kosmos to show the lineage of Engine v2"*.

### Claude Desktop (and other stdio-only MCP apps)
Settings \u2192 Developer \u2192 **Edit Config**, then add (needs Node.js installed once, from nodejs.org):

\`\`\`json
{
  "mcpServers": {
    "vault-kosmos": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${URLB}/mcp?token=${token}"]
    }
  }
}
\`\`\`

Restart Claude Desktop; **vault-kosmos** appears under tools.

### Cursor / Windsurf / any Streamable-HTTP MCP client
Add a remote/HTTP MCP server with URL \`${URLB}/mcp\` and header \`Authorization: Bearer ${token}\` (or just append \`?token=${token}\` to the URL).

### No MCP? Plain HTTP works too
\`\`\`bash
curl "${URLB}/health?token=${token}"
curl "${URLB}/lineage?title=Engine%20v2&token=${token}"
curl "${URLB}/at?time=2026-04-01&token=${token}"
\`\`\`

## 3 \u00b7 What agents can ask (MCP tools)

| Tool | What it gives an agent |
| --- | --- |
| \`vault_overview\` | Sizes, areas, HEAD/superseded counts, lineage + semantic edge counts, time span |
| \`search_notes\` | Lexical search (title/alias/tag/path) with OKF+ status on every hit |
| \`get_note\` | Full note content + OKF+ fields + outgoing links, backlinks, semantic links |
| \`get_lineage\` | The knowledge chain oldest \u2192 newest with **HEAD** marked (Graphiti-style evolution) |
| \`get_related\` | Semantic (**Related:** footer), wikilink and backlink neighbors |
| \`graph_at_time\` | Bi-temporal snapshot: what was valid vs already superseded at time T |
| \`export_graphiti_episodes\` | The whole vault as Graphiti \`EpisodeType.json\` episodes, chronological |

REST mirrors: \`/overview /graph /notes /note /lineage /related /at /episodes\` (see \`${URLB}/\`).

## 4 \u00b7 Direct vs. indirect Graphiti

- **Direct (this server):** agents read the OKF+ temporal graph live \u2014 no database, no LLM, instant. Search is honest lexical matching, not embeddings.
- **Indirect (full Graphiti):** call \`export_graphiti_episodes\` (or the palette command) and ingest with \`graphiti-ingest-sample.py\` into [getzep/graphiti](https://github.com/getzep/graphiti) (Python + Neo4j/FalkorDB/Kuzu + an LLM key) for entity extraction and hybrid semantic retrieval. Both paths share the same OKF+ source of truth.
- **Compatibility:** episode format verified against **graphiti-core 0.29.x** (\`add_episode\` fields unchanged; install \`>=0.28.2\` for its security fixes). Each episode carries a per-vault \`group_id\`. Graphiti's own MCP server can ingest them too via \`add_memory\` (\`source="json"\`; \`reference_time\` supported there since v0.24).

## 5 \u00b7 Safety & troubleshooting

- Read-only by design; there are no write endpoints.\n- **Localhost mode** (default): nothing outside this computer can reach it, regardless of firewall rules.\n- **LAN mode** (opt-in): any device on the same subnet/VLAN can reach it if it has the token \u2014 treat the token like a password, and only enable this on networks you trust.
- Requests must carry a matching \`Host\`/\`Origin\` (DNS-rebinding protection) and token checks are constant-time — a malicious web page cannot quietly reach the API from your browser.
- Keep the token secret; **Regenerate** in settings invalidates old ones instantly.
- **401 unauthorized** \u2192 token missing/stale; re-copy from settings. **Port busy** \u2192 change the port in settings (it restarts automatically). **Tools not appearing** \u2192 restart the agent app after editing its config.
`;
}

/* ---------------- settings tab ---------------- */
export class KosmosSettingTab extends PluginSettingTab {
  plugin: any;
  constructor(app: App, plugin: any) { super(app, plugin); this.plugin = plugin; }
  display(): void {
    const { containerEl } = this; containerEl.empty();
    const s: AgentSettings = this.plugin.agentSettings;
    containerEl.createEl("h2", { text: "Vault Kosmos \u2014 Agent API (HTTP + MCP)" });
    containerEl.createEl("p", { text: "Lets AI agents query this vault's OKF+ knowledge graph. Read-only, localhost-only, token-protected. Desktop only." });

    const status = containerEl.createEl("p");
    const refresh = () => { const running = this.plugin.agentApi?.status === "running";
      status.setText(`Status: ${this.plugin.agentApi?.status || "stopped"}${running ? ` \u00b7 ${this.plugin.agentApi.url}` : ""}`); };
    refresh();

    new Setting(containerEl).setName("Enable local Agent API").setDesc(Platform.isDesktopApp ? "Start the server now and on every launch." : "Unavailable on mobile Obsidian.")
      .addToggle(t => t.setValue(s.agentEnabled).setDisabled(!Platform.isDesktopApp).onChange(async v => {
        s.agentEnabled = v; await this.plugin.saveAgentSettings();
        if (v) this.plugin.agentApi.start(); else this.plugin.agentApi.stop();
        setTimeout(refresh, 150); }));

    new Setting(containerEl).setName("Port").setDesc("Default 4816. Change if busy; the server restarts automatically.")
      .addText(t => t.setValue(String(s.agentPort)).onChange(async v => {
        const p = Math.floor(Number(v)); if (!p || p < 1024 || p > 65535) return;
        s.agentPort = p; await this.plugin.saveAgentSettings();
        if (s.agentEnabled) { this.plugin.agentApi.start(); setTimeout(refresh, 150); } }));

    const netWarn = containerEl.createEl("p");
    const refreshNet = () => {
      if (s.agentBindMode === "lan") {
        const ips = this.plugin.agentApi.lanUrls as string[];
        netWarn.setText(ips.length ? `⚠️ Reachable on your local network at: ${ips.join(", ")} — anyone on this subnet/VLAN who has the token can read this vault.`
          : "⚠️ LAN mode is on, but no network interface was detected — check your connection.");
        netWarn.style.color = "var(--text-warning, #e0a30f)";
      } else { netWarn.setText("Reachable only from this computer (127.0.0.1)."); netWarn.style.color = "var(--text-muted)"; }
    };
    new Setting(containerEl).setName("Network access")
      .setDesc("Localhost only = this computer can reach it. Local network (LAN/VLAN) = other devices on the same network can reach it too — keep the auth token on if you enable this.")
      .addDropdown(d => d.addOption("localhost", "Localhost only (this computer)").addOption("lan", "Local network (LAN/VLAN)")
        .setValue(s.agentBindMode).onChange(async (v: any) => {
          s.agentBindMode = v; await this.plugin.saveAgentSettings();
          if (s.agentEnabled) { this.plugin.agentApi.start(); setTimeout(() => { refresh(); refreshNet(); }, 150); } else refreshNet(); }));
    refreshNet();

    new Setting(containerEl).setName("Require auth token").setDesc("Recommended. Agents must present the token below.")
      .addToggle(t => t.setValue(s.agentRequireToken).onChange(async v => { s.agentRequireToken = v; await this.plugin.saveAgentSettings(); }));

    new Setting(containerEl).setName("Auth token").setDesc(s.agentToken || "(none)")
      .addButton(b => b.setButtonText("Copy").onClick(() => { navigator.clipboard.writeText(s.agentToken); new Notice("Token copied"); }))
      .addButton(b => b.setButtonText("Regenerate").setWarning().onClick(async () => {
        s.agentToken = makeToken(); await this.plugin.saveAgentSettings(); new Notice("New token generated"); this.display(); }));

    containerEl.createEl("h3", { text: "One-click agent setup" });
    const url = () => { if (s.agentBindMode === "lan") { const ips = this.plugin.agentApi.lanUrls as string[]; if (ips.length) return `http://${ips[0].replace(/^https?:\/\//,"").split(":")[0]}:${s.agentPort}`; }
      return `http://127.0.0.1:${s.agentPort}`; };
    if (s.agentBindMode === "lan") containerEl.createEl("p", { text: "Copy buttons below use your LAN address so remote agents can reach this vault.", cls: "setting-item-description" });
    new Setting(containerEl).setName("Claude Code").setDesc("Copies a one-line terminal command.")
      .addButton(b => b.setButtonText("Copy command").onClick(() => {
        navigator.clipboard.writeText(`claude mcp add --transport http vault-kosmos "${url()}/mcp?token=${s.agentToken}"`);
        new Notice("Claude Code command copied \u2014 paste it in a terminal"); }));
    new Setting(containerEl).setName("Claude Desktop / stdio MCP apps").setDesc("Copies JSON for claude_desktop_config.json (uses npx mcp-remote; needs Node.js).")
      .addButton(b => b.setButtonText("Copy config").onClick(() => {
        navigator.clipboard.writeText(JSON.stringify({ mcpServers: { "vault-kosmos": { command: "npx", args: ["-y", "mcp-remote", `${url()}/mcp?token=${s.agentToken}`] } } }, null, 2));
        new Notice("Claude Desktop config copied"); }));
    new Setting(containerEl).setName("Quick test").setDesc("Copies a cURL health check.")
      .addButton(b => b.setButtonText("Copy cURL").onClick(() => {
        navigator.clipboard.writeText(`curl "${url()}/health?token=${s.agentToken}"`); new Notice("cURL test copied"); }));
    new Setting(containerEl).setName("Step-by-step guide").setDesc("Writes AGENT-API.md into your vault with YOUR address and token filled in.")
      .addButton(b => b.setButtonText("Write guide to vault").setCta().onClick(async () => {
        await this.plugin.writeAgentGuide(); }));
  }
}
