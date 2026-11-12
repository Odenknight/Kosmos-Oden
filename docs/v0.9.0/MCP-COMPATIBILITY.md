# MCP compatibility in Kosmos-Oden 0.9.0

Kosmos-Oden answers MCP clients from both protocol eras through the same
protected Agent API listener. "Old and new" here means tested protocol
behavior on named transports, not a longer list of accepted date strings.

## Transport and revision matrix

| Revision | Native Streamable HTTP `/mcp` | Bundled stdio bridge (`kosmos-mcp-stdio.mjs`) | Opening |
| --- | --- | --- | --- |
| `2026-07-28` (modern) | Yes | Yes | Per-request `_meta` and mirrored headers; `server/discover`; no handshake |
| `2025-11-25` | Yes | Yes | `initialize`, `notifications/initialized`, then tools |
| `2025-06-18` | Yes | Yes | Same lifecycle; `MCP-Protocol-Version` header after `initialize` |
| `2025-03-26` | Yes, including JSON-RPC batches | Yes, including JSON-RPC batches | Same lifecycle; headerless HTTP requests default to this revision |
| `2024-11-05` | **No** | Yes, through the bridge's internal adapter | Legacy stdio lifecycle |

Not included in 0.9.0: the deprecated HTTP+SSE transport (`GET /sse` plus
`POST /messages`). A host that can only speak that transport is outside this
release's matrix; use the stdio bridge instead if the host can launch stdio
servers. Native discovery (`GET /`) lists only the native HTTP revisions.

The "Accept older MCP clients" setting (`agentLegacyMcp`) is on by default
for fresh installs, migrated settings, and any settings object that omits the
field. Turned off, every initialize-era request is refused with HTTP 400 and
error `-32022` naming the modern revision, while modern traffic keeps
working. Enabling the setting never starts the connector.

## Classification

Each POST to `/mcp` is classified before any tool runs
(`src/plugin/mcp-compat.ts`, `classifyMcpRequest`):

1. Framing first: invalid JSON is `-32700`; an invalid single envelope is
   HTTP 400 `-32600`. Authentication and Host/Origin checks have already run.
2. Any modern marker selects the strict modern path, even when malformed:
   presence of `io.modelcontextprotocol/protocolVersion`,
   `.../clientCapabilities` or `.../clientInfo` in `params._meta`; a
   modern-only method (`server/discover`, `subscriptions/listen`); an
   `Mcp-Method`, `Mcp-Name` or `Mcp-Param-*` header; or a modern
   `MCP-Protocol-Version` value. A numeric protocol version or
   capabilities-only metadata therefore gets the modern `-32020`/`-32602`
   error and never reaches a tool. Ordinary extension `_meta` keys are not
   markers.
3. An explicit `MCP-Protocol-Version` that this transport does not serve
   (including `2024-11-05` on native HTTP) is HTTP 400 `-32022` with the
   advertised list.
4. Everything else is initialize-era traffic at the header's revision, or at
   `2025-03-26` when no header is present.

## Initialize-era behavior

- Stateless: no `Mcp-Session-Id` is issued, nothing negotiated is stored, and
  two clients on different revisions cannot affect each other. GET and DELETE
  on `/mcp` answer 405.
- `initialize` validates `protocolVersion`, `capabilities` and
  `clientInfo.name`/`version`. A supported requested revision is echoed;
  otherwise the server offers its newest native revision (`2025-11-25`) and
  the client decides. `initialize` inside a batch is `-32600`.
- Implemented: `initialize`, `ping`, `tools/list`, `tools/call`. Any
  notification is accepted with an empty 202. Other methods are `-32601`.
  Only the `tools` capability is advertised.
- Minimal shapes valid on every legacy revision: tools are `name`,
  `description`, `inputSchema`; results are one `text` content block holding
  serialized JSON from the same tool service the modern path uses, plus
  `isError`. No `structuredContent`, `outputSchema`, `title`, `annotations`,
  `resultType` or cache fields. `serverInfo` is `name` and `version`.
- Cancellation: the request-scoped response is the unit of work. Closing the
  connection, the operation deadline, a server restart or a policy-generation
  change ends it; held data is not written afterwards. A
  `notifications/cancelled` POST is acknowledged (202) but cannot reach a
  request on another stateless connection.

