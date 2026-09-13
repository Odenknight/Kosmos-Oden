#!/usr/bin/env node
/**
 * First-party MCP stdio adapter for Kosmos-Oden.
 *
 * Some desktop harnesses can launch stdio servers but cannot attach custom
 * headers to a local Streamable HTTP endpoint. This adapter translates one
 * newline-delimited JSON-RPC message at a time.
 *
 * Modern MCP (2026-07-28) has no handshake and no session, so the adapter
 * holds no state between messages. Its whole job on the HTTP side is the
 * mirroring the transport requires of a client: copy `method`, the protocol
 * version from `params._meta`, and the name/uri of the methods that carry one
 * into the matching headers. It deliberately does NOT synthesize `_meta` that
 * the stdio client did not send -- doing so would manufacture a conforming
 * request out of a non-conforming one and hide the server's own diagnostic.
 * Protocol output is stdout-only; diagnostics go to stderr.
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

const META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
/** Methods whose `Mcp-Name` header mirrors a body field, and which field. */
const NAME_SOURCE = { "tools/call": "name", "resources/read": "uri", "prompts/get": "name" };

/** Header-safe per RFC 9110 field-value rules: visible ASCII, space, tab, and
 *  no leading/trailing whitespace. Anything else takes the Base64 sentinel. */
function headerValue(value) {
  const safe = /^[\x21-\x7E]([\x20-\x7E\x09]*[\x21-\x7E])?$/.test(value);
  if (safe && !(value.startsWith("=?base64?") && value.endsWith("?="))) return value;
  return `=?base64?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

try {
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("unsupported protocol");
} catch {
  process.stderr.write("Kosmos-Oden stdio adapter: KOSMOS_MCP_URL must be an http(s) URL\n");
  process.exit(2);
}

function writeMessage(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function requestError(message, detail) {
  if (message?.id === undefined) return;
  writeMessage({
    jsonrpc: "2.0",
    id: message?.id ?? null,
    error: { code: -30000, message: "Kosmos-Oden adapter transport error", data: { source: "kosmos-stdio-adapter", detail } },
  });
}

async function forward(message) {
  const meta = message?.params?._meta;
  if (agentName !== undefined && meta && typeof meta === "object" && !Array.isArray(meta)) {
    const info = meta["io.modelcontextprotocol/clientInfo"];
    // Preserve malformed metadata so the server still diagnoses it. Required
    // protocol/capability metadata is never manufactured by this adapter.
    if (info === undefined || (info && typeof info === "object" && !Array.isArray(info) && typeof info.name === "string" && typeof info.version === "string")) {
      meta["io.modelcontextprotocol/clientInfo"] = { ...info, name: agentName.trim(), version: info?.version ?? "kosmos-stdio" };
      // Keep an agent's explicit arguments.agent_name; it takes precedence
      // over this process default at the server.
    }
  }
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  // Mirror the body into headers. A notification (no id) is exempt: this
  // revision leaves header requirements for notification POSTs undefined.
  if (message?.id !== undefined) {
    const version = message?.params?._meta?.[META_PROTOCOL_VERSION];
    if (typeof version === "string") headers["MCP-Protocol-Version"] = version;
    if (typeof message?.method === "string") headers["Mcp-Method"] = message.method;
    const field = Object.hasOwn(NAME_SOURCE, message?.method) ? NAME_SOURCE[message.method] : undefined;
    const name = field ? message?.params?.[field] : undefined;
    if (typeof name === "string") headers["Mcp-Name"] = headerValue(name);
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(65_000),
    });
  } catch (error) {
    requestError(message, String(error?.message || error));
    return;
  }

  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : undefined; } catch { /* diagnosed below */ }
  // HTTP 400/404 carry protocol errors too. Preserve their codes and data so
  // a stdio client can recognize the modern era and select a supported version.
  if (message?.id !== undefined && payload?.jsonrpc === "2.0" && payload.id === message.id &&
      Number.isInteger(payload.error?.code) && typeof payload.error.message === "string" && !("result" in payload)) {
    writeMessage(payload);
    return;
  }
  if (!response.ok && response.status !== 202) {
    let detail = `${response.status} ${response.statusText}`;
    if (text) detail += `: ${text.slice(0, 2000)}`;
    requestError(message, detail);
    return;
  }
  if (!text) return; // accepted notification

  if (!payload) {
    requestError(message, "server returned a non-JSON response");
    return;
  }
  writeMessage(payload);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
for await (const line of input) {
  if (!line.trim()) continue;
  let message;
  try { message = JSON.parse(line); }
  catch {
    writeMessage({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    continue;
  }
  await forward(message);
}

// No teardown: this revision removed session termination, and the endpoint
// answers 405 to DELETE. Closing stdin is the whole shutdown.
