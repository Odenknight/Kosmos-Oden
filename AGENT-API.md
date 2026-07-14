# Vault Kosmos — Agent API guide (v0.5.5)

**Read-only · localhost by default · token-protected**

> This is the generic copy of the guide. Inside Obsidian, run the command
> *“Write Agent API guide (AGENT-API.md) to vault”* to get this file with your
> actual address and token pre-filled.

The plugin can run a small local server so AI agents (Claude Code, Claude Desktop, Cursor, custom harnesses) can query your vault's **OKF+ temporal knowledge graph** directly — canonical knowledge chains, point-in-time snapshots, semantic links, search, and a ready-to-ingest Graphiti export. Visualization and Agent API queries never modify existing notes; the only writes are the explicitly named export files you trigger yourself.

While an agent works, watch it: every `search_notes` / `get_note` / `get_lineage` / `get_related` query lights up the notes it touched with a fading emerald trail in the open Kosmos view, live.

## 1 · Turn it on (about 30 seconds)

1. Obsidian → **Settings → Community plugins → Vault Kosmos** (gear icon).
2. Toggle **Enable local Agent API** on. The status line should read **running**.
3. Your address is `http://127.0.0.1:<port>` (default port 4816) and your token is shown in settings — both have **Copy** buttons.

**Network access: Localhost only** is the default — only this computer can reach the API. To let agents on other devices on your subnet/VLAN connect, switch **Network access** to *Local network (LAN/VLAN)*; the settings page then shows the exact address to give them. Anyone on that network **with the token** can read every note in the vault, so only enable it on networks you trust.

Desktop only: Obsidian on iPhone/Android can't run local servers (the 3D view still works on mobile).

## 2 · Connect an agent

### Claude Code (terminal) — native HTTP, no bridge

One command:
```bash
claude mcp add --transport http vault-kosmos "http://127.0.0.1:4816/mcp" --header "Authorization: Bearer <TOKEN>"
```

…or drop a project-scoped **`.mcp.json`** next to where you run `claude` (copy the
committed `.mcp.json.example`, fill in your token). This is the reliable path —
Claude Code speaks Streamable HTTP directly, so **no `mcp-remote` npx bridge** is involved:
```json
{
  "mcpServers": {
    "vault-kosmos": {
      "type": "http",
      "url": "http://127.0.0.1:4816/mcp",
      "headers": { "Authorization": "Bearer <TOKEN>" }
    }
  }
}
```

### Claude Desktop (and other stdio-only MCP apps)
Claude Desktop can't speak HTTP directly, so it needs the `mcp-remote` bridge.
Settings → Developer → **Edit Config** (needs Node.js once, from nodejs.org):

```json
{
  "mcpServers": {
    "vault-kosmos": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:4816/mcp", "--header", "Authorization: Bearer <TOKEN>"]
    }
  }
}
```

> **Protocol:** the server negotiates MCP revisions `2025-06-18` (current),
> `2025-03-26`, and `2024-11-05`, so current and older clients both connect. It
> replies with stateless JSON (no SSE), and on `initialize` returns an
> `Mcp-Session-Id` used to colour that agent's live traversal trail.

### Cursor / Windsurf / any Streamable-HTTP MCP client
URL `http://127.0.0.1:4816/mcp` with header `Authorization: Bearer <TOKEN>`.

### No MCP? Plain HTTP works too
```bash
curl -H "Authorization: Bearer <TOKEN>" "http://127.0.0.1:4816/health"
curl -H "Authorization: Bearer <TOKEN>" "http://127.0.0.1:4816/lineage?title=Engine%20v2"
curl -H "Authorization: Bearer <TOKEN>" "http://127.0.0.1:4816/at?time=2026-04-01"
```

> `?token=` query authentication is **deprecated and off by default** (query strings leak through history, proxy logs and screenshots). Enable it in settings only if a client cannot send headers — it is always rejected in LAN mode.

## 3 · What agents can ask (MCP tools)

| Tool | What it gives an agent |
| --- | --- |
| `vault_overview` | Sizes, areas, HEAD/superseded counts, lineage + semantic edge counts, diagnostics |
| `search_notes` | Lexical search (title/alias/tag/path substring — no embeddings) with OKF+ status on every hit |
| `get_note` | Full note content (frontmatter stripped) + canonical OKF+ lineage + outgoing links, backlinks, semantic links |
| `get_lineage` | The knowledge chain oldest → newest with **HEAD** marked — canonical and bidirectionally normalized, identical to what the 3D view shows |
| `get_related` | Semantic (**Related:** footer), wikilink and backlink neighbors |
| `graph_at_time` | Temporal-validity snapshot: valid vs superseded vs not-yet-created at time T — the same projector as the Chrono view |
| `export_graphiti_episodes` | The whole vault as Graphiti `EpisodeType.json` episodes, chronological, canonical lineage in each body |

REST mirrors: `/overview /diagnostics /graph /notes /note /lineage /related /at /episodes` — hit `/` for the index. MCP protocol versions supported: `2025-03-26`, `2024-11-05` (unsupported client versions are answered with the server's latest, never echoed).

## 4 · Direct vs. indirect Graphiti

- **Direct (this server):** agents read the OKF+ temporal graph live — no database, no LLM, instant. Search is honest lexical matching, not embeddings.
- **Indirect (full Graphiti):** call `export_graphiti_episodes` (or the palette command) and ingest with `graphiti-ingest-sample.py` into [getzep/graphiti](https://github.com/getzep/graphiti) (Python + Neo4j/FalkorDB + an LLM key) for entity extraction and hybrid semantic retrieval. Both paths share the same OKF+ source of truth. The export is Graphiti-ingestable; Graphiti's own LLM pipeline decides how it reconstructs entities, so an identical internal graph is not guaranteed.

## 5 · Safety & troubleshooting

- Read-only by design; REST is GET-only and MCP exposes query tools only — there are no write endpoints.
- Request bodies are capped at **4 MiB, measured in bytes** (HTTP 413 beyond that). Note bodies, search results and episode exports are also capped.
- Non-loopback clients are **rate-limited** (per-IP sliding window) with a concurrency cap; loopback is exempt for throughput.
- The server validates `Host` and `Origin` headers against the bind mode, blocking DNS-rebinding and cross-site browser requests. All responses set `Cache-Control: no-store`.
- **LAN mode cannot start without a token** — the server fails closed rather than exposing the vault unauthenticated.
- Tokens are generated from a cryptographically secure source (32 random bytes, base64url); there is no insecure fallback, and comparison is constant-time. **Regenerate** in settings invalidates old tokens instantly.
- **401 unauthorized** → token missing/stale, or you used `?token=` while it's disabled; use a header. **403 forbidden host/origin** → the request came through a hostname the server doesn't serve; use `127.0.0.1`. **429 too many requests** → back off (LAN clients). **Port busy** → change the port in settings.
