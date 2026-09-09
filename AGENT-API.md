# Kosmos-Oden — universal Agent API guide (v0.6.5-alpha.8)

**Read-only · localhost by default · token-protected · MCP 2025-11-25 (legacy era)**

> This is the generic guide. In Obsidian, run **Write Agent API guide** to
> create a vault-local copy with the actual address, token, and stdio-adapter
> path filled in.

Kosmos-Oden exposes one vendor-neutral MCP Streamable HTTP endpoint. Anthropic,
OpenAI, and other harnesses use the same tools and protocol; their config files
are only setup conveniences. Source notes and accepted GKX semantic events are
authoritative. API responses and Graphiti episodes are read projections.
Kosmos-Oden implements the GKX v2.3 Validating Projection Profile, not a full
GKOS governance engine.

## Start the connector

1. Open **Obsidian → Settings → Community plugins → Kosmos-Oden**.
2. Enable **local Agent API**.
3. Keep **Require auth token** enabled.
4. Choose the highest GKX sensitivity agents may read. The default is
   `internal`; `confidential` and `phi` remain hidden until explicitly enabled.

The default endpoint is `http://127.0.0.1:4816/mcp`. LAN mode is opt-in and
refuses to start without a token.

## Quick connect

The settings page has copy buttons for every configuration below.

### Anthropic Claude Code

```bash
claude mcp add --transport http --header "Authorization: Bearer <TOKEN>" kosmos-oden "http://127.0.0.1:4816/mcp"
```

Project-scoped `.mcp.json`:

```json
{
  "mcpServers": {
    "kosmos-oden": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:4816/mcp",
      "headers": { "Authorization": "Bearer <TOKEN>" }
    }
  }
}
```

### OpenAI Codex, ChatGPT desktop, and Codex IDE

These clients share Codex `config.toml` on the same desktop host:

```toml
[mcp_servers.kosmos-oden]
url = "http://127.0.0.1:4816/mcp"
http_headers = { Authorization = "Bearer <TOKEN>" }
```

You can instead use **Settings → MCP servers → Add server**, select
**Streamable HTTP**, and enter the URL and bearer token. ChatGPT web cannot
reach a localhost service; use the desktop Codex host for this connector.

### Claude Desktop and stdio-only harnesses

The release ships `kosmos-mcp-stdio.mjs`, a first-party adapter that preserves
the MCP session and protocol headers. It replaces the old downloaded
`mcp-remote` bridge.

```json
{
  "mcpServers": {
    "kosmos-oden": {
      "command": "node",
      "args": ["<PLUGIN-DIRECTORY>/kosmos-mcp-stdio.mjs"],
      "env": {
        "KOSMOS_MCP_URL": "http://127.0.0.1:4816/mcp",
        "KOSMOS_MCP_TOKEN": "<TOKEN>"
      }
    }
  }
}
```

Node.js 18 or newer is required for the adapter.

### Any Streamable HTTP harness

- URL: `http://127.0.0.1:4816/mcp`
- Header: `Authorization: Bearer <TOKEN>`
- Transport: MCP Streamable HTTP, session-based ("legacy") era
- Highest revision this server supports: `2025-11-25`
- Current published MCP revision: `2026-07-28` — **not supported here**

After `initialize`, return both `Mcp-Session-Id` and
`MCP-Protocol-Version` on later requests. Send one JSON-RPC message per POST;
batches are not part of this transport contract.

> **Client compatibility.** MCP revision `2026-07-28` removed the `initialize`
> handshake, protocol-level sessions and the GET stream; a client built only
> against it will fail against this endpoint, because it never sends the
> handshake this server requires. Use a client that can still speak
> `2025-11-25` (the specification calls a client that can do both "dual-era").
> This describes the shipped baseline only. The next build targets modern MCP
> only, with no legacy fallback requirement. The transport upgrade is pending;
> this documentation change does not implement it.

## Read tools

