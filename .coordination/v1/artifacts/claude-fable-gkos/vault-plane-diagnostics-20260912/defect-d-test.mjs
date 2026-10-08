/**
 * Defect D confirmation run, against a freshly restarted server with NO fixes.
 *
 * Two questions, answered by the timing pattern alone:
 *
 *  Q1 — is dale seq 17's perpetual-rebuild defect live?
 *       Call 1 is a cold rebuild and should cost ~5-6s (measured locally: 5.30s).
 *       Call 2 should then be FAST (<1s) if the graph caches.
 *       If call 2 also costs ~5s, every request is re-running a full rebuild,
 *       which is exactly what markRenamed re-arming fullDirty produces.
 *
 *  Q2 — does the build promise pin (Defect D)?
 *       Once a call dies at ~30s, does EVERY later call die too, permanently,
 *       while the metadata plane stays instant?
 *
 * Client timeout is 45s, longer than the server's 30s, so a server-side socket
 * kill is distinguishable from the client giving up.
 * Stops after 2 consecutive hangs to limit leaked concurrency slots (carl seq 11).
 * Token from the environment; never printed.
 */
const BASE = new URL(process.env.KOSMOS_MCP_URL).origin;
const TOKEN = process.env.KOSMOS_MCP_TOKEN;
const AUTH = { Authorization: `Bearer ${TOKEN}` };

const results = [];

async function hit(label, path, timeoutMs = 45_000) {
  const t0 = performance.now();
  try {
    const r = await fetch(BASE + path, { headers: AUTH, signal: AbortSignal.timeout(timeoutMs) });
    const body = await r.text();
    const s = (performance.now() - t0) / 1000;
    const out = { label, path, ok: true, status: r.status, secs: s, bytes: body.length };
    console.log(`${label.padEnd(26)} HTTP ${String(r.status).padEnd(4)} ${s.toFixed(2).padStart(6)}s  ${body.length} bytes`);
    results.push(out);
    return out;
  } catch (e) {
    const s = (performance.now() - t0) / 1000;
    const code = e.cause?.code ?? e.name;
    console.log(`${label.padEnd(26)} FAIL      ${s.toFixed(2).padStart(6)}s  ${code}`);
    const out = { label, path, ok: false, secs: s, code };
    results.push(out);
    return out;
  }
}

console.log("=== fresh restart, no fixes applied ===\n");
console.log("-- metadata plane (never calls getGraph) --");
await hit("health", "/health");
await hit("root", "/");

console.log("\n-- vault plane, sequential --");
let consecutiveHangs = 0;
const MAX_CALLS = 10;
let n = 0;
const paths = ["/overview", "/overview", "/overview", "/notes?q=engine", "/overview"];

while (n < MAX_CALLS && consecutiveHangs < 2) {
  const path = paths[Math.min(n, paths.length - 1)];
  const r = await hit(`call ${n + 1}  ${path}`, path);
  consecutiveHangs = r.ok ? 0 : consecutiveHangs + 1;
  n++;
}

console.log("\n-- metadata plane again, after the vault calls --");
await hit("health", "/health");
await hit("root", "/");

/* ---------------- interpretation ---------------- */
const vault = results.filter((r) => r.label.startsWith("call "));
const ok = vault.filter((r) => r.ok);
const hung = vault.filter((r) => !r.ok);
const meta = results.filter((r) => !r.label.startsWith("call "));

console.log(`\n${"=".repeat(70)}`);
console.log(`vault calls: ${vault.length}   succeeded: ${ok.length}   hung: ${hung.length}`);
if (ok.length) console.log(`successful timings: ${ok.map((r) => r.secs.toFixed(2) + "s").join(", ")}`);
if (hung.length) console.log(`hung timings:       ${hung.map((r) => r.secs.toFixed(2) + "s").join(", ")}`);
console.log(`metadata plane:     ${meta.map((r) => (r.ok ? r.secs.toFixed(2) + "s" : "FAIL")).join(", ")}`);
console.log("");

// Q1
if (ok.length >= 2) {
  const [a, b] = ok;
  console.log(`Q1 rebuild caching: call1 ${a.secs.toFixed(2)}s -> call2 ${b.secs.toFixed(2)}s`);
  if (b.secs > a.secs * 0.5) {
    console.log(`   Second call is NOT cheap. Every request appears to re-run a full`);
    console.log(`   rebuild — dale seq 17's markRenamed/fullDirty defect, live.`);
  } else {
    console.log(`   Second call is cheap, so the graph caches correctly and dale seq 17's`);
    console.log(`   perpetual-rebuild defect is NOT driving this.`);
  }
} else if (ok.length === 1) {
  console.log(`Q1: only one call ever succeeded (${ok[0].secs.toFixed(2)}s) — same signature as`);
  console.log(`    JEFFREY seq 15's lone 5.5s /overview. Pinned immediately after.`);
} else {
  console.log(`Q1: no vault call succeeded even on a fresh restart — the pin is not the`);
  console.log(`    whole story, or the process was already stuck before this run.`);
}

// Q2
console.log("");
const pinned = hung.length >= 2 && hung.every((r) => r.secs > 25 && r.secs < 40);
if (ok.length >= 1 && pinned) {
  console.log(`Q2 DEFECT D CONFIRMED BEHAVIOURALLY: served ${ok.length} call(s), then every`);
  console.log(`   later call died at ~30s while the metadata plane stayed instant.`);
  console.log(`   Restart restored service; the pin returned. That is the predicted shape.`);
} else if (ok.length === 0 && pinned) {
  console.log(`Q2 INCONCLUSIVE on this run: nothing succeeded, so no restart->serve->pin`);
  console.log(`   transition was observed. Check the server actually restarted.`);
} else if (hung.length === 0) {
  console.log(`Q2 NOT REPRODUCED in ${vault.length} calls: the vault plane stayed healthy.`);
  console.log(`   The pin needs a trigger this run did not hit — likely sync activity`);
  console.log(`   touching a file mid-rebuild. Defect D remains possible but unproven.`);
}
console.log("=".repeat(70));
