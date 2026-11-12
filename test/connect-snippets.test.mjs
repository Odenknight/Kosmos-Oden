import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const out = await build({ entryPoints: ["src/plugin/connect-snippets.ts"], bundle: true, platform: "neutral", format: "esm", write: false });
const m = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
const { connectionConfig, healthCheckCommand, resolveBaseUrl, shellQuote, tomlString, CONNECT_TEMPLATES } = m;

const TOKEN = "a".repeat(64);
const base = { port: 4816, token: TOKEN, agentOs: "posix" };
const LOCAL_BRIDGE = "/home/me/vault/.obsidian/plugins/kosmos-oden/kosmos-mcp-stdio.mjs";
const REMOTE_BRIDGE = "/opt/kosmos/kosmos-mcp-stdio.mjs";

/** Minimal TOML reader for the generated shape: section header, key = string | [strings] | { k = string, ... }. */
function parseToml(text) {
  const out = {};
  let table = out;
  const str = (s) => JSON.parse(s.replace(/\\u007F/g, "\\u007f"));
  for (const line of text.split("\n").filter(Boolean)) {
    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) { table = header[1].split(".").reduce((t, k) => (t[k] ??= {}), out); continue; }
    const [, key, value] = line.match(/^([A-Za-z0-9_-]+) = (.*)$/);
    if (value.startsWith("[")) table[key] = JSON.parse(value);
    else if (value.startsWith("{")) table[key] = Object.fromEntries([...value.matchAll(/([A-Za-z0-9_]+) = ("(?:[^"\\]|\\.)*")/g)].map(([, k, v]) => [k, str(v)]));
    else table[key] = str(value);
  }
  return out;
}

/** POSIX sh word splitting for single-quoted/bare words (what shellQuote emits). */
function shWords(cmd) {
  const words = [];
  let cur = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === " ") { if (cur !== null) words.push(cur); cur = null; continue; }
    cur ??= "";
    if (c === "'") { const end = cmd.indexOf("'", i + 1); cur += cmd.slice(i + 1, end); i = end; }
    else if (c === "\\") { cur += cmd[++i]; }
    else cur += c;
  }
  if (cur !== null) words.push(cur);
  return words;
}

/** PowerShell single-quoted word splitting ('' is a literal quote). */
function psWords(cmd) {
  const words = [];
  let cur = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === " ") { if (cur !== null) words.push(cur); cur = null; continue; }
    cur ??= "";
    if (c === "'") {
      i++;
      for (; i < cmd.length; i++) {
        if (cmd[i] === "'" && cmd[i + 1] === "'") { cur += "'"; i++; }
        else if (cmd[i] === "'") break;
        else cur += cmd[i];
      }
    } else cur += c;
  }
  if (cur !== null) words.push(cur);
  return words;
}

