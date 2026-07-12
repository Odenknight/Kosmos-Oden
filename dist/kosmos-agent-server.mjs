// src/core/temporal.ts
function projectAtTime(notes, atMs) {
  const notYetCreated = [];
  const valid = [];
  const superseded = [];
  for (const n of notes) {
    if (n.validAtMs > atMs) {
      notYetCreated.push(n.id);
    } else if (n.invalidAtMs != null && n.invalidAtMs <= atMs) {
      superseded.push(n.id);
    } else {
      valid.push(n.id);
    }
  }
  return { at: new Date(atMs).toISOString(), notYetCreated, valid, superseded };
}

// src/core/graphiti.ts
var slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "vault";
function buildGraphitiEpisodes(graph, opts = {}) {
  const vault = opts.vault || "vault";
  const groupId = opts.groupId || slug(vault);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const label = (id) => byId.get(id)?.label ?? id;
  const out = [];
  for (const n of graph.nodes) {
    if (n.kind !== "file") continue;
    const okf = n.okf;
    const title = okf?.title || n.label;
    const ts = n.validAt ?? n.createdAt ?? (/* @__PURE__ */ new Date()).toISOString();
    const semantic = graph.links.filter((l) => l.kind === "semantic" && l.source === n.id).map((l) => label(l.target));
    out.push({
      name: title,
      episode_body: JSON.stringify({
        title,
        path: n.path,
        type: okf?.type || n.type || "note",
        tags: n.tags,
        timestamp: ts,
        // Canonical lineage projections (§13.1) — resolved note titles.
        supersedes: (okf?.supersedesIds ?? []).map(label),
        superseded_by: (okf?.supersededByIds ?? []).map(label),
        related: okf?.related ?? semantic,
        head: okf?.head ?? false,
        invalid_at: okf?.invalidAt ?? null,
        // Raw authored declarations, preserved verbatim.
        source_okf: {
          declared_supersedes: okf?.supersedes ?? [],
          declared_superseded_by: okf?.supersededBy ?? []
        },
        content: n.kind === "file" ? n.content ?? void 0 : void 0
      }),
      source: "json",
      source_description: `OKF+ note \xB7 vault "${vault}" \xB7 ${n.path}`,
      reference_time: ts,
      group_id: groupId
    });
  }
  out.sort((a, b) => a.reference_time.localeCompare(b.reference_time));
  return out;
}
function buildGraphitiEpisodesWithContent(graph, contents, opts = {}) {
  const episodes = buildGraphitiEpisodes(graph, opts);
  for (const e of episodes) {
    try {
      const body = JSON.parse(e.episode_body);
      const c = contents.get(body.path);
      if (c != null) {
        body.content = c;
        e.episode_body = JSON.stringify(body);
      }
    } catch {
    }
  }
  return episodes;
}

// src/core/version.ts
var KOSMOS_VERSION = "0.5.5";

// src/plugin/agent-server.ts
var SUPPORTED_MCP_PROTOCOL_VERSIONS = ["2025-03-26", "2024-11-05"];
var LATEST_MCP_PROTOCOL_VERSION = SUPPORTED_MCP_PROTOCOL_VERSIONS[0];
var MAX_BODY_BYTES = 4 * 1024 * 1024;
var AGENT_SETTINGS_SCHEMA = 2;
var DEFAULT_AGENT_SETTINGS = {
  schemaVersion: AGENT_SETTINGS_SCHEMA,
  agentEnabled: false,
  agentPort: 4816,
  agentToken: "",
  agentRequireToken: true,
  agentBindMode: "localhost",
  agentAllowQueryToken: false
};
function migrateAgentSettings(raw) {
  const s = Object.assign({}, DEFAULT_AGENT_SETTINGS, raw || {});
  if (!raw || raw.schemaVersion == null) s.agentAllowQueryToken = false;
  s.schemaVersion = AGENT_SETTINGS_SCHEMA;
  return s;
}
var MAX_NOTE_CONTENT_CHARS = 2e5;
var MAX_SEARCH_RESULTS = 200;
var MAX_EPISODES = 5e4;
var RATE_WINDOW_MS = 1e4;
var RATE_MAX_REQUESTS = 240;
var MAX_CONCURRENT_REQUESTS = 24;
var REQUEST_TIMEOUT_MS = 3e4;
function makeToken() {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error(
      "Vault Kosmos: no cryptographically secure random source (crypto.getRandomValues) is available; refusing to create an insecure token."
    );
  }
  const bytes = new Uint8Array(32);
  c.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
