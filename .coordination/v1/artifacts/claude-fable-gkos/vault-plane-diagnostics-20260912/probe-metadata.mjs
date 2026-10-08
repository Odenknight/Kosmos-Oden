/**
 * Metadata-plane probe of the live Kosmos server. Deliberately makes NO
 * vault-backed call: per carl seq 11 (Defect C) a hung vault read permanently
 * leaks a concurrency slot, so probing the data plane degrades the running
 * server. Everything here completes normally and releases its slot.
 *
 * Primary question: is the live process ALREADY degraded from earlier runs?
 * If the counters are exhausted these calls return 429 instead of 200.
 *
 * Token comes from the environment and is never printed or written.
 */
const ENDPOINT = process.env.KOSMOS_MCP_URL;
const TOKEN = process.env.KOSMOS_MCP_TOKEN;
if (!ENDPOINT || !TOKEN) { console.error("KOSMOS_MCP_URL and KOSMOS_MCP_TOKEN required"); process.exit(2); }
const BASE = new URL(ENDPOINT).origin;
const V = "2026-07-28";
const M = {
  pv: "io.modelcontextprotocol/protocolVersion",
  ci: "io.modelcontextprotocol/clientInfo",
  cc: "io.modelcontextprotocol/clientCapabilities",
};

const redact = (s) => String(s).split(TOKEN).join("[REDACTED]");

async function timed(label, fn) {
  const t0 = performance.now();
  try {
    const r = await fn();
    console.log(`${label.padEnd(34)} ${String(r.status).padEnd(4)} ${((performance.now() - t0) / 1000).toFixed(2)}s  ${r.note ?? ""}`);
    return r;
  } catch (e) {
    console.log(`${label.padEnd(34)} ERR  ${((performance.now() - t0) / 1000).toFixed(2)}s  ${redact(e.message)}`);
    return null;
  }
}

const get = (path) => timed(`GET ${path}`, async () => {
  const r = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await r.text();
  let note = "";
  if (r.status === 429) note = `THROTTLED: ${redact(text).slice(0, 160)}`;
  else if (path === "/") { try { const j = JSON.parse(text); note = `v${j.version} mcp.sessions=${j.mcp?.sessions} supported=${JSON.stringify(j.mcp?.supportedProtocolVersions)}`; } catch {} }
  else note = redact(text).slice(0, 110);
  return { status: r.status, note };
});

const rpc = (method, params = {}) => timed(`POST ${method}`, async () => {
  const body = { jsonrpc: "2.0", id: Math.floor(Math.random() * 1e6), method, params: { ...params, _meta: {
    [M.pv]: V, [M.ci]: { name: "claude-fable-gkos-probe", version: "1.0.0" }, [M.cc]: {},
  } } };
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json",
      Accept: "application/json", "MCP-Protocol-Version": V, "Mcp-Method": method,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await r.text();
  let note = "";
  try {
    const j = JSON.parse(text);
    if (j.error) note = `ERROR ${j.error.code}: ${redact(j.error.message).slice(0, 90)}`;
    else {
      const res = j.result ?? {};
      const bits = [`resultType=${res.resultType}`];
      bits.push(`cacheScope=${res.cacheScope ?? "ABSENT"}`, `ttlMs=${res.ttlMs ?? (res.ttlMs === 0 ? 0 : "ABSENT")}`);
      if (res.tools) bits.push(`tools=${res.tools.length}`);
      if (res.supportedVersions) bits.push(`supported=${JSON.stringify(res.supportedVersions)}`);
      note = bits.join(" ");
    }
  } catch { note = redact(text).slice(0, 110); }
  return { status: r.status, note };
});

console.log(`target ${BASE}  (metadata plane only — no vault-backed call)\n`);
await get("/health");
await get("/");
await rpc("server/discover");
await rpc("tools/list");
// carl seq 10: `ping` was removed in 2026-07-28 but we still implement it.
await rpc("ping");
// carl seq 10: server/discover is stamped with cache fields the spec does not list.
console.log("\n(no vault-backed endpoint was called, so no concurrency slot was leaked)");
