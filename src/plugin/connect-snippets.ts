/**
 * Quick Connect configuration — the one source of client connection text.
 *
 * Pure (no Obsidian, no Node). Used by the settings tab (existing profile),
 * the Connect window (Personal Notes) and the Agent API guide, so the
 * address, encoding and refusal rules are identical everywhere.
 *
 * Rules kept here:
 * - The token goes in a header or an environment variable, never in a URL.
 * - 0.0.0.0 / :: are bind addresses, not addresses a client can use.
 * - A client on another computer can never use this computer's loopback.
 * - For another computer over stdio, the bridge path is the path ON THAT
 *   computer (typed by the user); this computer's path is never reused.
 * - JSON, TOML and shell text are encoded for their format, so quotes,
 *   backslashes, spaces, "$" and backticks survive a paste.
 */

export const MCP_SERVER_NAME = "kosmos-oden";
export const BRIDGE_FILE_NAME = "kosmos-mcp-stdio.mjs";

export type ConnectTarget = "this-computer" | "another-computer";
export type ConnectTransport = "http" | "stdio";
export type ConnectTemplate = "claude-code-command" | "claude-code-json" | "codex" | "generic";
/** Operating system of the computer the assistant runs on (decides shell quoting and path style). */
export type AgentOs = "windows" | "posix";

export interface ConnectConfigInput {
  target: ConnectTarget;
  transport: ConnectTransport;
  /**
   * Address of the Obsidian computer as the assistant's computer reaches it:
   * an IP, a hostname or a URL (`http://192.0.2.10`, `https://notes.example.org/kosmos`).
   * Required for "another-computer"; "this-computer" always uses 127.0.0.1.
   */
  advertisedBaseUrl?: string;
  /** Agent API port, used when the address has no explicit port (plain http only). */
  port: number;
  token: string;
  /** Absolute path of kosmos-mcp-stdio.mjs on the assistant's computer. Required for stdio. */
  bridgePath?: string;
  agentOs: AgentOs;
  template: ConnectTemplate;
  /** Revisions the chosen transport advertises (shown by the generic template). */
  protocols?: readonly string[];
}

export type ConnectConfigResult =
  | { ok: true; endpoint: string; label: string; hint: string; text: string }
  | { ok: false; error: string };

export const CONNECT_TEMPLATES: readonly { id: ConnectTemplate; label: string }[] = [
  { id: "claude-code-command", label: "Claude Code (command)" },
  { id: "claude-code-json", label: "Claude Code (.mcp.json)" },
  { id: "codex", label: "OpenAI Codex (config.toml)" },
  { id: "generic", label: "Other MCP clients" },
];

// eslint-disable-next-line no-control-regex
const UNSAFE_TEXT = /[\u0000-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || /^127(?:\.\d{1,3}){3}$/.test(h) || h === "0:0:0:0:0:0:0:1";
}

function isWildcardHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "");
  return h === "0.0.0.0" || h === "::" || h === "0:0:0:0:0:0:0:0";
}

/**
 * Validate and normalize the address an assistant will use. Returns the base
 * URL without a trailing slash (`http://192.0.2.10:4816`) or an error.
 */
