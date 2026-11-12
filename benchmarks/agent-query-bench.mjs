/**
 * Existing-profile Agent API query latency (0.9.0).
 *
 * Builds deterministic synthetic vaults (default 3,000 and 15,000 notes) the
 * way benchmarks/bench.mjs does, then times the hot query methods the REST and
 * MCP surfaces call: qSearch, qNote, qRelated, qLineage, qOverview. Every
 * query runs against one unchanged graph, which is the steady state of a
 * connected agent. Prints p50/p95 per query as a Markdown table.
 *
 *   npm run build   (or: node scripts/build.mjs --for-tests)
 *   node benchmarks/agent-query-bench.mjs [--sizes 3000,15000] [--iterations 200]
 *     [--module path/to/other/kosmos-agent-server.mjs]   (e.g. a saved baseline build)
 *     [--check path/to/other/kosmos-agent-server.mjs]    (assert byte-identical results first)
 */
import http from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildGraph, stripFrontmatter } from "../dist/kosmos-core.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const load = (p) => import(p ? pathToFileURL(resolve(p)).href : "../dist/kosmos-agent-server.mjs");
const { KosmosAgentServer, migrateAgentSettings } = await load(arg("--module"));
const reference = arg("--check") ? await load(arg("--check")) : null;
const SIZES = arg("--sizes", "3000,15000").split(",").map(Number);
const ITERATIONS = Number(arg("--iterations", "200"));

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same shape as bench.mjs, plus explicit sensitivity on every seventh note. */
function makeVault(n) {
  const rand = rng(n * 2654435761);
  const areas = Math.max(4, Math.round(Math.sqrt(n) / 2));
  const folders = Array.from({ length: areas }, (_, a) => `Area${String(a).padStart(2, "0")}`);
  const files = [];
  for (let i = 0; i < n; i++) {
    const area = folders[i % areas];
    const links = Array.from({ length: Math.floor(rand() * 5) }, () => {
      const t = Math.floor(rand() * n);
      return `[[Area${String(t % areas).padStart(2, "0")}/Note ${t}]]`;
    });
    const gkx = i % 7 === 0
      ? `type: idea\nsensitivity: ${i % 49 === 0 ? "secret" : "internal"}\ntimestamp: 2026-01-${String((i % 27) + 1).padStart(2, "0")}T00:00:00Z\n` +
        (i % 21 === 0 && i > 0 ? `supersedes:\n  - Note ${i - 7}\n` : "")
      : `tags: [t${i % 11}]\n`;
    files.push({ relativePath: `${area}/Note ${i}.md`, content: `---\n${gkx}---\n# Note ${i}\n\nBody of note ${i}. ${links.join(" ")}\n`, modifiedTime: 1735689600000 + i * 60000, createdTime: 1735689600000 + i * 60000, kind: "note" });
  }
  return { files, folders };
}

function percentile(sorted, p) { return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]; }

async function time(fn, iterations) {
  for (let i = 0; i < Math.min(10, iterations); i++) await fn(i); // warm-up
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn(i);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95) };
}

const rows = [];
for (const n of SIZES) {
  const { files, folders } = makeVault(n);
  const graph = buildGraph(files, folders, undefined, { defaultSensitivity: "internal" });
  const bodies = new Map(files.map((f) => [f.relativePath, stripFrontmatter(f.content)]));
  const provider = { getGraph: async () => graph, getNoteContent: async (p) => bodies.get(p) ?? null, vaultName: () => "Bench", lanAddresses: () => [] };
  const settings = { ...migrateAgentSettings({}), defaultSensitivity: "internal", agentSensitivityCeiling: "internal" };
  const server = new KosmosAgentServer(http, settings, provider);
  const iterations = n > 5000 ? Math.max(20, Math.floor(ITERATIONS / 4)) : ITERATIONS;
  const pathOf = (i) => files[(i * 7919) % n].relativePath;
  const lineagePath = (i) => files[(((i * 13) % Math.floor(n / 21)) + 1) * 21].relativePath; // notes that declare supersedes
  const queries = {
    qSearch: (i) => server.qSearch(`Note ${(i * 7919) % n}`),
    qNote: (i) => server.qNote({ path: pathOf(i) }),
    qRelated: (i) => server.qRelated({ path: pathOf(i) }),
    qLineage: (i) => server.qLineage({ path: lineagePath(i) }),
    qOverview: () => server.qOverview(),
  };
  if (reference) {
    const other = new reference.KosmosAgentServer(http, settings, provider);
    const sample = (s) => [s.qSearch(""), s.qSearch("note 1"), s.qAtTime("2026-01-15T00:00:00Z", 200), s.qGraph(), s.qDiagnostics(),
      ...Array.from({ length: 40 }, (_, i) => [s.qNote({ path: pathOf(i) }), s.qRelated({ path: pathOf(i) }), s.qLineage({ path: lineagePath(i) }), s.qSearch(`Note ${(i * 7919) % n}`)]).flat(),
      s.qOverview()];
    const [a, b] = [JSON.stringify(await Promise.all(sample(server))), JSON.stringify(await Promise.all(sample(other)))];
    if (a !== b) throw new Error(`results differ from ${arg("--check")} at ${n} notes`);
    console.error(`agent-query-bench ${n}: results byte-identical to ${arg("--check")} (${a.length} bytes)`);
  }
  for (const [name, fn] of Object.entries(queries)) {
    const r = await time(fn, iterations);
    rows.push({ n, name, iterations, ...r });
  }
  console.error(`agent-query-bench ${n}: done`);
}

console.log(`Node ${process.version}, ${process.platform} ${process.arch}`);
console.log(`| Notes | Query | Iterations | p50 | p95 |`);
console.log(`| ---: | --- | ---: | ---: | ---: |`);
for (const r of rows) console.log(`| ${r.n.toLocaleString("en-US")} | ${r.name} | ${r.iterations} | ${r.p50.toFixed(2)} ms | ${r.p95.toFixed(2)} ms |`);
