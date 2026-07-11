# Vault Kosmos — Agent API guide (v0.5.1)

**Written by OdenKnight · read-only · localhost only**

This plugin can run a small local server so AI agents (Claude Code, Claude Desktop, Cursor, custom harnesses, C.A.R.S.O.N.-style CLI agents) can query your vault's **OKF+ temporal knowledge graph** directly — knowledge chains, point-in-time snapshots, semantic links, search, and a ready-to-ingest Graphiti export. It never modifies your notes (OKF+ §3.3), defaults to your own computer only (127.0.0.1), and requires a token — both can be changed in Settings if you want other agents on your network to reach it.

## 1 · Turn it on (about 30 seconds)

1. Obsidian → **Settings → Community plugins → Vault Kosmos** (gear icon).
2. Toggle **Enable local Agent API** on. The status line should read **running**.
3. Your address is `http://127.0.0.1:4816` and your token is `YOUR-TOKEN-HERE` — both have **Copy** buttons in settings.

**Network access: Localhost only** (default, recommended). Only this computer can reach the API. To let agents on other devices on your subnet/VLAN connect, go to Settings → Vault Kosmos → **Network access** → *Local network (LAN/VLAN)* — the settings page will then show you the exact address to give them.

Desktop only: Obsidian on iPhone/Android can't run local servers, so this feature is unavailable there (the 3D view still works on mobile). If a LAN agent still can't connect, your OS firewall may be blocking inbound connections on this port — allow incoming connections for Obsidian (or this port) in your firewall settings.

## 2 · Connect an agent

### Claude Code (terminal)
Paste one line (or use the **Copy** button in settings):

```bash
claude mcp add --transport http vault-kosmos "http://127.0.0.1:4816/mcp?token=YOUR-TOKEN-HERE"
```

Then ask Claude Code things like *"use vault-kosmos to show the lineage of Engine v2"*.

### Claude Desktop (and other stdio-only MCP apps)
Settings → Developer → **Edit Config**, then add (needs Node.js installed once, from nodejs.org):

```json
{
  "mcpServers": {
    "vault-kosmos": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:4816/mcp?token=YOUR-TOKEN-HERE"]
    }
  }
}
```

Restart Claude Desktop; **vault-kosmos** appears under tools.

### Cursor / Windsurf / any Streamable-HTTP MCP client
Add a remote/HTTP MCP server with URL `http://127.0.0.1:4816/mcp` and header `Authorization: Bearer YOUR-TOKEN-HERE` (or just append `?token=YOUR-TOKEN-HERE` to the URL).

### No MCP? Plain HTTP works too
```bash
curl "http://127.0.0.1:4816/health?token=YOUR-TOKEN-HERE"
curl "http://127.0.0.1:4816/lineage?title=Engine%20v2&token=YOUR-TOKEN-HERE"
curl "http://127.0.0.1:4816/at?time=2026-04-01&token=YOUR-TOKEN-HERE"
```

## 3 · What agents can ask (MCP tools)

| Tool | What it gives an agent |
| --- | --- |
| `vault_overview` | Sizes, areas, HEAD/superseded counts, lineage + semantic edge counts, time span |
| `search_notes` | Lexical search (title/alias/tag/path) with OKF+ status on every hit |
| `get_note` | Full note content + OKF+ fields + outgoing links, backlinks, semantic links |
| `get_lineage` | The knowledge chain oldest → newest with **HEAD** marked (Graphiti-style evolution) |
| `get_related` | Semantic (**Related:** footer), wikilink and backlink neighbors |
| `graph_at_time` | Bi-temporal snapshot: what was valid vs already superseded at time T |
| `export_graphiti_episodes` | The whole vault as Graphiti `EpisodeType.json` episodes, chronological |

REST mirrors: `/overview /graph /notes /note /lineage /related /at /episodes` (see `http://127.0.0.1:4816/`).

## 4 · Direct vs. indirect Graphiti

- **Direct (this server):** agents read the OKF+ temporal graph live — no database, no LLM, instant. Search is honest lexical matching, not embeddings.
- **Indirect (full Graphiti):** call `export_graphiti_episodes` (or the palette command) and ingest with `graphiti-ingest-sample.py` into [getzep/graphiti](https://github.com/getzep/graphiti) (Python + Neo4j/FalkorDB/Kuzu + an LLM key) for entity extraction and hybrid semantic retrieval. Both paths share the same OKF+ source of truth.
- **Compatibility:** episode format verified against **graphiti-core 0.29.x** (`add_episode` fields unchanged; install `>=0.28.2` for its security fixes). Each episode carries a per-vault `group_id`. Graphiti's own MCP server can ingest them too via `add_memory` (`source="json"`; `reference_time` supported there since v0.24).

## 5 · Safety & troubleshooting

- Read-only by design; there are no write endpoints.
- **Localhost mode** (default): nothing outside this computer can reach it, regardless of firewall rules.
- **LAN mode** (opt-in): any device on the same subnet/VLAN can reach it if it has the token — treat the token like a password, and only enable this on networks you trust.
- Requests must carry a matching `Host`/`Origin` (DNS-rebinding protection) and token checks are constant-time — a malicious web page cannot quietly reach the API from your browser.
- Keep the token secret; **Regenerate** in settings invalidates old ones instantly.
- **401 unauthorized** → token missing/stale; re-copy from settings. **Port busy** → change the port in settings (it restarts automatically). **Tools not appearing** → restart the agent app after editing its config.