test("every template x target x transport produces parseable text with the endpoint and no token in a URL", () => {
  for (const target of ["this-computer", "another-computer"]) {
    for (const transport of ["http", "stdio"]) {
      for (const { id: template } of CONNECT_TEMPLATES) {
        const r = connectionConfig({ ...base, target, transport, template, advertisedBaseUrl: "192.0.2.10", bridgePath: target === "this-computer" ? LOCAL_BRIDGE : REMOTE_BRIDGE, protocols: ["2026-07-28"] });
        assert.equal(r.ok, true, `${target}/${transport}/${template}: ${r.error}`);
        const expected = target === "this-computer" ? "http://127.0.0.1:4816/mcp" : "http://192.0.2.10:4816/mcp";
        assert.equal(r.endpoint, expected);
        assert.ok(r.text.includes(expected), `${template} names the endpoint`);
        assert.ok(r.text.includes(TOKEN), "the token is carried in a header or env");
        for (const url of r.text.match(/https?:\/\/[^\s"']+/g) ?? []) assert.ok(!url.includes(TOKEN), `token leaked into URL ${url}`);
        if (template === "claude-code-json" || template === "generic") JSON.parse(r.text);
        if (template === "codex") parseToml(r.text);
      }
    }
  }
});

test("HTTP templates carry the bearer header; stdio templates point KOSMOS_MCP_URL at the endpoint", () => {
  const http = (template) => connectionConfig({ ...base, target: "this-computer", transport: "http", template });
  assert.deepEqual(JSON.parse(http("claude-code-json").text), { mcpServers: { "kosmos-oden": { type: "http", url: "http://127.0.0.1:4816/mcp", headers: { Authorization: `Bearer ${TOKEN}` } } } });
  assert.deepEqual(parseToml(http("codex").text), { mcp_servers: { "kosmos-oden": { url: "http://127.0.0.1:4816/mcp", http_headers: { Authorization: `Bearer ${TOKEN}` } } } });
  assert.deepEqual(shWords(http("claude-code-command").text), ["claude", "mcp", "add", "--transport", "http", "kosmos-oden", "http://127.0.0.1:4816/mcp", "--header", `Authorization: Bearer ${TOKEN}`]);
  const generic = JSON.parse(connectionConfig({ ...base, target: "this-computer", transport: "http", template: "generic", protocols: ["2026-07-28", "2025-03-26"] }).text);
  assert.deepEqual(generic.protocolVersions, ["2026-07-28", "2025-03-26"]);

  const stdio = (template) => connectionConfig({ ...base, target: "another-computer", advertisedBaseUrl: "nas.example.lan", transport: "stdio", template, bridgePath: REMOTE_BRIDGE });
  const env = { KOSMOS_MCP_URL: "http://nas.example.lan:4816/mcp", KOSMOS_MCP_TOKEN: TOKEN };
  assert.deepEqual(JSON.parse(stdio("generic").text), { mcpServers: { "kosmos-oden": { command: "node", args: [REMOTE_BRIDGE], env } } });
  assert.deepEqual(JSON.parse(stdio("claude-code-json").text).mcpServers["kosmos-oden"], { type: "stdio", command: "node", args: [REMOTE_BRIDGE], env });
  assert.deepEqual(parseToml(stdio("codex").text).mcp_servers["kosmos-oden"], { command: "node", args: [REMOTE_BRIDGE], env });
  assert.deepEqual(shWords(stdio("claude-code-command").text), ["claude", "mcp", "add", "--transport", "stdio", "--env", `KOSMOS_MCP_URL=${env.KOSMOS_MCP_URL}`, "--env", `KOSMOS_MCP_TOKEN=${TOKEN}`, "kosmos-oden", "--", "node", REMOTE_BRIDGE]);
  assert.match(stdio("generic").hint, /Node\.js and kosmos-mcp-stdio\.mjs must be on the assistant's computer/);
});

test("encoding survives quotes, backslashes, spaces, $ and backticks in every format", () => {
  const nasty = "/srv/my notes/it's \"$HOME\" `x` \\ dir/kosmos-mcp-stdio.mjs";
  const posix = (template) => connectionConfig({ ...base, target: "another-computer", advertisedBaseUrl: "192.0.2.10", transport: "stdio", template, bridgePath: nasty });
  assert.deepEqual(JSON.parse(posix("generic").text).mcpServers["kosmos-oden"].args, [nasty]);
  assert.deepEqual(parseToml(posix("codex").text).mcp_servers["kosmos-oden"].args, [nasty]);
  // POSIX: the path round-trips as the last shell word exactly ($ and backticks only inside single quotes).
  assert.equal(shWords(posix("claude-code-command").text).at(-1), nasty);

  const winPath = "C:\\Users\\Ann O'Neil\\kosmos $x\\kosmos-mcp-stdio.mjs";
  const win = (template) => connectionConfig({ ...base, agentOs: "windows", target: "another-computer", advertisedBaseUrl: "192.0.2.10", transport: "stdio", template, bridgePath: winPath });
  assert.deepEqual(JSON.parse(win("generic").text).mcpServers["kosmos-oden"].args, [winPath]);
  assert.deepEqual(parseToml(win("codex").text).mcp_servers["kosmos-oden"].args, [winPath]);
  const words = psWords(win("claude-code-command").text);
  assert.equal(words.at(-1), winPath);
  assert.ok(words.includes("--"), "PowerShell keeps the -- separator as a quoted argument");

  assert.equal(shellQuote("it's", "posix"), `'it'\\''s'`);
  assert.equal(shellQuote("it's", "windows"), `'it''s'`);
  assert.equal(shellQuote("plain-token_123", "posix"), "plain-token_123");
  assert.equal(tomlString("a\"b\\c\u007f"), `"a\\"b\\\\c\\u007F"`);
});

test("addresses: 0.0.0.0 and loopback are refused for another computer; tokens never in URLs", () => {
  for (const bad of ["0.0.0.0", "http://0.0.0.0:4816", "[::]", "http://[::]:4816"]) {
    const r = resolveBaseUrl("another-computer", bad, 4816);
    assert.equal(r.ok, false, bad);
    assert.match(r.error, /0\.0\.0\.0/);
  }
  for (const loop of ["127.0.0.1", "localhost", "http://127.0.0.2:4816", "[::1]", "app.localhost"]) {
    const r = resolveBaseUrl("another-computer", loop, 4816);
    assert.equal(r.ok, false, loop);
    assert.match(r.error, /assistant's own computer/);
  }
  for (const leaky of ["http://user:pw@192.0.2.10", `http://192.0.2.10/?token=${TOKEN}`, "http://192.0.2.10/#k"]) {
    assert.equal(resolveBaseUrl("another-computer", leaky, 4816).ok, false, leaky);
  }
  assert.equal(resolveBaseUrl("another-computer", "", 4816).ok, false);
  assert.equal(resolveBaseUrl("another-computer", "ftp://192.0.2.10", 4816).ok, false);
  assert.equal(resolveBaseUrl("another-computer", "192.0.2.10 extra", 4816).ok, false);
  for (const port of [0, 70000, 1.5, NaN]) assert.equal(resolveBaseUrl("this-computer", "", port).ok, false, String(port));

  assert.deepEqual(resolveBaseUrl("this-computer", "192.0.2.10", 4816), { ok: true, baseUrl: "http://127.0.0.1:4816" }, "this computer always uses loopback");
  assert.deepEqual(resolveBaseUrl("another-computer", "192.0.2.10", 4816), { ok: true, baseUrl: "http://192.0.2.10:4816" });
  assert.deepEqual(resolveBaseUrl("another-computer", "http://192.0.2.10:9000/", 4816), { ok: true, baseUrl: "http://192.0.2.10:9000" });
  assert.deepEqual(resolveBaseUrl("another-computer", "https://notes.example.org/kosmos/", 4816), { ok: true, baseUrl: "https://notes.example.org/kosmos" }, "HTTPS reverse proxy keeps its own port and path");
  assert.deepEqual(resolveBaseUrl("another-computer", "[2001:db8::10]", 4816), { ok: true, baseUrl: "http://[2001:db8::10]:4816" });

  const r = connectionConfig({ ...base, target: "another-computer", advertisedBaseUrl: "0.0.0.0", transport: "http", template: "generic" });
  assert.equal(r.ok, false);
  assert.equal(connectionConfig({ ...base, token: "", target: "this-computer", transport: "http", template: "generic" }).ok, false, "no key yet");
  assert.equal(connectionConfig({ ...base, token: "a b", target: "this-computer", transport: "http", template: "generic" }).ok, false);
});

test("remote stdio requires the bridge path on the agent machine, in that machine's style", () => {
  const remote = (bridgePath, agentOs = "posix") => connectionConfig({ ...base, agentOs, target: "another-computer", advertisedBaseUrl: "192.0.2.10", transport: "stdio", template: "generic", bridgePath });
  assert.match(remote("").error, /full path of kosmos-mcp-stdio\.mjs/);
  assert.match(remote("C:/Users/me/vault/.obsidian/plugins/kosmos-oden/kosmos-mcp-stdio.mjs").error, /Windows path/, "a Windows Obsidian path is not a Linux bridge path");
  assert.match(remote("C:\\kosmos\\kosmos-mcp-stdio.mjs").error, /Windows path/);
  assert.match(remote("~/kosmos/kosmos-mcp-stdio.mjs").error, /full path/);
  assert.match(remote("/opt/kosmos/kosmos-mcp-stdio.mjs", "windows").error, /full Windows path/);
  assert.equal(remote("C:\\kosmos\\kosmos-mcp-stdio.mjs", "windows").ok, true);
  assert.equal(remote(REMOTE_BRIDGE).ok, true);
});

test("health check is header-authenticated and quoted for the agent's shell", () => {
  const posix = healthCheckCommand({ target: "another-computer", advertisedBaseUrl: "192.0.2.10", port: 4816, token: TOKEN, agentOs: "posix" });
  assert.deepEqual(shWords(posix.text), ["curl", "-H", `Authorization: Bearer ${TOKEN}`, "http://192.0.2.10:4816/health"]);
  const win = healthCheckCommand({ target: "this-computer", port: 4816, token: TOKEN, agentOs: "windows" });
  assert.deepEqual(psWords(win.text), ["curl.exe", "-H", `Authorization: Bearer ${TOKEN}`, "http://127.0.0.1:4816/health"]);
});
