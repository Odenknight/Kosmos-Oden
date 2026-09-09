# MCP protocol: shipped baseline and next build

Reviewed 2026-09-09. The next Kosmos-Oden build targets modern MCP only for
the Agent API server and the Engine retrieval client. Legacy fallback and
dual-era implementation are outside this build scope.

## Current implementation

The v0.8.2 Agent API uses MCP revisions through 2025-11-25. It initializes a
session, returns a session identifier and checks it on subsequent requests.
A client that speaks only the modern contract cannot use that implementation.
These are baseline facts, not requirements for the next build.

This documentation revision does not implement modern transport. The server's
supported-version list must remain truthful until implementation and tests
change it. A bundled Engine 2.2.0 library does not establish that a separate
Engine service speaks modern MCP or serves the same corpus.

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
- [Specification versioning](https://modelcontextprotocol.io/specification/versioning)
- [Historical 2025-11-25 transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

The historical specification explains the installed baseline. It is not the
implementation contract selected for the next build.
