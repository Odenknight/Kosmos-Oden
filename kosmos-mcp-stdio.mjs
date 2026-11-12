#!/usr/bin/env node
/**
 * First-party MCP stdio bridge for Kosmos-Oden. Dependency-free; runs with
 * plain Node on the Obsidian computer or on a separate agent machine.
 *
 *   KOSMOS_MCP_URL     upstream endpoint (default http://127.0.0.1:4816/mcp);
 *                      for a remote agent, the Obsidian computer's reachable
 *                      LAN/VPN address, never 0.0.0.0
 *   KOSMOS_MCP_TOKEN   bearer token (sent as a header, never in the URL)
 *   KOSMOS_AGENT_NAME  optional display name for this process
 *
 * Both protocol eras are carried, one upstream HTTP request per message:
 *
 *  - Modern (2026-07-28): no handshake and no session. The bridge mirrors
 *    `method`, the `_meta` protocol version and the name/uri of the methods
 *    that carry one into the headers the transport requires. It never
 *    synthesizes metadata a client did not send.
 *  - Initialize era (2025-11-25, 2025-06-18, 2025-03-26): the revision the
 *    stdio client negotiates is remembered for THIS process only and sent as
 *    `MCP-Protocol-Version` on later upstream requests. No modern metadata is
 *    added to these requests.
 *  - 2024-11-05: served to the stdio client through an INTERNAL ADAPTER. The
 *    native endpoint does not advertise 2024-11-05 (that revision predates
 *    Streamable HTTP), so the bridge carries the exchange upstream as
 *    Streamable HTTP 2025-03-26 and reports 2024-11-05 to its stdio client.
 *    The server's legacy replies use a minimal tool/result subset that is
 *    valid on both revisions.
 *  - March-2025 batches arriving on stdio are split into bounded individual
 *    upstream requests and answered with one batch reply (ids preserved, no
 *    replies for notifications). Other revisions reject batches.
 *
 * stdout carries protocol messages only; diagnostics go to stderr. Closing
 * stdin aborts pending upstream requests and ends the process.
 */
import readline from "node:readline";

const endpoint = process.env.KOSMOS_MCP_URL || "http://127.0.0.1:4816/mcp";
const token = process.env.KOSMOS_MCP_TOKEN || "";
// Explicit per-process identity, never inferred from a shared token or address.
const agentName = process.env.KOSMOS_AGENT_NAME;
if (agentName !== undefined && (!agentName.trim() || agentName.length > 80 || /[\u0000-\u001f\u007f]/.test(agentName))) {
  process.stderr.write("Kosmos-Oden stdio adapter: KOSMOS_AGENT_NAME must contain 1–80 printable characters\n");
  process.exit(2);
}
try {
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("unsupported protocol");
} catch {
  process.stderr.write("Kosmos-Oden stdio adapter: KOSMOS_MCP_URL must be an http(s) URL\n");
  process.exit(2);
}

const OPERATION_TIMEOUT_MS = 65_000;
const MAX_PENDING_MESSAGES = 64;
const MAX_BATCH_MEMBERS = 100;
const BATCH_CONCURRENCY = 4;

const META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_CLIENT_INFO = "io.modelcontextprotocol/clientInfo";
const META_CLIENT_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
const MODERN_META_KEYS = [META_PROTOCOL_VERSION, META_CLIENT_CAPABILITIES, META_CLIENT_INFO];
const MODERN_METHODS = new Set(["server/discover", "subscriptions/listen"]);
/** Methods whose `Mcp-Name` header mirrors a body field, and which field. */
const NAME_SOURCE = { "tools/call": "name", "resources/read": "uri", "prompts/get": "name" };
/** Initialize-era revisions the native endpoint serves. */
const NATIVE_LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
/** Internal adapter: stdio revision -> upstream Streamable HTTP carriage. */
const ADAPTED_VERSIONS = { "2024-11-05": "2025-03-26" };
const BATCHING_VERSION = "2025-03-26";

/** Per-process negotiation state; never shared with another process. */
let stdioVersion; // revision agreed with the stdio client
let upstreamVersion; // revision sent upstream in MCP-Protocol-Version

const shutdown = new AbortController();

/** Header-safe per RFC 9110 field-value rules: visible ASCII, space, tab, and
 *  no leading/trailing whitespace. Anything else takes the Base64 sentinel. */
