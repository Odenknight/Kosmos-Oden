/**
 * MCP protocol-era classification and the legacy (initialize-era) adapter.
 *
 * Framework-free and Obsidian-free so it can be tested on its own. The Agent
 * API server keeps its listener, authentication, Host/Origin checks, limits
 * and the modern 2026-07-28 handler; it hands this module only traffic that
 * classifies as legacy, plus a narrow tool-service interface. Nothing here
 * keeps state between requests: there is no session and no negotiated
 * version shared between clients.
 *
 * Classification (build instructions §8, rules 1-7):
 *  - Any modern marker selects the modern path, even when its value is
 *    malformed. Markers are the PRESENCE of a reserved request `_meta` key, a
 *    modern-only method, a modern routing header (`Mcp-Method`, `Mcp-Name`,
 *    `Mcp-Param-*`) or a modern `MCP-Protocol-Version` value. A malformed
 *    modern request therefore gets the strict modern diagnostic; it is never
 *    downgraded to the more permissive legacy contract.
 *  - Otherwise an explicit `MCP-Protocol-Version` header must name a revision
 *    this transport serves, or the request is rejected with the version error.
 *  - Otherwise the request is legacy at the header's revision, or, without a
 *    header, at the specification's default `2025-03-26`.
 */
import { ProviderError } from "./vault-operations";

/* ---------------- protocol constants (wire identifiers) ---------------- */

export const MODERN_MCP_PROTOCOL_VERSION = "2026-07-28";
/** Modern revisions answered on the per-request-metadata path. */
export const SUPPORTED_MCP_PROTOCOL_VERSIONS = [MODERN_MCP_PROTOCOL_VERSION];

/** Initialize-era revisions served natively on Streamable HTTP `/mcp`. */
export const NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
/** Revisions carried only by the bundled stdio bridge's internal adapter. */
export const STDIO_ONLY_MCP_PROTOCOL_VERSIONS = ["2024-11-05"];
/** Every initialize-era revision Kosmos-Oden covers on some transport. */
export const LEGACY_MCP_PROTOCOL_VERSIONS = [...NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS, ...STDIO_ONLY_MCP_PROTOCOL_VERSIONS];
export const LATEST_LEGACY_MCP_PROTOCOL_VERSION = NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS[0];
/** 2025-06-18 transport: a server that receives no version header and has no
 *  other way to identify the version SHOULD assume 2025-03-26. */
export const DEFAULT_LEGACY_HTTP_PROTOCOL_VERSION = "2025-03-26";
/** Revisions whose base protocol defines JSON-RPC batches (added 2025-03-26,
 *  removed 2025-06-18). */
export const BATCHING_MCP_PROTOCOL_VERSIONS = ["2025-03-26"];

/** Transport-specific advertisement. Native `/mcp` never claims 2024-11-05:
 *  that revision predates Streamable HTTP and reaches Kosmos only through the
 *  stdio bridge. Deprecated HTTP+SSE (`/sse` + `/messages`) is not offered. */
export const MCP_TRANSPORT_PROTOCOL_VERSIONS = {
  http: [MODERN_MCP_PROTOCOL_VERSION, ...NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS],
  stdio: [MODERN_MCP_PROTOCOL_VERSION, ...NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS, ...STDIO_ONLY_MCP_PROTOCOL_VERSIONS],
} as const;

/** Protocol versions to advertise for a transport, aligned with the
 *  "Accept older MCP clients" setting. */
export function advertisedMcpProtocolVersions(transport: "http" | "stdio", acceptOlder: boolean): string[] {
  return acceptOlder ? [...MCP_TRANSPORT_PROTOCOL_VERSIONS[transport]] : [...SUPPORTED_MCP_PROTOCOL_VERSIONS];
}

export const MCP_META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
export const MCP_META_CLIENT_INFO = "io.modelcontextprotocol/clientInfo";
export const MCP_META_CLIENT_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
export const MCP_META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";
/** Reserved request `_meta` keys whose presence marks a modern request. */
export const MCP_MODERN_REQUEST_META_KEYS = [MCP_META_PROTOCOL_VERSION, MCP_META_CLIENT_CAPABILITIES, MCP_META_CLIENT_INFO];
/** Methods that exist only in the modern era. */
export const MODERN_ONLY_MCP_METHODS: ReadonlySet<string> = new Set(["server/discover", "subscriptions/listen"]);

