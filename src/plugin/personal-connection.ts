/**
 * Personal Notes (0.9.0) — connection readiness and the real connection test.
 *
 * `waitForListener` resolves on the listener's actual `listening` or `error`
 * event (no fixed sleep). `testPersonalConnection` performs a real HTTP
 * exchange from this computer: authenticated modern MCP opening
 * (`server/discover` with per-request metadata), `tools/list`, then
 * `search_notes` and `get_note` on a canary note. It proves the server,
 * token and protocol on this computer; it says nothing about another
 * machine's route or firewall.
 */
import type { ConnectionTestResult, ConnectionTestStep } from "../personal-notes/plugin-host";
import { KOSMOS_VERSION } from "../kosmos-version";
import { MCP_META_CLIENT_CAPABILITIES, MCP_META_CLIENT_INFO, MCP_META_PROTOCOL_VERSION, MODERN_MCP_PROTOCOL_VERSION } from "./mcp-compat";

/** Minimal Node http server surface. */
interface ListenerLike {
  listening?: boolean;
  once(event: "listening" | "error", fn: (...args: unknown[]) => void): unknown;
  removeListener(event: "listening" | "error", fn: (...args: unknown[]) => void): unknown;
}

/** Resolve once `server` is listening or has failed. A null server (start refused) resolves at once. */
export function waitForListener(server: ListenerLike | null): Promise<void> {
  if (!server || server.listening) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { server.removeListener("listening", done); server.removeListener("error", done); resolve(); };
    server.once("listening", done);
    server.once("error", done);
  });
}

/** Minimal Node http/https module surface. */
export interface HttpModule {
  request(url: URL, options: Record<string, unknown>, callback: (res: any) => void): any;
}

interface Reply { status: number; body: any }

const TIMEOUT_MS = 10_000;

function post(mod: HttpModule, url: URL, headers: Record<string, string>, body: unknown): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const text = JSON.stringify(body);
    const req = mod.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Content-Length": String(Buffer.byteLength(text)), ...headers },
      timeout: TIMEOUT_MS,
    }, (res: any) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => { data += chunk; });
      res.on("end", () => {
        let parsed: any = null;
        try {
          if (String(res.headers?.["content-type"] || "").includes("text/event-stream")) {
            const events = data.split(/\r?\n\r?\n/).map((block) => block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n")).filter(Boolean);
            parsed = events.length ? JSON.parse(events[events.length - 1]) : null;
          } else parsed = data ? JSON.parse(data) : null;
        } catch { parsed = null; }
        resolve({ status: res.statusCode, body: parsed });
      });
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error(`no answer within ${TIMEOUT_MS / 1000} s`)));
    req.on("error", reject);
    req.end(text);
  });
}

export interface ConnectionTestInput {
  /** Node `http`, and `https` for https:// base URLs. null on mobile. */
  http: HttpModule | null;
  https?: HttpModule | null;
  baseUrl: string;
  token: string;
  /** The note to search for and read; null when nothing is shared. */
  canary: { path: string; title: string } | null;
}

/** Terms that should find the canary: words of its title, else of its file name. */
function canaryQuery(canary: { path: string; title: string }): string {
  const words = (s: string) => s.match(/[\p{L}\p{N}]+/gu) ?? [];
  const terms = words(canary.title).length ? words(canary.title) : words(canary.path.slice(canary.path.lastIndexOf("/") + 1).replace(/\.md$/i, ""));
  return terms.slice(0, 8).join(" ");
}