function headerValue(value) {
  const safe = /^[\x21-\x7E]([\x20-\x7E\x09]*[\x21-\x7E])?$/.test(value);
  if (safe && !(value.startsWith("=?base64?") && value.endsWith("?="))) return value;
  return `=?base64?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const validId = (id) => typeof id === "string" || (typeof id === "number" && Number.isInteger(id));

/** Presence of a reserved key or modern-only method marks a modern message. */
function isModern(message) {
  if (!isObject(message)) return false;
  if (MODERN_METHODS.has(message.method)) return true;
  const meta = isObject(message.params) ? message.params._meta : undefined;
  return isObject(meta) && MODERN_META_KEYS.some((k) => Object.hasOwn(meta, k));
}

function diagnostic(text) {
  process.stderr.write(`Kosmos-Oden stdio adapter: ${text}\n`);
}

function writeMessage(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function transportError(message, detail) {
  return {
    jsonrpc: "2.0",
    id: message?.id ?? null,
    error: { code: -30000, message: "Kosmos-Oden adapter transport error", data: { source: "kosmos-stdio-adapter", detail } },
  };
}

const invalidRequest = (id, message) => ({ jsonrpc: "2.0", id: validId(id) ? id : null, error: { code: -32600, message: `Invalid Request: ${message}` } });

/** Every JSON-RPC message in a text/event-stream body. */
function parseEventStream(text) {
  const out = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
    if (!data) continue;
    try { const value = JSON.parse(data); out.push(...(Array.isArray(value) ? value : [value])); } catch { diagnostic("ignored a malformed event-stream message"); }
  }
  return out;
}

/** Send one message upstream. Resolves to the JSON-RPC messages to relay
 *  (empty for an accepted notification or after shutdown). */
async function exchange(message) {
  const isRequest = message?.id !== undefined;
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = message;

  if (isModern(message)) {
    const meta = message.params?._meta;
    if (agentName !== undefined && isObject(meta)) {
      const info = meta[META_CLIENT_INFO];
      // Preserve malformed metadata so the server still diagnoses it. Required
      // protocol/capability metadata is never manufactured by this adapter.
      if (info === undefined || (isObject(info) && typeof info.name === "string" && typeof info.version === "string")) {
        meta[META_CLIENT_INFO] = { ...info, name: agentName.trim(), version: info?.version ?? "kosmos-stdio" };
      }
    }
    // Mirror the body into headers. A notification is exempt: this revision
    // leaves header requirements for notification POSTs undefined.
    if (isRequest) {
      const version = meta?.[META_PROTOCOL_VERSION];
      if (typeof version === "string") headers["MCP-Protocol-Version"] = version;
      if (typeof message.method === "string") headers["Mcp-Method"] = message.method;
      const field = Object.hasOwn(NAME_SOURCE, message.method) ? NAME_SOURCE[message.method] : undefined;
      const name = field ? message.params?.[field] : undefined;
      if (typeof name === "string") headers["Mcp-Name"] = headerValue(name);
    }
  } else {
    // Initialize era: the negotiated revision rides in the version header on
    // every request after initialize; no modern metadata is added.
    if (agentName !== undefined) headers["X-Kosmos-Agent-Name"] = agentName.trim();
    if (message?.method === "initialize") {
      const requested = message.params?.protocolVersion;
      if (Object.hasOwn(ADAPTED_VERSIONS, requested)) body = { ...message, params: { ...message.params, protocolVersion: ADAPTED_VERSIONS[requested] } };
    } else if (upstreamVersion) {
      headers["MCP-Protocol-Version"] = upstreamVersion;
    }
  }

  let response, text;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(OPERATION_TIMEOUT_MS)]),
    });
    text = await response.text();
  } catch (error) {
    if (shutdown.signal.aborted) return [];
    return isRequest ? [transportError(message, String(error?.message || error))] : (diagnostic(`notification not delivered: ${error?.message || error}`), []);
  }

  const contentType = String(response.headers.get("content-type") || "");
  let payloads;
  if (contentType.includes("text/event-stream")) payloads = parseEventStream(text);
  else { try { payloads = text ? [JSON.parse(text)].flat() : []; } catch { payloads = undefined; } }

  if (!isRequest) {
    if (!response.ok) diagnostic(`notification rejected: ${response.status} ${response.statusText}`);
    return [];
  }
  // HTTP 400/404 carry protocol errors too. Preserve their codes and data so
  // a stdio client can recognize the era and select a supported version.
  const reply = payloads?.find((p) => isObject(p) && p.jsonrpc === "2.0" && p.id === message.id && ("result" in p || "error" in p));
  if (reply && "error" in reply && Number.isInteger(reply.error?.code) && typeof reply.error.message === "string") return [reply];
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    if (text) detail += `: ${text.slice(0, 2000)}`;
    return [transportError(message, detail)];
  }
  if (!payloads) return [transportError(message, "server returned a non-JSON response")];
  if (!reply) return [transportError(message, "server returned no response for this request")];
  // Server-initiated messages related to the request precede its response.
  return [...payloads.filter((p) => p !== reply && isObject(p) && !("result" in p || "error" in p)), reply];
}

/** Record the negotiated revision; reject an upstream reply this bridge
 *  cannot carry instead of passing an unusable version to the client. */
function completeInitialize(message, reply) {
  if (!reply || !isObject(reply.result)) return reply;
  const offered = reply.result.protocolVersion;
  if (!NATIVE_LEGACY_VERSIONS.includes(offered)) {
    return { jsonrpc: "2.0", id: message.id, error: { code: -32603, message: `Kosmos-Oden adapter: upstream offered an unsupported protocol version: ${String(offered)}`, data: { source: "kosmos-stdio-adapter", supported: NATIVE_LEGACY_VERSIONS } } };
  }
  const requested = message.params?.protocolVersion;
  upstreamVersion = offered;
  if (Object.hasOwn(ADAPTED_VERSIONS, requested) && offered === ADAPTED_VERSIONS[requested]) {
    stdioVersion = requested;
    diagnostic(`stdio client negotiated ${requested}; carried upstream as Streamable HTTP ${offered} (internal adapter)`);
    return { ...reply, result: { ...reply.result, protocolVersion: requested } };
  }
  stdioVersion = offered;
  return reply;
}

async function handleMessage(message) {
  const out = await exchange(message);
  if (!isModern(message) && message?.method === "initialize" && message.id !== undefined) {
    const i = out.findIndex((p) => p.id === message.id);
    if (i >= 0) out[i] = completeInitialize(message, out[i]);
  }
  for (const m of out) writeMessage(m);
}

async function handleBatch(members) {
  if (members.length === 0) return writeMessage(invalidRequest(null, "empty JSON-RPC batch"));
  if (stdioVersion !== BATCHING_VERSION) {
    return writeMessage(invalidRequest(null, `JSON-RPC batches are not supported for ${stdioVersion ? `MCP ${stdioVersion}` : "a client that has not negotiated MCP 2025-03-26"}; send one message per line`));
  }
  if (members.length > MAX_BATCH_MEMBERS) return writeMessage(invalidRequest(null, `a batch may contain at most ${MAX_BATCH_MEMBERS} messages`));
  if (members.some(isModern)) return writeMessage(invalidRequest(null, "a batch may not contain modern MCP messages"));
  const replies = [];
  let next = 0;
  const worker = async () => {
    while (next < members.length && !shutdown.signal.aborted) {
      const member = members[next++];
      if (!isObject(member) || member.jsonrpc !== "2.0" || typeof member.method !== "string" || (member.id !== undefined && !validId(member.id))) {
        replies.push(invalidRequest(member?.id, "expected a JSON-RPC 2.0 request or notification"));
      } else if (member.method === "initialize") {
        if (member.id !== undefined) replies.push(invalidRequest(member.id, "initialize must not be part of a JSON-RPC batch"));
      } else {
        const out = await exchange(member);
        const reply = out.find((p) => "result" in p || "error" in p);
        if (member.id !== undefined && reply) replies.push(reply);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, members.length) }, worker));
  if (replies.length && !shutdown.signal.aborted) writeMessage(replies);
}

async function handleLine(line) {
  let message;
  try { message = JSON.parse(line); }
  catch { return writeMessage({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
  if (Array.isArray(message)) return handleBatch(message);
  return handleMessage(message);
}

// Messages are handled in arrival order; the queue is bounded so a client
// cannot pile up unbounded pending work behind a slow upstream.
const queue = [];
let pumping = false;
async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length && !shutdown.signal.aborted) await handleLine(queue.shift());
  pumping = false;
}

process.stdout.on("error", () => shutdown.abort()); // client went away
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
input.on("line", (line) => {
  if (!line.trim()) return;
  if (queue.length >= MAX_PENDING_MESSAGES) {
    let id;
    try { id = JSON.parse(line)?.id; } catch { /* unparseable: nothing to answer */ }
    if (validId(id)) writeMessage({ jsonrpc: "2.0", id, error: { code: -30000, message: "Kosmos-Oden adapter: too many pending requests", data: { source: "kosmos-stdio-adapter", limit: MAX_PENDING_MESSAGES } } });
    else diagnostic("dropped a message: too many pending requests");
    return;
  }
  queue.push(line);
  void pump();
});
// Shutdown: the client closes stdin. Pending upstream requests are aborted
// and queued messages are dropped. There is no session to tear down.
input.on("close", () => {
  if (queue.length || pumping) diagnostic(`stdin closed; aborting ${queue.length + (pumping ? 1 : 0)} pending message(s)`);
  queue.length = 0;
  shutdown.abort();
});