var LOCAL_HOSTNAMES = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);
var KosmosAgentServer = class {
  constructor(http, settings, provider) {
    this.server = null;
    this.status = "stopped";
    this.inFlight = 0;
    this.hits = /* @__PURE__ */ new Map();
    this.http = http;
    this.settings = settings;
    this.provider = provider;
  }
  reportTraversal(tool, paths) {
    if (this.onTraversal && paths.length) this.onTraversal(paths, tool);
  }
  get bindHost() {
    return this.settings.agentBindMode === "lan" ? "0.0.0.0" : "127.0.0.1";
  }
  get url() {
    return `http://127.0.0.1:${this.settings.agentPort}`;
  }
  /** LAN mode must never run without authentication (Doc1 §3.8, Doc2 §5.3). */
  lanNeedsAuthButHasNone() {
    if (this.settings.agentBindMode !== "lan") return false;
    return !this.settings.agentRequireToken || !this.settings.agentToken;
  }
  start(onError) {
    if (this.server) this.stop();
    if (!this.http) {
      this.status = "unavailable (no http module)";
      return;
    }
    if (this.lanNeedsAuthButHasNone()) {
      this.status = "error: LAN mode requires an auth token \u2014 enable 'Require auth token' and generate one before binding to the network";
      onError?.(this.status);
      return;
    }
    this.inFlight = 0;
    this.hits.clear();
    const srv = this.http.createServer((req, res) => {
      this.handle(req, res).catch((e) => {
        try {
          res.writeHead(500, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          res.end(JSON.stringify({ error: String(e?.message || e) }));
        } catch (_) {
        }
      });
    });
    if (typeof srv.setTimeout === "function") srv.setTimeout(REQUEST_TIMEOUT_MS);
    srv.on("error", (e) => {
      this.status = "error: " + (e?.code === "EADDRINUSE" ? `port ${this.settings.agentPort} is busy \u2014 pick another port in settings` : e?.message || e);
      onError?.(this.status);
      this.server = null;
    });
    srv.listen(this.settings.agentPort, this.bindHost, () => {
      this.status = "running";
    });
    this.server = srv;
  }
  stop() {
    try {
      this.server && this.server.close();
    } catch (_) {
    }
    this.server = null;
    this.status = "stopped";
    this.inFlight = 0;
    this.hits.clear();
  }
  /** Constant-time string comparison — no early return on first mismatch (Doc1 §3.6). */
  timingSafeEqual(a, b) {
    const abuf = Buffer.from(String(a), "utf8");
    const bbuf = Buffer.from(String(b), "utf8");
    const pad = Math.max(abuf.length, bbuf.length, 1);
    let diff = abuf.length ^ bbuf.length;
    for (let i = 0; i < pad; i++) diff |= (abuf[i] ?? 0) ^ (bbuf[i] ?? 0);
    return diff === 0;
  }
  /** Sliding-window rate limit + concurrency cap, applied to non-loopback clients. */
  rateLimited(req) {
    const remote = String(req.socket?.remoteAddress || "");
    const isLoopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1" || remote === "";
    if (isLoopback) return { limited: false };
    if (this.inFlight >= MAX_CONCURRENT_REQUESTS) return { limited: true, reason: "too many concurrent requests" };
    const now = performance.now();
    const arr = (this.hits.get(remote) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (arr.length >= RATE_MAX_REQUESTS) {
      this.hits.set(remote, arr);
      return { limited: true, reason: "rate limit exceeded" };
    }
    arr.push(now);
    this.hits.set(remote, arr);
    return { limited: false };
  }
  /* ---------------- security gates ---------------- */
  allowedHostnames() {
    const allowed = new Set(LOCAL_HOSTNAMES);
    if (this.settings.agentBindMode === "lan") {
      for (const ip of this.provider.lanAddresses()) allowed.add(ip.toLowerCase());
    }
    return allowed;
  }
  /** Host-header validation (DNS-rebinding defence, §17). */
  hostAllowed(hostHeader) {
    if (!hostHeader) return false;
    let hostname = String(hostHeader).trim().toLowerCase();
    const v6 = /^\[([^\]]+)\](?::\d+)?$/.exec(hostname);
    if (v6) hostname = v6[1];
    else if (hostname.includes(":")) hostname = hostname.split(":")[0];
    return this.allowedHostnames().has(hostname);
  }
  /** Origin validation: absent = non-browser client (allowed); otherwise must be local (§17). */
  originAllowed(originHeader) {
    if (originHeader == null || originHeader === "") return true;
    const o = String(originHeader).trim().toLowerCase();
    if (o === "null") return false;
    try {
      const u = new URL(o);
      return this.allowedHostnames().has(u.hostname);
    } catch {
      return false;
    }
  }
  authorized(req, urlObj) {
    const s = this.settings;
    if (!s.agentRequireToken) return true;
    if (!s.agentToken) return false;
    const token = s.agentToken;
    const h = String(req.headers["authorization"] || "");
    if (h.toLowerCase().startsWith("bearer ") && this.timingSafeEqual(h.slice(7).trim(), token)) return true;
    if (this.timingSafeEqual(String(req.headers["x-api-key"] || ""), token)) return true;
    if (s.agentAllowQueryToken && s.agentBindMode !== "lan") {
      const q = urlObj.searchParams.get("token");
      if (q != null && this.timingSafeEqual(q, token)) return true;
    }
    return false;
  }
  /** Read the body with a BYTE limit (§17): received_bytes > limit -> reject.
   *  On rejection the request stream is paused (not destroyed) so the 413
   *  response can still reach the client; the connection closes after it. */
  readBody(req, limit = MAX_BODY_BYTES) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let receivedBytes = 0;
      let done = false;
      const onData = (c) => {
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
      req.on("end", () => {
        if (!done) resolve(Buffer.concat(chunks).toString("utf8"));
      });
      req.on("error", (e) => {
        if (!done) reject(e);
      });
    });
  }
  json(res, code, obj) {
    const body = JSON.stringify(obj, null, 2);
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(body);
  }
  /* ---------------- shared query helpers (one graph, §33) ---------------- */
  fileNodes(graph) {
    return graph.nodes.filter((n) => n.kind === "file");
  }
  brief(n) {
    return {
      title: n.label,
      path: n.path,
      type: n.okf?.type || n.type || "note",
      area: n.area,
      tags: n.tags,
      timestamp: n.validAt ?? null,
      head: !!(n.okf && n.okf.head),
      superseded: !!(n.okf && n.okf.invalidAt),
      invalidAt: n.okf?.invalidAt ?? null
    };
  }
  findNode(graph, sel) {
    const files = this.fileNodes(graph);
    if (sel.path) {
      const p = sel.path.trim();
      const hit = files.find((n) => n.path === p) ?? files.find((n) => n.path.toLowerCase() === p.toLowerCase()) ?? files.find((n) => n.path.toLowerCase() === (p + ".md").toLowerCase());
      if (hit) return hit;
    }
    const q = (sel.title ?? sel.path ?? "").trim().toLowerCase();
    if (!q) return null;
    return files.find((n) => n.label.toLowerCase() === q) ?? files.find((n) => n.aliases.some((a) => a.toLowerCase() === q)) ?? files.find((n) => (n.okf?.title || "").toLowerCase() === q) ?? null;
  }
  projectables(graph) {
    const out = [];
    for (const n of this.fileNodes(graph)) {
      const v = n.validAt ? Date.parse(n.validAt) : NaN;
      if (Number.isNaN(v)) continue;
      const inv = n.okf?.invalidAt ? Date.parse(n.okf.invalidAt) : null;
      out.push({ id: n.id, validAtMs: v, invalidAtMs: inv != null && !Number.isNaN(inv) ? inv : null });
    }
    return out;
  }
  /* ---------------- queries (shared by REST + MCP tools) ---------------- */
  async qOverview() {
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
      timeSpan: graph.__timeSpan ?? null,
      diagnostics: graph.diagnostics,
      indexBuiltAt: graph.stats.indexedAt
    };
  }
  async qDiagnostics() {
    const graph = await this.provider.getGraph();
    return graph.diagnostics;
  }
  async qSearch(query, opts = {}) {
    const graph = await this.provider.getGraph();
    const q = String(query || "").toLowerCase();
    const lim = Math.max(1, Math.min(MAX_SEARCH_RESULTS, opts.limit || 20));
    const scored = [];
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
    scored.sort((a, b) => b[0] - a[0] || (Date.parse(b[1].validAt || "") || 0) - (Date.parse(a[1].validAt || "") || 0));
    const top = scored.slice(0, lim).map(([, n]) => n);
    this.reportTraversal("search_notes", top.map((n) => n.path));
    return {
      query,
      method: "lexical (title/alias/tag/path substring; no embeddings)",
      total: scored.length,
      results: top.map((n) => this.brief(n))
    };
  }
  async qNote(sel) {
    const graph = await this.provider.getGraph();
    const n = this.findNode(graph, sel);
    if (!n) return { error: "note not found", hint: "pass path (e.g. Ideas/Engine v2.md) or title" };
    const nameOf = (id) => graph.nodes.find((x) => x.id === id)?.label ?? id;
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
        related: n.okf.related
      } : null,
      links: { outgoing, backlinks, semantic },
      content: this.capContent(content ?? "")
    };
  }
  /** Cap a returned note body so one huge note cannot flood a client (Doc2 §5.6). */
  capContent(s) {
    if (s.length <= MAX_NOTE_CONTENT_CHARS) return s;
    return s.slice(0, MAX_NOTE_CONTENT_CHARS) + `

\u2026[truncated: note exceeds ${MAX_NOTE_CONTENT_CHARS} characters]`;
  }
  /** Canonical lineage chain — identical to what the viewer displays (§33). */
  async qLineage(sel) {
    const graph = await this.provider.getGraph();
    const n = this.findNode(graph, sel);
    if (!n) return { error: "note not found" };
    const byId = new Map(graph.nodes.map((x) => [x.id, x]));
    const seen = /* @__PURE__ */ new Set();
    const chain = [];
    const walk = (id) => {
      if (seen.has(id)) return;
      seen.add(id);
      const x = byId.get(id);
      if (!x) return;
      for (const a of x.okf?.supersedesIds ?? []) walk(a);
      chain.push(x);
      for (const d of x.okf?.supersededByIds ?? []) walk(d);
    };
    walk(n.id);
    chain.sort((a, b) => (Date.parse(a.validAt || "") || 0) - (Date.parse(b.validAt || "") || 0));
    this.reportTraversal("get_lineage", chain.map((x) => x.path));
    return {
      for: n.path,
      chainLength: chain.length,
      chain: chain.map((x) => ({ ...this.brief(x), current: x.id === n.id }))
    };
  }
  async qRelated(sel) {
    const graph = await this.provider.getGraph();
    const n = this.findNode(graph, sel);
    if (!n) return { error: "note not found" };
    const byId = new Map(graph.nodes.map((x) => [x.id, x]));
    const b = (id) => {
      const x = byId.get(id);
      return x ? this.brief(x) : { path: id };
    };
    const semanticIds = graph.links.filter((l) => l.source === n.id && l.kind === "semantic").map((l) => l.target);
    const outgoingIds = graph.links.filter((l) => l.source === n.id && l.kind !== "contains" && l.kind !== "lineage").map((l) => l.target);
    const backlinkIds = graph.links.filter((l) => l.target === n.id && l.kind !== "contains" && l.kind !== "lineage").map((l) => l.source);
    const touched = [n.id, ...semanticIds, ...outgoingIds, ...backlinkIds].map((id) => byId.get(id)?.path).filter(Boolean);
    this.reportTraversal("get_related", touched);
    return { for: n.path, semantic: semanticIds.map(b), outgoing: outgoingIds.map(b), backlinks: backlinkIds.map(b) };
  }
  /** Point-in-time snapshot — the ONE shared projector (§4.1, §33). */
  async qAtTime(time, limit = 50) {
    const graph = await this.provider.getGraph();
    const T = Date.parse(time);
    if (Number.isNaN(T)) return { error: "invalid time; use ISO 8601, e.g. 2026-04-01 or 2026-04-01T00:00:00Z" };
    const projection = projectAtTime(this.projectables(graph), T);
    const byId = new Map(graph.nodes.map((x) => [x.id, x]));
    const briefs = (ids) => ids.map((id) => byId.get(id)).filter(Boolean).sort((a, b) => String(b.validAt).localeCompare(String(a.validAt))).map((n) => this.brief(n));
    const valid = briefs(projection.valid);
    const superseded = briefs(projection.superseded);
    return {
      at: projection.at,
      semantics: "temporal validity intervals: valid = written by T and not yet superseded; superseded = a newer version already existed at T; notes with valid_at > T did not exist yet",
      counts: { valid: valid.length, superseded: superseded.length, notYetCreated: projection.notYetCreated.length },
      valid: valid.slice(0, limit),
      superseded: superseded.slice(0, limit)
    };
  }
  async qEpisodes(limit) {
    const graph = await this.provider.getGraph();
    const contents = /* @__PURE__ */ new Map();
    for (const n of this.fileNodes(graph)) {
      const c = await this.provider.getNoteContent(n.path);
      if (c != null) contents.set(n.path, c);
    }
    const episodes = buildGraphitiEpisodesWithContent(graph, contents, { vault: this.provider.vaultName() });
    const cap = Math.min(limit ?? MAX_EPISODES, MAX_EPISODES);
    return episodes.slice(0, cap);
  }
  async qGraph() {
    const graph = await this.provider.getGraph();
    const nodes = this.fileNodes(graph).map((n) => this.brief(n));
    const links = [];
    for (const l of graph.links) {
      if (l.kind === "contains") continue;
      links.push({ source: l.source, target: l.target, kind: l.kind === "lineage" ? "lineage" : l.kind === "semantic" ? "semantic" : "wikilink" });
    }
    return { builtAt: graph.stats.indexedAt, nodes, links };
  }
  /* ---------------- MCP (Streamable HTTP, stateless, tools only) ---------------- */
  toolDefs() {
    const sel = {
      path: { type: "string", description: "Vault-relative path, e.g. Ideas/Engine v2.md" },
      title: { type: "string", description: "Note title / basename / alias" }
    };
    return [
      { name: "vault_overview", description: "Vault + OKF+ knowledge-graph stats: note counts, heads, superseded ghosts, lineage/semantic edge counts, diagnostics.", inputSchema: { type: "object", properties: {} } },
      { name: "search_notes", description: "Lexical search over titles, aliases, tags and paths (no embeddings). Optional tag/area filters. Results carry OKF+ status (head/superseded).", inputSchema: { type: "object", properties: { query: { type: "string" }, tag: { type: "string" }, area: { type: "string" }, limit: { type: "number" } }, required: ["query"] } },
      { name: "get_note", description: "Full note: content (frontmatter stripped), canonical OKF+ lineage fields, outgoing links, backlinks, semantic Related links.", inputSchema: { type: "object", properties: sel } },
      { name: "get_lineage", description: "The canonical OKF+ knowledge chain (supersedes/superseded_by, normalized bidirectionally) for a note, ordered oldest\u2192newest with HEAD marked.", inputSchema: { type: "object", properties: sel } },
      { name: "get_related", description: "Neighbors of a note: semantic (OKF+ **Related:** footer), outgoing wikilinks, and backlinks.", inputSchema: { type: "object", properties: sel } },
      { name: "graph_at_time", description: "Point-in-time snapshot using temporal validity intervals: which notes were valid vs already superseded at the given ISO time.", inputSchema: { type: "object", properties: { time: { type: "string", description: "ISO 8601" }, limit: { type: "number" } }, required: ["time"] } },
      { name: "export_graphiti_episodes", description: "The whole vault as Graphiti-ingestable episodes (EpisodeType.json, chronological, canonical lineage in the body) \u2014 same payload as the plugin's export command.", inputSchema: { type: "object", properties: { limit: { type: "number" } } } }
    ];
  }
  async callTool(name, args) {
    args = args || {};
    switch (name) {
      case "vault_overview":
        return this.qOverview();
      case "search_notes":
        return this.qSearch(args.query, args);
      case "get_note":
        return this.qNote(args);
      case "get_lineage":
        return this.qLineage(args);
      case "get_related":
        return this.qRelated(args);
      case "graph_at_time":
        return this.qAtTime(args.time, args.limit);
      case "export_graphiti_episodes":
        return this.qEpisodes(args.limit);
      default:
        throw new Error("unknown tool: " + name);
    }
  }
  /** Negotiate the MCP protocol version (§15). */
  negotiateProtocolVersion(requested) {
    if (typeof requested === "string" && SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(requested)) return requested;
    return LATEST_MCP_PROTOCOL_VERSION;
  }
  async mcpDispatch(msg) {
    if (!msg || typeof msg !== "object") return { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } };
    const { id, method, params } = msg;
    if (id === void 0 || id === null) return null;
    const ok = (result) => ({ jsonrpc: "2.0", id, result });
    try {
      if (method === "initialize") {
        return ok({
          protocolVersion: this.negotiateProtocolVersion(params?.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "vault-kosmos", version: KOSMOS_VERSION },
          instructions: "Read-only Obsidian vault knowledge graph (Vault Kosmos / Kosmos-Oden, OKF+). Temporal lineage via get_lineage/graph_at_time; content via get_note; Graphiti ingest payload via export_graphiti_episodes. This server never modifies the vault."
        });
      }
      if (method === "ping") return ok({});
      if (method === "tools/list") return ok({ tools: this.toolDefs() });
      if (method === "tools/call") {
        try {
          const r = await this.callTool(params?.name, params?.arguments);
          return ok({ content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: false });
        } catch (e) {
          return ok({ content: [{ type: "text", text: "Error: " + (e?.message || String(e)) }], isError: true });
        }
      }
      if (method === "resources/list") return ok({ resources: [] });
      if (method === "prompts/list") return ok({ prompts: [] });
      return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + method } };
    } catch (e) {
      return { jsonrpc: "2.0", id, error: { code: -32603, message: e?.message || "Internal error" } };
    }
  }
  /* ---------------- HTTP dispatch ---------------- */
  /** Public entry: enforce rate/concurrency limits, then dispatch. */
  async handle(req, res) {
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
  async dispatch(req, res) {
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
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Cache-Control": "no-store" });
      res.end();
      return;
    }
    if (!this.authorized(req, u)) {
      this.json(res, 401, { error: "unauthorized", hint: "send Authorization: Bearer <token> or x-api-key: <token>" });
      return;
    }
    if (path === "/mcp") {
      if (req.method === "GET") {
        res.writeHead(405, { Allow: "POST, DELETE", "Cache-Control": "no-store" });
        res.end();
        return;
      }
      if (req.method === "DELETE") {
        res.writeHead(200, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      let body;
      try {
        body = await this.readBody(req);
      } catch (e) {
        const code = e?.statusCode === 413 ? 413 : 400;
        res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", Connection: "close" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: e?.message || "bad request" } }), () => {
          try {
            req.destroy();
          } catch (_) {
          }
        });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(body || "null");
      } catch (_) {
        this.json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        return;
      }
      if (Array.isArray(parsed)) {
        const outs = [];
        for (const m of parsed) {
          const r = await this.mcpDispatch(m);
          if (r) outs.push(r);
        }
        if (!outs.length) {
          res.writeHead(202);
          res.end();
        } else this.json(res, 200, outs);
        return;
      }
      const out = await this.mcpDispatch(parsed);
      if (!out) {
        res.writeHead(202);
        res.end();
      } else this.json(res, 200, out);
      return;
    }
    if (req.method !== "GET") {
      this.json(res, 405, { error: "GET only (read-only API)" });
      return;
    }
    const q = (k) => u.searchParams.get(k) || void 0;
    switch (path) {
      case "/":
        this.json(res, 200, {
          name: "Vault Kosmos Agent API",
          version: KOSMOS_VERSION,
          readOnly: true,
          auth: "Authorization: Bearer <token> or x-api-key: <token>",
          mcp: { endpoint: "/mcp", transport: "streamable-http (stateless JSON responses)", supportedProtocolVersions: SUPPORTED_MCP_PROTOCOL_VERSIONS },
          rest: ["/health", "/overview", "/diagnostics", "/graph", "/notes?q=&tag=&area=&limit=", "/note?path=|title=", "/lineage?path=|title=", "/related?path=|title=", "/at?time=ISO", "/episodes"]
        });
        return;
      case "/health":
        this.json(res, 200, { ok: true, name: "vault-kosmos", version: KOSMOS_VERSION, vault: this.provider.vaultName() });
        return;
      case "/overview":
        this.json(res, 200, await this.qOverview());
        return;
      case "/diagnostics":
        this.json(res, 200, await this.qDiagnostics());
        return;
      case "/graph":
        this.json(res, 200, await this.qGraph());
        return;
      case "/notes":
        this.json(res, 200, await this.qSearch(q("q") || "", { tag: q("tag"), area: q("area"), limit: q("limit") ? Number(q("limit")) : void 0 }));
        return;
      case "/note":
        this.json(res, 200, await this.qNote({ path: q("path"), title: q("title") }));
        return;
      case "/lineage":
        this.json(res, 200, await this.qLineage({ path: q("path"), title: q("title") }));
        return;
      case "/related":
        this.json(res, 200, await this.qRelated({ path: q("path"), title: q("title") }));
        return;
      case "/at":
        this.json(res, 200, await this.qAtTime(q("time") || "", q("limit") ? Number(q("limit")) : 50));
        return;
      case "/episodes":
        this.json(res, 200, await this.qEpisodes());
        return;
      default:
        this.json(res, 404, { error: "not found", see: "/" });
    }
  }
};
export {
  AGENT_SETTINGS_SCHEMA,
  DEFAULT_AGENT_SETTINGS,
  KosmosAgentServer,
  LATEST_MCP_PROTOCOL_VERSION,
  MAX_BODY_BYTES,
  MAX_CONCURRENT_REQUESTS,
  MAX_EPISODES,
  MAX_NOTE_CONTENT_CHARS,
  MAX_SEARCH_RESULTS,
  RATE_MAX_REQUESTS,
  RATE_WINDOW_MS,
  REQUEST_TIMEOUT_MS,
  SUPPORTED_MCP_PROTOCOL_VERSIONS,
  makeToken,
  migrateAgentSettings
};
