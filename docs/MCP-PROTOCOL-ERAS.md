# MCP protocol eras and what Kosmos-Oden supports

Gathered 2026-09-09 from the published specification. This is a reference for
the Agent API and for the planned Engine retrieval bridge. It records protocol
facts and the gap they open; it does not authorize or describe any
implementation that does not exist yet.

## The short version

| | |
|---|---|
| Current published MCP revision | **`2026-07-28`** |
| Highest revision Kosmos-Oden's server speaks | **`2025-11-25`** |
| Are they compatible? | **No.** `2026-07-28` is a backwards-incompatible revision |
| Consequence | A client that speaks *only* `2026-07-28` cannot use the Kosmos Agent API at all. In practice most will not: the Tier 1 SDKs fall back automatically — see [How bad is this in practice](#how-bad-is-this-in-practice-less-than-the-matrix-suggests) |

MCP version identifiers are `YYYY-MM-DD` and change only when a
backwards-incompatible change lands, so the date moving from `2025-11-25` to
`2026-07-28` is itself the signal that something broke.

## The two eras

The specification names them, and the names are worth using precisely because
"version" alone is ambiguous:

- **Legacy** — revisions `2025-11-25` and earlier. A session is established by
  an `initialize` handshake.
- **Modern** — revision `2026-07-28` and later. There is no handshake. Every
  request carries its own version, identity and capabilities as metadata.
- **Dual-era** — an implementation that supports both.

### Compatibility, as the specification states it

| Client | Server | Outcome |
|---|---|---|
| Modern | Modern | Works |
| Modern | **Legacy** | **Fails** |
| Dual-era | Modern | Works |
| Dual-era | Legacy | Works |
| **Legacy** | **Modern** | **Fails** |
| Legacy | Dual-era | Works |
| Legacy | Legacy | Works |

Kosmos-Oden's Agent API is a **legacy server**, so row 2 is the exposure and
row 5 is its mirror image for the planned Engine bridge, where Kosmos would be
the client.

Read those two rows carefully, though: "Modern" here means a client that speaks
*only* the modern era. A client that can still fall back is "Dual-era", row 4,
which works — and that is what the Tier 1 SDKs actually ship. The next section
sizes the real exposure.

Note that the era is a property of the *server*, not of a request. A dual-era
client is expected to detect the era once and cache it for the lifetime of the
server process (stdio) or origin (HTTP), re-probing only if the cached
assumption later fails.

## How bad is this in practice? Less than the matrix suggests

The matrix describes *eras*, not products. A conforming client is normally
dual-era, and the official SDKs make that the default.

All four Tier 1 SDKs — TypeScript, Python, Go and C# — speak `2026-07-28`. The
Python SDK's v2 line is the current stable release (2.2.0, 2026-09-07). On the
client side its **default mode probes for the modern server and falls back to
the `initialize` handshake against a `2025-11-25`-or-earlier server**; the
published guidance describes no strict, modern-only mode that would refuse to
fall back. On the server side a v2 server answers both the legacy handshake and
`server/discover` from one endpoint.

So the realistic exposure for Kosmos-Oden's legacy-only server is narrower than
"modern clients cannot connect". A client built on a Tier 1 SDK keeps working,
because it detects the era and falls back. What actually breaks is a client
that has deliberately disabled fallback, or a hand-rolled modern-only client.

That makes dual-era support on the Kosmos side **hygiene rather than a cliff**.
It is still worth doing — it removes a dependency on every client's fallback
path staying polite, it is additive, and the fallback costs a wasted round trip
on every new connection — but it is not the difference between being reachable
and unreachable today.

Do not soften the other direction, though: **Kosmos as an MCP client** has no
such safety net unless whatever it is built on provides one. If the retrieval
bridge is hand-rolled rather than SDK-based, its fallback behavior is something
this project has to implement and test, not inherit.

## What `2026-07-28` changed

Everything in this section is a change from `2025-11-25`.

**The handshake is gone.** No `initialize`, no `notifications/initialized`.
Each request declares its version in `_meta` under the key
`io.modelcontextprotocol/protocolVersion`, alongside
`io.modelcontextprotocol/clientInfo` and
`io.modelcontextprotocol/clientCapabilities`. The server accepts or rejects
each request independently.

**Protocol-level sessions are gone.** No `Mcp-Session-Id`, no minting, no
echoing, no `DELETE` to terminate. A server that receives `Mcp-Session-Id`
ignores it rather than honouring it.

**The GET stream is gone**, and so is `Last-Event-ID` resumability. A
`2026-07-28`-only server answers `GET` or `DELETE` on the MCP endpoint with
`405 Method Not Allowed`.

**`server/discover` is mandatory** for servers. It returns supported protocol
versions, capabilities and identity in one request. Clients *may* call it first
but are not required to.

**Required headers, validated against the body.** Every POST carries
`MCP-Protocol-Version`, `Mcp-Method`, and — for `tools/call`, `resources/read`
and `prompts/get` — `Mcp-Name`. A server that processes the body **must**
reject any header/body mismatch with `400` and JSON-RPC error `-32020`
(`HeaderMismatch`). Values that are not safe as plain ASCII use a
`=?base64?...?=` sentinel encoding, which the server must decode before
comparing.

**Clients must support both JSON and SSE responses.** The client sends an
`Accept` header listing `application/json` *and* `text/event-stream`, and the
server picks per request. A JSON-only client is not a conforming client, even
if a particular server happens never to stream.

**Server-to-client requests on SSE are gone.** Sampling, elicitation and roots
are now embedded in results as `InputRequiredResult` input requests, which the
client answers by retrying the original request with `inputResponses`
(Multi Round-Trip Requests). Long-lived change notifications move to a
`subscriptions/listen` request whose response stream stays open.

**Cancellation is transport-level on HTTP:** closing the SSE response stream
*is* the cancellation signal, and no `notifications/cancelled` is expected.

**New error codes:** `-32022` `UnsupportedProtocolVersionError`, which carries
the server's `supported` version list so a client can retry; `-32020`
`HeaderMismatch`. An unimplemented method returns `404` with `-32601`.

**Era detection over HTTP,** for a dual-era client: send a modern request; on
`400 Bad Request`, inspect the body. A recognized modern JSON-RPC error means
the server is modern — retry with an advertised version. An empty or
unrecognized body means the server is legacy — fall back to `initialize`.

There is also a formal feature-lifecycle and deprecation policy: a deprecated
feature stays in the specification at least twelve months (ninety days under
the expedited exception) before it is eligible for removal. The 2024-11-05
HTTP+SSE transport is Deprecated under it.

## Where this lands in Kosmos-Oden

**Kosmos as MCP server.** `SUPPORTED_MCP_PROTOCOL_VERSIONS` in
`src/plugin/agent-server.ts` lists `2025-11-25`, `2025-06-18`, `2025-03-26`,
`2024-11-05`. The server mints `Mcp-Session-Id` at `initialize`, enforces
initialization order, requires the session id on later POSTs and returns `404`
on an unknown or expired session. All of that is legacy-era behavior. Nothing
in the tool catalog or the sensitivity model is affected — the break is in the
transport and lifecycle only.

Serving both eras from one endpoint is explicitly permitted: a request carrying
modern `_meta` is served statelessly, an `initialize` request selects the
legacy path, and a server may serve both concurrently. So dual-era support is
additive and does not require abandoning existing clients.

**Kosmos as MCP client**, for the planned Engine retrieval bridge. The Engine
service is reported at protocol `2025-11-25` and JSON-only. Two consequences:

1. A bridge written strictly to `2026-07-28` would fail against that Engine
   (modern client, legacy server). The bridge needs the legacy path, or
   dual-era detection, for as long as the Engine stays on `2025-11-25`.
2. The retrieval plans' option of a "JSON-only client for the pinned Engine
   profile" is a restricted profile under `2025-11-25` and is *not* a
   conforming client under `2026-07-28`, where JSON **and** SSE are both
   mandatory. It remains a legitimate engineering choice for one known peer,
   but it must be labelled a pinned-peer profile rather than a general MCP
   client, and it forecloses reuse against a modern server later.

## Sources

- [Versioning](https://modelcontextprotocol.io/specification/versioning)
- [Versioning and Compatibility, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)
- [Streamable HTTP, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [Streamable HTTP, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

Specification pages are living documents. Re-read them before pinning an
implementation to any detail above.