| Tool | Result |
|---|---|
| `vault_overview` | Sensitivity-filtered GKX projection statistics |
| `search_notes` | Lexical title/alias/tag/path search |
| `get_note` | Readable source body, legacy metadata, v2.3 projection, lineage, and links |
| `get_lineage` | Supersession chain, oldest to newest |
| `get_related` | Explicit `related_to`, legacy Related, outgoing, and backlink neighbors |
| `graph_at_time` | Point-in-time temporal-validity projection |
| `export_graphiti_episodes` | Paginated non-authoritative episodes with stable UUIDs |
| `get_gkx_note` | Origin-separated v2.3 validating projection |
| `get_assessment` / `assess_note` | Policy-bound documentation/support assessment for one note |
| `get_diagnostics` / `validate_note` | Stable diagnostics and in-memory validity result |
| `get_effective_labels` | Authored, derived, proposed, approved, and effective labels |
| `get_evidence` | Origin-separated support and contradiction evidence |
| `get_relationships` | UID-resolved typed relationships without proposed-edge promotion |
| `get_policy` | Bundled policy, version, hash, and trust state |
| `assess_vault` | Bounded in-memory assessment summary; no writes |

Assessment scores describe documentation completeness, traceability, and
support under the declared policy. They are not truth scores, approval, or
authorization. Proposed values never enter the effective projection until a
separate authorized decision exists.

Graphiti pages default to 20 episodes and cap at 100. Follow `nextCursor`.
Earlier episodes never receive later `superseded_by`, `head`, or `invalid_at`
state. A valid GKX UUID becomes the Graphiti episode UUID; notes without one
receive a deterministic fallback UUID. Stable identifiers do not guarantee
upstream deduplication. Verify ingestion behavior and searchability upstream.

### Knowing which Engine you are talking to

`vault_overview` reports three Engine coordinates **separately**, because they
move independently and conflating them has produced real misreports:

```json
"engine": {
  "library": { "version": "2.2.0", "source": "bundled-package" },
  "service": { "status": "not_configured", "version": null, "selfReported": false, ... },
  "profile": { "gkx": "2.3", "engineContractGeneration": "GKOS-Engine 2.1" }
}
```

- **`library`** is the `gkos-engine` package compiled into this plugin. It is
  authoritative for anything this endpoint computes locally.
- **`service`** is a remote Engine service. No such service is configured in
  this build, so `status` is `not_configured`, identity fields are `null`,
  `extensions` is empty and `selfReported` is `false`. It is
  **never** filled in from the library version. When one is configured,
  `status` distinguishes `not_connected` from `connected`, and `selfReported`
  tells you the values came from an actual negotiated response — which is
  evidence of what the peer said, not proof of which binary is running.
- **`profile.engineContractGeneration`** names the GKX/Navigation contract
  generation. It tracks neither of the other two.

`retrieval` reports what this deployment can actually serve, so you can plan
instead of probing:

```json
"retrieval": {
  "searchModes": ["metadata"], "matchModes": ["substring"], "bodyCoverage": "none",
  "maxPathDepth": 1, "timeAxes": ["valid_at"],
  "limits": { "maxSearchResults": 200, "maxNoteCharacters": 200000 }
}
```

`bodyCoverage: "none"` means note bodies are **not** searched. An empty
`search_notes` result therefore means "no metadata match", not "the text does
not appear in the vault" — use `get_note` to read a body. Likewise
`timeAxes: ["valid_at"]` means `graph_at_time` answers what was *valid* at a
time, never what was *known* at that time.

## REST and troubleshooting

Read-only REST mirrors are available at `/overview`, `/diagnostics`, `/graph`,
`/notes`, `/note`, `/lineage`, `/related`, `/at`, paginated `/episodes`, and
the `/gkx/` routes listed by the server root. Note selectors accept `uid`,
`path`, or `title`. Validate/assess routes compute in memory and remain GET-only.

- `401`: token missing or stale.
- `400` after initialization: session or protocol-version header missing.
- `404` on MCP: session expired or was terminated; initialize again.
- `403`: disallowed Host/Origin.
- `429`: back off; fairness/rate limit reached.
- No confidential note found: raise the sensitivity ceiling only if policy permits.

Request bodies are byte-capped at 4 MiB, note/episode content is capped, every
response is `Cache-Control: no-store`, and the server exposes no write tool.
