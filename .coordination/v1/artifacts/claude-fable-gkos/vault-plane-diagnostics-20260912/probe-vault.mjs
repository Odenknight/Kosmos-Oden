/** Two vault-backed reads, back to back. Hypothesis: the FIRST completes in
 *  ~5-6s (one cold rebuild, matching the 5.30s measured locally and JEFFREY's
 *  5.5s), the SECOND dies at ~30s because every request re-triggers a full
 *  rebuild and they serialise past the socket timeout.
 *  Client timeout 45s > server's 30s, so a server kill is distinguishable. */
const BASE = new URL(process.env.KOSMOS_MCP_URL).origin;
const TOKEN = process.env.KOSMOS_MCP_TOKEN;
async function call(n, path) {
  const t0 = performance.now();
  try {
    const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(45_000) });
    const body = await r.text();
    console.log(`#${n} GET ${path.padEnd(12)} HTTP ${r.status}  ${((performance.now()-t0)/1000).toFixed(2)}s  ${body.length} bytes`);
  } catch (e) {
    console.log(`#${n} GET ${path.padEnd(12)} FAILED    ${((performance.now()-t0)/1000).toFixed(2)}s  ${e.cause?.code ?? e.name}: ${e.message.slice(0,70)}`);
  }
}
await call(1, "/overview");
await call(2, "/overview");
console.log("\n/health after both:");
await call(3, "/health");