export async function testPersonalConnection(input: ConnectionTestInput): Promise<ConnectionTestResult> {
  const steps: ConnectionTestStep[] = [];
  const result: ConnectionTestResult = { ok: false, baseUrl: input.baseUrl, transport: "streamable-http", steps };
  const fail = (name: ConnectionTestStep["name"], detail: string) => { steps.push({ name, ok: false, detail }); return result; };
  const pass = (name: ConnectionTestStep["name"], detail: string) => { steps.push({ name, ok: true, detail }); };

  let endpoint: URL;
  try {
    const base = new URL(input.baseUrl);
    if (base.protocol !== "http:" && base.protocol !== "https:") throw new Error("not http");
    if (base.username || base.password || base.search) throw new Error("credentials or query");
    endpoint = new URL(`${base.pathname.replace(/\/+$/, "")}/mcp`, base);
  } catch {
    return fail("authenticate", "The address is not a valid http:// or https:// base URL without credentials or query.");
  }
  const mod = endpoint.protocol === "https:" ? input.https ?? null : input.http;
  if (!mod) return fail("authenticate", "The connection test needs desktop Obsidian.");
  if (!input.token) return fail("authenticate", "No token exists on this device yet. Connect first.");

  let nextId = 1;
  const meta = { [MCP_META_PROTOCOL_VERSION]: MODERN_MCP_PROTOCOL_VERSION, [MCP_META_CLIENT_INFO]: { name: "Kosmos-Oden connection test", version: KOSMOS_VERSION }, [MCP_META_CLIENT_CAPABILITIES]: {} };
  const send = (method: string, params: Record<string, unknown> = {}) => post(mod, endpoint, {
    Authorization: `Bearer ${input.token}`,
    "MCP-Protocol-Version": MODERN_MCP_PROTOCOL_VERSION,
    "Mcp-Method": method,
    ...(method === "tools/call" ? { "Mcp-Name": String(params.name) } : {}),
  }, { jsonrpc: "2.0", id: nextId++, method, params: { ...params, _meta: meta } });
  /** A tool call's JSON value, or a plain-language failure (`error` set). */
  const toolResult = (reply: Reply): { value: any; error: string | null } => {
    const r = reply.body?.result;
    if (reply.status !== 200 || !r) return { value: null, error: `HTTP ${reply.status}${reply.body?.error?.message ? `: ${reply.body.error.message}` : ""}` };
    let value = r.structuredContent;
    if (value === undefined) { try { value = JSON.parse(r.content?.[0]?.text ?? "null"); } catch { value = null; } }
    if (r.isError) return { value, error: `the tool answered with an error: ${value?.error ?? "unknown"}` };
    return { value, error: null };
  };

  let discover: Reply;
  try { discover = await send("server/discover"); } catch (error: any) {
    return fail("authenticate", `Could not reach ${endpoint.origin}: ${String(error?.code || error?.message || error)}`);
  }
  if (discover.status === 401) return fail("authenticate", "The server refused the token (HTTP 401).");
  if (discover.status === 403) return fail("authenticate", "The server refused this host or origin (HTTP 403).");
  pass("authenticate", `Token accepted by ${endpoint.origin}.`);
  if (discover.status !== 200 || !discover.body?.result) return fail("open", `server/discover failed: HTTP ${discover.status}${discover.body?.error?.message ? ` (${discover.body.error.message})` : ""}.`);
  result.protocolVersion = MODERN_MCP_PROTOCOL_VERSION;
  pass("open", `server/discover answered over Streamable HTTP, MCP ${MODERN_MCP_PROTOCOL_VERSION}.`);

  let names: string[];
  try {
    const list = await send("tools/list");
    names = Array.isArray(list.body?.result?.tools) ? list.body.result.tools.map((t: any) => t?.name) : [];
    if (list.status !== 200 || !names.includes("search_notes") || !names.includes("get_note")) return fail("list_tools", `tools/list did not offer search_notes and get_note (HTTP ${list.status}).`);
  } catch (error: any) { return fail("list_tools", `tools/list failed: ${String(error?.message || error)}`); }
  pass("list_tools", `${names.length} tools: ${names.join(", ")}.`);

  const canary = input.canary;
  if (!canary) return fail("search", "No note is shared with agents yet, so there is nothing to search for.");
  const query = canaryQuery(canary);
  if (!query) return fail("search", `The test note ${canary.path} has no searchable words in its title or name; choose another note.`);
  try {
    const found = toolResult(await send("tools/call", { name: "search_notes", arguments: { query, limit: 100 } }));
    if (found.error) return fail("search", `search_notes failed: ${found.error}.`);
    if (!Array.isArray(found.value?.results) || !found.value.results.some((r: any) => r?.path === canary.path)) return fail("search", `search_notes ran but did not return ${canary.path}.`);
  } catch (error: any) { return fail("search", `search_notes failed: ${String(error?.message || error)}`); }
  pass("search", `search_notes found ${canary.path}.`);

  try {
    const read = toolResult(await send("tools/call", { name: "get_note", arguments: { path: canary.path, limit_chars: 2000 } }));
    if (read.error) return fail("read", `get_note failed: ${read.error}.`);
    if (typeof read.value?.content_hash !== "string" || typeof read.value?.content !== "string") return fail("read", "get_note did not return note text and a content hash.");
    pass("read", `get_note read ${canary.path} (${read.value.total_chars} characters).`);
  } catch (error: any) { return fail("read", `get_note failed: ${String(error?.message || error)}`); }

  result.ok = steps.every((s) => s.ok);
  return result;
}