export function resolveBaseUrl(target: ConnectTarget, advertised: string | undefined, port: number):
  { ok: true; baseUrl: string } | { ok: false; error: string } {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, error: "The port must be a whole number from 1 to 65535." };
  if (target === "this-computer") return { ok: true, baseUrl: `http://127.0.0.1:${port}` };
  const raw = (advertised ?? "").trim();
  if (!raw) return { ok: false, error: "Choose or type the address of this computer as the other computer sees it." };
  if (UNSAFE_TEXT.test(raw) || /\s/.test(raw)) return { ok: false, error: "The address contains spaces or control characters." };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`);
  } catch {
    return { ok: false, error: "That is not a valid address. Use an IP address, a host name or an http(s) URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: "The address must start with http:// or https://." };
  if (url.username || url.password) return { ok: false, error: "Do not put a user name, password or key in the address. The key is sent separately." };
  if (url.search || url.hash || raw.includes("?") || raw.includes("#")) return { ok: false, error: "Do not put a query (?…) or fragment (#…) in the address. The key is never part of a URL." };
  if (!url.hostname) return { ok: false, error: "The address has no host name." };
  if (isWildcardHost(url.hostname)) return { ok: false, error: "0.0.0.0 is where a server listens, not an address another computer can connect to. Choose this computer's network or VPN address." };
  if (isLoopbackHost(url.hostname)) return { ok: false, error: "127.0.0.1 and localhost always mean the assistant's own computer. Choose this computer's network or VPN address." };
  const explicitPort = url.port ? Number(url.port) : null;
  const usePort = explicitPort ?? (url.protocol === "http:" ? port : null);
  const host = url.hostname.includes(":") && !url.hostname.startsWith("[") ? `[${url.hostname}]` : url.hostname;
  const path = url.pathname.replace(/\/+$/, "");
  return { ok: true, baseUrl: `${url.protocol}//${host}${usePort ? `:${usePort}` : ""}${path}` };
}

