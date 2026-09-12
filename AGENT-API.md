# Kosmos-Oden — universal Agent API guide (v0.8.3 candidate)

**Read-only · localhost by default · token-protected · MCP 2026-07-28 (modern era)**

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
- Transport: MCP Streamable HTTP, stateless per-request ("modern") era
- Only revision this server supports: `2026-07-28`

There is no handshake and no session. Every request carries its protocol
version and `io.modelcontextprotocol/clientCapabilities` object in
`params._meta`. Client identity (`io.modelcontextprotocol/clientInfo`, with
string `name` and `version`) is optional. Selected body fields are mirrored
into headers the server validates:

| Header | Mirrors | Required for |
| --- | --- | --- |
| `MCP-Protocol-Version` | `_meta["io.modelcontextprotocol/protocolVersion"]` | every request |
| `Mcp-Method` | `method` | every request |
| `Mcp-Name` | `params.name` / `params.uri` | `tools/call`, `resources/read`, `prompts/get` |

A value that is not header-safe is carried Base64-encoded as
`=?base64?<b64>?=`; the server decodes before comparing. Send one JSON-RPC
message per POST; batches are not part of this transport contract. Call
`server/discover` for identity, capabilities and supported versions in one
request.

Error responses, all distinct:

| Condition | HTTP | JSON-RPC |
| --- | --- | --- |
| header missing, malformed, or disagreeing with the body | 400 | `-32020` `HeaderMismatch` |
| required body metadata missing or invalid | 400 | `-32602` Invalid params |
| protocol version not supported | 400 | `-32022`, `data.supported` lists ours |
| method not implemented | 404 | `-32601` |

> **Client compatibility.** This server is modern-only: it implements no
> `initialize` handshake, mints no `Mcp-Session-Id`, hosts no GET stream and
> answers `405` to GET and DELETE. A legacy client built against `2025-11-25`
> or earlier cannot connect and has no fall-forward mechanism, so the error
> returned to `initialize` names the versions this server does support.
> A legacy request without modern headers receives `400`/`-32020`, including
> that version guidance; `initialize` with valid modern metadata reaches
> dispatch and receives `404`/`-32601`. No validation is bypassed.
> `Mcp-Session-Id` and `Last-Event-ID` on a request are ignored rather than
> rejected.

Successful responses include `resultType: "complete"` and server identity in
`result._meta`. The stdio adapter preserves upstream JSON-RPC errors, including
their codes and structured data on HTTP 400/404 responses.

## Read tools

| Tool | Result |
|---|---|
| `vault_overview` | Sensitivity-filtered GKX projection statistics |
| `search_notes` | Lexical title/alias/tag/path search; optional `body: true` searches bounded cached body prefixes |
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

The Obsidian provider also advertises `body` with `bodyCoverage: "partial"`.
Set `body: true` on `search_notes` to include readable cached body prefixes
(64,000 characters per note; 8 million per query). The `bodySearch` response
reports scan counts and truncation. Area/tag filters narrow the work. The
default stays metadata-only; no additional vault reads or embeddings are used.

`bodyCoverage: "none"` means the provider cannot search note bodies. An empty
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
- `400` on MCP: inspect the JSON-RPC error for malformed metadata, header
  disagreement, or an unsupported protocol version.
- `404` on MCP: the RPC method is not implemented; no initialization is needed.
- `403`: disallowed Host/Origin.
- `429`: back off; fairness/rate limit reached.

Concurrency is bounded at 24 in-flight HTTP requests, including loopback and
requests whose bodies are still arriving. After validation, named modern MCP
clients have separate 12-request execution buckets even when they share a
User-Agent. Names are cleaned self-reported labels, not authenticated identities;
identical cleaned names share a bucket. REST and unnamed clients fall back to
User-Agent. Only the LAN request-rate limit exempts loopback. See
`docs/AGENT-API-CONCURRENCY-STATUS.md` for the exact policy and its limits.
- No confidential note found: raise the sensitivity ceiling only if policy permits.

Request bodies are byte-capped at 4 MiB, note/episode content is capped, every
response is `Cache-Control: no-store`, and the server exposes no write tool.
