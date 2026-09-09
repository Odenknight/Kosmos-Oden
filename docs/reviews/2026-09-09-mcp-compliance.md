# MCP transport compliance fixes — 2026-09-09

Reviewed candidate: `7fb7181d871d4c304ee9ce3d12b1a425cb7f4bb8`.
Fix worktree: `.review-mcp`, branch `codex/mcp-compliance-fix`.

## Findings and fixes

- A real legacy `initialize` lacks modern headers. The candidate's test helper
  silently added them and tested a different request. Preserve HTTP 400 and
  HeaderMismatch (-32020), but include supported versions in the error message.
  An initialize request with valid modern metadata still returns 404/-32601.
  The specification does not require bypassing header validation for initialize.
- Successful results other than discovery omitted the required resultType.
  All completed operations now return `resultType: complete` and serverInfo.
- Required clientCapabilities was not checked. Missing/non-object capabilities
  and missing body protocolVersion now produce Invalid params (-32602).
  ClientInfo remains optional and its name/version are checked when supplied.
- HTTP 400/404 JSON-RPC errors were wrapped in a generic stdio transport error,
  destroying era detection and supported-version data. The bridge preserves
  upstream protocol errors. Locally generated adapter errors identify their
  source and use an application code outside the reserved JSON-RPC range.
- Malformed envelopes and fractional/null IDs are rejected before metadata
  handling or identity registration. Unknown methods that happen to match an
  Object prototype property no longer acquire a false Mcp-Name requirement.
- Root HTTP discovery incorrectly advertised sessions. It now reports false.
  Stale session troubleshooting and contradictory caller-identity prose are fixed.

## Verification

`npm run verify`: **328 passed, 0 failed**, typecheck/build successful, all five
checks successful (versions, dependency pin, artifacts, invariants, renderer
provenance). New regression coverage uses raw legacy requests, malformed
envelopes, missing required metadata, optional identity, complete result shapes,
root discovery, and end-to-end stdio protocol errors. Auth, Origin/Host,
sensitivity, bounds, UID selectors, and REST/MCP parity retain existing coverage.

Dependencies reused from `.review-main/node_modules`; installed receipt and
project lockfile identify Engine `650eab4a6752227cae336d7556a57826c22a0d5a`.
No fresh dependency install. Windows esbuild required sandbox escalation.

This qualifies the implemented JSON-response Agent API transport and bundled
bridge through local regression tests, not every optional MCP feature or a
third-party certification. No live endpoint, browser suite, Engine retrieval
client upgrade, deployment, push, or merge is claimed. The bridge is paired
with this JSON-only server; general SSE upstream support is outside this scope.
The original candidate patch is preserved unchanged. The adapter-sensitivity
candidate `fb9690e` is separate and is not incorporated in this fix.

## Normative sources checked

- [Base protocol, resultType, IDs and per-request metadata](https://modelcontextprotocol.io/specification/2026-07-28/basic)
- [Versioning and initialize diagnostics](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)
- [HTTP headers and error statuses](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [Discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover)
- [Tool result shapes](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