export const MCP_ERR_HEADER_MISMATCH = -32020;
export const MCP_ERR_UNSUPPORTED_PROTOCOL_VERSION = -32022;

/** March-2025 batch bounds. The 4 MiB body limit applies before parsing. */
export const MAX_LEGACY_BATCH_MEMBERS = 100;
export const LEGACY_BATCH_CONCURRENCY = 4;
export const MAX_LEGACY_BATCH_OUTPUT_BYTES = 16 * 1024 * 1024;

/** A JSON-RPC error raised by tool validation or lookup. */
export class McpRpcError extends Error {
  code: number;
  data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

/* ---------------- classification ---------------- */

export type McpHeaders = Record<string, string | string[] | undefined>;
export type McpRoute =
  | { era: "modern" }
  | { era: "legacy"; version: string; explicit: boolean }
  | { era: "unsupported-version"; requested: string };

function header(headers: McpHeaders | undefined, name: string): string | undefined {
  const v = headers?.[name];
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
}

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);

/** True when one message carries a modern marker in its body. Presence is
 *  what counts: a numeric version or capabilities-only metadata still marks
 *  the request modern so it is validated strictly. */
export function hasModernBodyMarker(msg: unknown): boolean {
  if (!isObject(msg)) return false;
  if (typeof msg.method === "string" && MODERN_ONLY_MCP_METHODS.has(msg.method)) return true;
  const meta = isObject(msg.params) ? msg.params._meta : undefined;
  return isObject(meta) && MCP_MODERN_REQUEST_META_KEYS.some((k) => Object.hasOwn(meta, k));
}

/** True when the HTTP headers carry a modern routing or version marker. */
export function hasModernHeaderMarker(headers: McpHeaders | undefined): boolean {
  if (header(headers, "mcp-method") !== undefined || header(headers, "mcp-name") !== undefined) return true;
  if (headers && Object.keys(headers).some((k) => k.toLowerCase().startsWith("mcp-param-"))) return true;
  const version = header(headers, "mcp-protocol-version");
  return version !== undefined && version >= MODERN_MCP_PROTOCOL_VERSION && /^\d{4}-\d{2}-\d{2}$/.test(version);
}

/** Route one parsed POST body (a message or a batch array) to an era. */
export function classifyMcpRequest(headers: McpHeaders | undefined, parsed: unknown): McpRoute {
  const members = Array.isArray(parsed) ? parsed : [parsed];
  if (hasModernHeaderMarker(headers) || members.some(hasModernBodyMarker)) return { era: "modern" };
  const version = header(headers, "mcp-protocol-version");
  if (version === undefined) return { era: "legacy", version: DEFAULT_LEGACY_HTTP_PROTOCOL_VERSION, explicit: false };
  if (NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS.includes(version)) return { era: "legacy", version, explicit: true };
  return { era: "unsupported-version", requested: version };
}

/* ---------------- legacy dispatch ---------------- */

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/** The only surface the legacy adapter needs from a tool provider. Plugging
 *  in a different tool set (for example a profile with fewer tools) means
 *  supplying another implementation; the wire code does not change. */
export interface McpToolService {
  toolDefs(): ReadonlyArray<McpToolDef>;
  /** Validates arguments itself; throws McpRpcError for protocol errors. */
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** False once the request's authorization/policy context is stale. */
  isActive(): boolean;
}

export interface LegacyServerIdentity {
  name: string;
  version: string;
  instructions?: string;
}

export interface LegacyDispatchOptions {
  /** Revisions this transport negotiates, newest first. */
  supportedVersions: readonly string[];
  /** The message arrived inside a JSON-RPC batch. */
  inBatch?: boolean;
}

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: Record<string, unknown> }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string; data?: unknown } };

const validId = (id: unknown): id is string | number => typeof id === "string" || (typeof id === "number" && Number.isInteger(id));