## March 2025 batches

For an effective revision of `2025-03-26` a POST body may be a non-empty
array of at most 100 messages (inside the 4 MiB body limit):

- Each member is validated on its own; invalid entries get `-32600` (with
  their id when one is detectable, else `null`).
- Valid notifications get no reply. A notification-only batch answers 202
  with no body.
- Otherwise the response is a request-scoped `text/event-stream`: one
  `message` event per reply, closed when all members finish. A client whose
  `Accept` excludes `text/event-stream` gets a JSON array instead.
- Members run at most 4 at a time; total reply output is capped at 16 MiB,
  after which remaining replies become `-32603` errors.
- Authentication, the per-request deadline and the policy generation cover
  every member. If the generation changes mid-batch, no further member data
  is written and the stream is cut.
- An empty or oversized array, an array with any modern marker, and an array
  on `2025-06-18`/`2025-11-25` (which removed batching) are rejected with
  HTTP 400 `-32600`.

## The stdio bridge

`kosmos-mcp-stdio.mjs` is a single dependency-free file run with plain Node.
Configure `KOSMOS_MCP_URL` (the Obsidian computer's reachable address when the
bridge runs on another machine), `KOSMOS_MCP_TOKEN` and optionally
`KOSMOS_AGENT_NAME`.

- Modern messages are forwarded with their `_meta` mirrored into headers; the
  bridge never invents missing metadata.
- The legacy revision negotiated with the stdio client is remembered per
  bridge process and sent as `MCP-Protocol-Version` on later upstream
  requests. Legacy requests never receive synthesized modern metadata; the
  optional agent name travels in `X-Kosmos-Agent-Name`.
- **2024-11-05 internal adapter.** The bridge accepts a `2024-11-05`
  `initialize`, carries the exchange upstream as Streamable HTTP `2025-03-26`
  and reports `2024-11-05` to its client. This is a deliberate translation of
  the carriage, logged on stderr; it is not a claim that 2024-11-05 defined
  Streamable HTTP. The minimal legacy tool/result subset is valid on both.
- If upstream offers a revision the bridge cannot carry, the bridge answers
  the client's `initialize` with an error instead of passing it through.
- After a `2025-03-26` handshake, a stdio batch is split into individual
  upstream requests (4 at a time, at most 100 members) and answered as one
  batch with ids preserved and no replies for notifications. Other revisions
  reject batches with `-32600`.
- stdout carries protocol messages only; diagnostics go to stderr. Accepted
  notifications (HTTP 202) print nothing. Upstream HTTP failures become
  `-30000` errors for that request id; protocol errors keep their codes.
- At most 64 messages may wait; more requests are answered with an error.
  Each upstream request has a 65 s timeout. Closing stdin aborts pending
  upstream requests, drops queued messages and exits.

## Evidence

- `test/mcp-compat.test.mjs`: classifier probes; exact-revision raw wire
  fixtures for `2025-11-25`, `2025-06-18`, `2025-03-26`; negotiation and
  unknown versions; malformed modern probes over HTTP; modern strict
  validation; official SDK client (`@modelcontextprotocol/client` 2.4.0);
  native batches; mid-batch policy change; the setting; token/Host/Origin;
  both eras concurrently on one server.
- `test/mcp-bridge-compat.test.mjs`: spawned bridge for the full
  `2024-11-05` lifecycle, SDK over stdio, per-process negotiated headers,
  stdio batches, a LAN-bound server reached by a non-loopback address,
  authentication failures, an unacceptable upstream reply and shutdown with a
  pending request.
- SDK 2.4.0 negotiated revisions observed: HTTP pinned modern and `auto` →
  `2026-07-28`; default → `2025-11-25`; restricted clients → their exact
  revision (`2025-11-25`, `2025-06-18`, `2025-03-26`). Over the stdio bridge:
  `2024-11-05`, `2025-03-26`, default `2025-11-25`, pinned `2026-07-28`.

SDK tests are SDK qualification, not product-client trials. Named desktop
clients and a second physical machine remain owner trials (acceptance rows
C01 and N02).
