/** Does the rebuild EVER finish?
 *  A request dies at the 30s socket timeout, but the rebuild promise keeps
 *  running server-side. If the rebuild merely takes longer than 30s but does
 *  complete, then after a quiet wait the graph is cached and a later call
 *  returns FAST. If it never completes, every later call still dies at 30s.
 *  This separates "far too slow" from "never settles" (Defect D). */
const BASE = new URL(process.env.KOSMOS_MCP_URL).origin;
const AUTH = { Authorization: `Bearer ${process.env.KOSMOS_MCP_TOKEN}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hit(label) {
  const t0 = performance.now();
  try {
    const r = await fetch(BASE + "/overview", { headers: AUTH, signal: AbortSignal.timeout(45_000) });
    const b = await r.text();
    const s = (performance.now() - t0) / 1000;
    console.log(`${label.padEnd(30)} HTTP ${r.status}  ${s.toFixed(2).padStart(6)}s  ${b.length} bytes`);
    return { ok: true, secs: s };
  } catch (e) {
    const s = (performance.now() - t0) / 1000;
    console.log(`${label.padEnd(30)} FAIL      ${s.toFixed(2).padStart(6)}s  ${e.cause?.code ?? e.name}`);
    return { ok: false, secs: s };
  }
}

console.log("trigger a rebuild, then wait and retry — is it slow, or stuck?\n");
await hit("t=0    trigger");
for (const wait of [150, 150]) {
  console.log(`   ...quiet for ${wait}s (rebuild continues server-side)...`);
  await sleep(wait * 1000);
  const r = await hit(`after +${wait}s quiet`);
  if (r.ok) {
    console.log(`\nCOMPLETES. The rebuild finished during the quiet period, so the`);
    console.log(`defect is DURATION (rebuild >> 30s socket timeout), not a promise`);
    console.log(`that never settles. Every request that triggers a full rebuild dies,`);
    console.log(`but the work does eventually land.`);
    process.exit(0);
  }
}
console.log(`\nSTILL DEAD after 300s of quiet. A rebuild that merely took 60-120s`);
console.log(`would have completed and cached by now. Consistent with a promise that`);
console.log(`never settles (Defect D) — or a rebuild far slower than 300s.`);