function rpcError(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

/** JSON-RPC envelope check. Returns the Invalid Request reply, or null when
 *  the message is a well-formed request or notification. */
export function invalidEnvelope(msg: unknown): JsonRpcResponse | null {
  const ok = isObject(msg) && msg.jsonrpc === "2.0" && typeof msg.method === "string" &&
    !("result" in msg) && !("error" in msg) && (msg.id === undefined || validId(msg.id));
  if (ok) return null;
  const id = isObject(msg) && typeof msg.method === "string" && validId(msg.id) ? msg.id : null;
  return rpcError(id, -32600, "Invalid Request: expected one JSON-RPC 2.0 request or notification with a string or integer id");
}

/** Minimal tool shape valid on every supported legacy revision. */
export function legacyToolShape(def: McpToolDef): McpToolDef {
  return { name: def.name, ...(typeof def.description === "string" ? { description: def.description } : {}), inputSchema: def.inputSchema };
}

/** Answer one legacy message. Returns null for a notification (no JSON-RPC
 *  response is ever sent for one). Results carry no modern fields: no
 *  resultType, cache directives, structuredContent, outputSchema or title. */
export async function legacyMcpDispatch(
  msg: unknown,
  service: McpToolService,
  identity: LegacyServerIdentity,
  options: LegacyDispatchOptions,
): Promise<JsonRpcResponse | null> {
  const invalid = invalidEnvelope(msg);
  if (invalid) return invalid;
  const m = msg as Record<string, any>;
  if (m.id === undefined) return null; // notifications/initialized, notifications/cancelled, ...
  const id: string | number = m.id;
  const ok = (result: Record<string, unknown>): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
  if (m.params !== undefined && !isObject(m.params)) return rpcError(id, -32602, "Invalid params: expected an object");
  const params: Record<string, any> = m.params ?? {};
  try {
    switch (m.method) {
      case "initialize": {
        if (options.inBatch) return rpcError(id, -32600, "Invalid Request: initialize must not be part of a JSON-RPC batch");
        if (typeof params.protocolVersion !== "string") return rpcError(id, -32602, "Invalid params: initialize requires string protocolVersion");
        if (!isObject(params.capabilities)) return rpcError(id, -32602, "Invalid params: initialize requires a capabilities object");
        const info = params.clientInfo;
        if (!isObject(info) || typeof info.name !== "string" || typeof info.version !== "string") {
          return rpcError(id, -32602, "Invalid params: initialize requires clientInfo with string name and version");
        }
        // Lifecycle: echo a supported requested revision, otherwise offer the
        // latest this transport supports and let the client decide.
        const protocolVersion = options.supportedVersions.includes(params.protocolVersion)
          ? params.protocolVersion
          : options.supportedVersions[0];
        return ok({
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: identity.name, version: identity.version },
          ...(identity.instructions ? { instructions: identity.instructions } : {}),
        });
      }
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: service.toolDefs().map(legacyToolShape) });
      case "tools/call": {
        if (typeof params.name !== "string") return rpcError(id, -32602, "Invalid params: tools/call requires string name");
        const args = params.arguments ?? {};
        if (!isObject(args)) return rpcError(id, -32602, "Invalid params: tools/call arguments must be an object");
        try {
          const result = await service.callTool(params.name, args);
          return ok({
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            isError: Boolean(isObject(result) && result.error),
          });
        } catch (e: any) {
          if (e instanceof McpRpcError) throw e;
          const text = e instanceof ProviderError ? e.message : "Error: " + (e?.message || String(e));
          return ok({ content: [{ type: "text", text }], isError: true });
        }
      }
      default:
        return rpcError(id, -32601, "Method not found: " + m.method);
    }
  } catch (e: any) {
    if (e instanceof McpRpcError) return rpcError(id, e.code, e.message, e.data);
    return rpcError(id, -32603, e?.message || "Internal error");
  }
}

/** Process a legacy batch with bounded concurrency. Calls `emit` once per
 *  reply as it completes (never for a valid notification). Stops starting
 *  members once the service is no longer active. Callers check the framing
 *  (non-empty, member count, batching revision) first. */