/** Quote one argument for the assistant computer's shell (POSIX sh or PowerShell). */
export function shellQuote(value: string, os: AgentOs): string {
  if (os === "windows") return `'${value.replace(/'/g, "''")}'`;
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

/** TOML basic string. Inputs are validated free of control characters first. */
export function tomlString(value: string): string {
  return JSON.stringify(value).replace(/\u007f/g, "\\u007F");
}

function bridgePathProblem(path: string, os: AgentOs): string | null {
  if (!path.trim()) return `Enter the full path of ${BRIDGE_FILE_NAME} on the assistant's computer.`;
  if (UNSAFE_TEXT.test(path)) return "The bridge path contains control characters.";
  if (os === "posix") {
    if (/^[A-Za-z]:/.test(path) || path.startsWith("\\")) {
      return "That is a Windows path. On a Linux or macOS computer the path looks like /home/me/kosmos/kosmos-mcp-stdio.mjs.";
    }
    if (!path.startsWith("/")) return "Use the full path starting with / (a ~ is not expanded by MCP clients).";
  } else if (!/^[A-Za-z]:[\\/]/.test(path) && !path.startsWith("\\\\")) {
    return "Use the full Windows path, for example C:\\Users\\me\\kosmos\\kosmos-mcp-stdio.mjs.";
  }
  return null;
}

/**
 * Build the configuration text for one client template. Never throws; an
 * invalid input returns `{ ok: false, error }` with a plain-language reason.
 */
export function connectionConfig(input: ConnectConfigInput): ConnectConfigResult {
  const base = resolveBaseUrl(input.target, input.advertisedBaseUrl, input.port);
  if ("error" in base) return base;
  const token =typeof input.token === "string" ? input.token : "";
  if (!token) return { ok: false, error: "There is no access key yet. Connect first to create one." };
  if (UNSAFE_TEXT.test(token) || /\s/.test(token)) return { ok: false, error: "The access key contains spaces or control characters; rotate it." };
  const endpoint = `${base.baseUrl}/mcp`;
  const auth = `Bearer ${token}`;
  const os = input.agentOs === "windows" ? "windows" : "posix";
  const q = (v: string) => shellQuote(v, os);
  const remote = input.target === "another-computer";

  if (input.transport === "stdio") {
    const bridge = input.bridgePath ?? "";
    const problem = bridgePathProblem(bridge, os);
    if (problem) return { ok: false, error: problem };
    const env = { KOSMOS_MCP_URL: endpoint, KOSMOS_MCP_TOKEN: token };
    const where = remote
      ? `Node.js and ${BRIDGE_FILE_NAME} must be on the assistant's computer at this path; the bridge connects back to ${endpoint}.`
      : "Needs Node.js on this computer.";
    switch (input.template) {
      case "claude-code-command": {
        const sep = os === "windows" ? "'--'" : "--";
        return { ok: true, endpoint, label: "Claude Code (command, stdio bridge)", hint: `Run in a terminal on the assistant's computer. ${where}`,
          text: `claude mcp add --transport stdio --env ${q(`KOSMOS_MCP_URL=${endpoint}`)} --env ${q(`KOSMOS_MCP_TOKEN=${token}`)} ${MCP_SERVER_NAME} ${sep} node ${q(bridge)}` };
      }
      case "claude-code-json":
        return { ok: true, endpoint, label: "Claude Code (.mcp.json, stdio bridge)", hint: `Save as .mcp.json in the project folder. ${where}`,
          text: JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { type: "stdio", command: "node", args: [bridge], env } } }, null, 2) };
      case "codex":
        return { ok: true, endpoint, label: "OpenAI Codex (config.toml, stdio bridge)", hint: `Add to ~/.codex/config.toml, then restart Codex. ${where}`,
          text: `[mcp_servers.${MCP_SERVER_NAME}]\ncommand = "node"\nargs = [${tomlString(bridge)}]\nenv = { KOSMOS_MCP_URL = ${tomlString(endpoint)}, KOSMOS_MCP_TOKEN = ${tomlString(token)} }\n` };
      case "generic":
        return { ok: true, endpoint, label: "Claude Desktop and other stdio clients", hint: `Add to the app's MCP settings file and restart it. ${where}`,
          text: JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { command: "node", args: [bridge], env } } }, null, 2) };
    }
  } else {
    switch (input.template) {
      case "claude-code-command":
        return { ok: true, endpoint, label: "Claude Code (command)", hint: "Run in a terminal on the assistant's computer.",
          text: `claude mcp add --transport http ${MCP_SERVER_NAME} ${q(endpoint)} --header ${q(`Authorization: ${auth}`)}` };
      case "claude-code-json":
        return { ok: true, endpoint, label: "Claude Code (.mcp.json)", hint: "Save as .mcp.json in the project folder where you run claude.",
          text: JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { type: "http", url: endpoint, headers: { Authorization: auth } } } }, null, 2) };
      case "codex":
        return { ok: true, endpoint, label: "OpenAI Codex (config.toml)", hint: "Add to ~/.codex/config.toml, then restart Codex.",
          text: `[mcp_servers.${MCP_SERVER_NAME}]\nurl = ${tomlString(endpoint)}\nhttp_headers = { Authorization = ${tomlString(auth)} }\n` };
      case "generic":
        return { ok: true, endpoint, label: "Other MCP clients (Streamable HTTP)", hint: "For a client that supports MCP over HTTP with a custom header. Hosted web or cloud assistants cannot reach an address that only exists on your computer or home network.",
          text: JSON.stringify({ name: MCP_SERVER_NAME, transport: "streamable-http", url: endpoint, headers: { Authorization: auth }, ...(input.protocols?.length ? { protocolVersions: [...input.protocols] } : {}) }, null, 2) };
    }
  }
  return { ok: false, error: "Unknown client template." };
}

/** A health check the user can run on the assistant's computer. */
export function healthCheckCommand(input: Pick<ConnectConfigInput, "target" | "advertisedBaseUrl" | "port" | "token" | "agentOs">): ConnectConfigResult {
  const base = resolveBaseUrl(input.target, input.advertisedBaseUrl, input.port);
  if ("error" in base) return base;
  if (!input.token || UNSAFE_TEXT.test(input.token) || /\s/.test(input.token)) return { ok: false, error: "There is no usable access key yet." };
  const os = input.agentOs === "windows" ? "windows" : "posix";
  const curl = os === "windows" ? "curl.exe" : "curl";
  return { ok: true, endpoint: `${base.baseUrl}/health`, label: "HTTP health check", hint: "Run on the assistant's computer. A JSON reply means the address, port and key work.",
    text: `${curl} -H ${shellQuote(`Authorization: Bearer ${input.token}`, os)} ${shellQuote(`${base.baseUrl}/health`, os)}` };
}
