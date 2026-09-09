# MCP protocol: implemented era and remaining work

Reviewed 2026-09-09. Kosmos-Oden implements modern MCP only for the Agent API
server. Legacy fallback and dual-era implementation are outside build scope.

## Current implementation

The Agent API server implements revision 2026-07-28 and advertises no other.
It requires per-request metadata, implements `server/discover`, validates the
mirrored headers against the body, and answers `405` to the removed GET and
DELETE mechanisms. `SUPPORTED_MCP_PROTOCOL_VERSIONS` is `["2026-07-28"]`, and
the shipped stdio adapter mirrors body fields into headers rather than holding
a session.

The compliance follow-up validates required `clientCapabilities`, includes
`resultType: "complete"` on all successful responses, preserves protocol
errors through stdio, and includes supported-version guidance even when an
`initialize` request fails header validation. Optional client identity is not
required. See `docs/reviews/2026-09-09-mcp-compliance.md` for verification scope.

Verified against the published specification at implementation time, not from
a summary: the three normative pages are linked below. A bundled Engine 2.2.0
library still does not establish that a separate Engine service speaks modern
MCP or serves the same corpus.

**Not implemented.** The Engine retrieval client is unchanged and remains
outside this work. The server always answers `application/json`; it opens no
SSE response stream, which is conforming because the choice is the server's,
but it means `notifications/progress` and `subscriptions/listen` are not
offered. `x-mcp-header` is not used by any tool schema, so no
`Mcp-Param-*` header is designated.

## Modern implementation contract

At this review the target revision is 2026-07-28. Confirm the published
specification and exact service coordinate when qualifying the implementation.

- Each HTTP request carries its protocol version and client metadata in
  params._meta. Do not require an initialize handshake or protocol session.
- Implement server/discover and validate protocol/method/name metadata headers
  against the request body, including encoded values where required.
- The client advertises and handles both application/json and text/event-stream.
  JSON-only parsing is not a conforming modern client.
- HTTP GET streams and protocol session termination are removed. Keep
  request-scoped streaming and cancellation behavior consistent with the spec.
- Preserve authentication, origin validation, caller visibility, response
  bounds and truthful capability reporting through the transport change.

Treat unsupported protocol versions, header/body disagreement and unimplemented
methods as distinct errors. Exercise discovery, successful calls, malformed
requests, authentication failures, streaming responses and disconnects.

## Engine qualification

Identify the actual service build, supported protocol, contract/extensions and
authorized corpus. An endpoint that only supports the legacy contract does not
qualify for this target. Report that incompatibility; do not silently add a
legacy fallback or substitute the bundled library version for service identity.
Service-reported identity remains a self-report until backed by build evidence.

## Sources

- [Modern Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [Versioning and compatibility](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)
- [server/discover](https://modelcontextprotocol.io/specification/2026-07-28/server/discover)
- [Historical 2025-11-25 transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

The historical specification explains the installed baseline. It is not the
implementation contract selected for the next build.