export async function legacyMcpBatch(
  members: readonly unknown[],
  service: McpToolService,
  identity: LegacyServerIdentity,
  options: LegacyDispatchOptions,
  emit: (reply: JsonRpcResponse) => void,
): Promise<void> {
  let next = 0, outputBytes = 0;
  const worker = async () => {
    while (next < members.length && service.isActive()) {
      const member = members[next++];
      let reply = await legacyMcpDispatch(member, service, identity, { ...options, inBatch: true });
      if (!reply || !service.isActive()) continue;
      outputBytes += JSON.stringify(reply).length;
      if (outputBytes > MAX_LEGACY_BATCH_OUTPUT_BYTES) {
        reply = rpcError(reply.id, -32603, `Batch output limit exceeded (${MAX_LEGACY_BATCH_OUTPUT_BYTES} bytes); send this request separately`);
      }
      emit(reply);
    }
  };
  await Promise.all(Array.from({ length: Math.min(LEGACY_BATCH_CONCURRENCY, members.length) }, worker));
}

/** True when a batch member needs a JSON-RPC reply (a request or an invalid
 *  entry); valid notifications get none. */
export function needsReply(member: unknown): boolean {
  return invalidEnvelope(member) !== null || (member as Record<string, unknown>).id !== undefined;
}

/* ---------------- legacy Streamable HTTP ---------------- */

/** The part of Node's ServerResponse the adapter writes to. */
export interface HttpResponseLike {
  writeHead(status: number, headers: Record<string, string>): unknown;
  write(chunk: string): unknown;
  end(chunk?: string): unknown;
}

function sendJson(res: HttpResponseLike, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body, null, 2));
}

/**
 * Serve one legacy POST to `/mcp`: a single message or a March-2025 batch.
 * Stateless: no `Mcp-Session-Id` is issued and nothing is remembered.
 *  - A notification, or a batch of only notifications, answers 202 with no body.
 *  - A single request answers `application/json`.
 *  - A batch needing replies answers a request-scoped `text/event-stream`
 *    with one `message` event per reply, closed when all have been sent
 *    (Streamable HTTP response streaming; not the deprecated HTTP+SSE
 *    transport). A client that does not accept SSE gets a JSON array.
 *  - Batches are refused on revisions that do not define them.
 */
export async function serveLegacyMcpHttp(
  parsed: unknown,
  route: { version: string },
  service: McpToolService,
  identity: LegacyServerIdentity,
  res: HttpResponseLike,
  accept?: string,
): Promise<void> {
  const options = { supportedVersions: NATIVE_LEGACY_MCP_PROTOCOL_VERSIONS };
  if (!Array.isArray(parsed)) {
    const reply = await legacyMcpDispatch(parsed, service, identity, options);
    if (!service.isActive()) return;
    if (!reply) { res.writeHead(202, { "Cache-Control": "no-store" }); res.end(); return; }
    sendJson(res, "error" in reply && reply.error.code === -32600 ? 400 : 200, reply);
    return;
  }
  if (!BATCHING_MCP_PROTOCOL_VERSIONS.includes(route.version)) {
    sendJson(res, 400, rpcError(null, -32600, `Invalid Request: MCP ${route.version} does not support JSON-RPC batches; send one message per POST`));
    return;
  }
  if (parsed.length === 0) { sendJson(res, 400, rpcError(null, -32600, "Invalid Request: empty JSON-RPC batch")); return; }
  if (parsed.length > MAX_LEGACY_BATCH_MEMBERS) {
    sendJson(res, 400, rpcError(null, -32600, `Invalid Request: a batch may contain at most ${MAX_LEGACY_BATCH_MEMBERS} messages`));
    return;
  }
  if (!parsed.some(needsReply)) { res.writeHead(202, { "Cache-Control": "no-store" }); res.end(); return; }
  const sse = accept === undefined || accept.includes("text/event-stream") || accept.includes("*/*");
  if (sse) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    await legacyMcpBatch(parsed, service, identity, options, (reply) => {
      if (service.isActive()) res.write(`event: message\ndata: ${JSON.stringify(reply)}\n\n`);
    });
    if (service.isActive()) res.end();
    return;
  }
  const replies: JsonRpcResponse[] = [];
  await legacyMcpBatch(parsed, service, identity, options, (reply) => { replies.push(reply); });
  if (service.isActive()) sendJson(res, 200, replies);
}
