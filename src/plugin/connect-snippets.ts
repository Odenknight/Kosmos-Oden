/**
 * Personal Notes (0.9.0) — client connection snippets for "Connect my AI".
 *
 * Pure. Mirrors the blocks the Quick Connect settings tab copies. Kept in its
 * own file on purpose: do not refactor settings.ts to use it in 0.9.0, because
 * test/settings-ui.test.mjs asserts literal text in settings.ts.
 */
export interface ConnectSnippet {
  id: "claude-code" | "codex" | "stdio" | "universal";
  label: string;
  hint: string;
  text: string;
}

export function buildConnectSnippets(input: {
  /** For example http://127.0.0.1:4816 or http://192.168.1.20:4816. No trailing slash. */
  baseUrl: string;
  token: string;
  bridgePath: string;
  protocolVersion: string;
}): ConnectSnippet[] {
  const url = `${input.baseUrl.replace(/\/+$/, "")}/mcp`;
  const auth = `Bearer ${input.token}`;
  return [
    {
      id: "claude-code",
      label: "Claude Code",
      hint: "Paste this command in a terminal.",
      text: `claude mcp add --transport http --header "Authorization: ${auth}" kosmos-oden "${url}"`,
    },
    {
      id: "codex",
      label: "OpenAI Codex",
      hint: "Add this block to config.toml.",
      text: `[mcp_servers.kosmos-oden]\nurl = "${url}"\nhttp_headers = { Authorization = "${auth}" }\n`,
    },
    {
      id: "stdio",
      label: "Claude Desktop and other desktop apps",
      hint: "Add this to the app's MCP settings file. Needs Node.js installed. For an app on another device, copy kosmos-mcp-stdio.mjs to that device and correct the path.",
      text: JSON.stringify({ mcpServers: { "kosmos-oden": { command: "node", args: [input.bridgePath], env: { KOSMOS_MCP_URL: url, KOSMOS_MCP_TOKEN: input.token } } } }, null, 2),
    },
    {
      id: "universal",
      label: "Any other MCP client",
      hint: "Connection details for a client that supports MCP over HTTP.",
      text: JSON.stringify({ name: "kosmos-oden", transport: "streamable-http", url, headers: { Authorization: auth }, protocolVersion: input.protocolVersion }, null, 2),
    },
  ];
}
