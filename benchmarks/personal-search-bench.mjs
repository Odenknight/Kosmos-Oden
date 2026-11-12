/**
 * Personal Notes search benchmark (0.9.0, P11).
 *
 *   npm run bench:personal-search            (builds dist/ for tests first)
 *   node --expose-gc benchmarks/personal-search-bench.mjs [--notes 10000] [--mib 50] [--no-browser]
 *
 * Writes a seeded corpus (default 10,000 notes, ~50 MiB) to
 * benchmarks/fixtures/personal-search/ (gitignored), then measures with the real
 * built worker (dist/kosmos-personal-search-worker.txt on worker_threads):
 * first build in a fresh process, rebuild after restart (fresh corpus + worker),
 * warm search p50/p95 over 50 fixed queries, edit-to-visible with the real
 * 250 ms debounce, peak RSS; plus the starter patch's main-thread FullTextIndex
 * on the same corpus, and main-thread long tasks in real Chromium (Playwright).
 * Prints a Markdown report and saves JSON next to the fixtures.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import esbuild from "esbuild";
import { MemoryCorpus, PersonalSearchClient, FullTextIndex } from "../dist/kosmos-personal-notes.mjs";
import { nodeWorkerFactory } from "../test/helpers/node-search-worker.mjs";
import { generateCorpus, benchmarkQueries } from "./personal-search-corpus.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const NOTES = Number(arg("--notes", 10_000));
const MIB = Number(arg("--mib", 50));
const ROUNDS = Number(arg("--rounds", 5));
const EDITS = Number(arg("--edits", 10));
const browser = !process.argv.includes("--no-browser");
const SEED = 0x5eed;
const fixtureDir = join(root, "benchmarks/fixtures/personal-search", `${SEED.toString(16)}-${NOTES}-${MIB}`);
const gc = globalThis.gc ?? (() => {});
const now = () => performance.now();
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
const ms = (x) => `${x.toFixed(x < 10 ? 2 : 0)} ms`;
const mib = (b) => `${(b / 1048576).toFixed(0)} MiB`;
const pause = (t) => new Promise((r) => setTimeout(r, t));

/* ---------------------------------------------------------------- fixtures */

async function ensureFixtures() {
  const manifestPath = join(fixtureDir, "manifest.json");
  if (existsSync(manifestPath)) return { ...JSON.parse(readFileSync(manifestPath, "utf8")), written: false };
  const files = generateCorpus({ notes: NOTES, targetBytes: MIB * 1024 * 1024, seed: SEED });
  let bytes = 0;
  for (const f of files) {
    const target = join(fixtureDir, "vault", f.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, f.raw, "utf8");
    bytes += Buffer.byteLength(f.raw);
  }
  const manifest = { seed: SEED, notes: NOTES, bytes, paths: files.map((f) => f.path) };
  writeFileSync(manifestPath, JSON.stringify(manifest));
  return { ...manifest, written: true };
}

function fsSource(paths) {
  const vault = join(fixtureDir, "vault");
  const known = new Set(paths);
  const stat = (p) => { if (!known.has(p)) return null; const s = statSync(join(vault, p)); return { path: p, mtimeMs: s.mtimeMs, sizeBytes: s.size }; };
  return {
    listMarkdown: () => [...known].map(stat),
    stat,
    readRaw: (p) => readFile(join(vault, p), "utf8"),
    meta: (p, raw) => ({ title: p.replace(/^.*\//, "").replace(/\.md$/, ""), aliases: [], tags: (/^tags: \[(.*)\]$/m.exec(raw)?.[1] ?? "").split(", ").filter(Boolean), supersedes: [], supersededBy: [], links: [], attachments: [] }),
    exists: (p) => known.has(p),
    resolveLink: () => null,
    physicallyContained: () => true,
    write: (p, raw) => writeFile(join(vault, p), raw, "utf8"),
  };
}

/* ------------------------------------------------------------------ memory */

let peakRss = 0;
const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 20);
const resetPeak = () => { peakRss = process.memoryUsage().rss; };

/* ------------------------------------------------------------- worker runs */

async function buildIndexed(source) {
  const t0 = now();
  const corpus = new MemoryCorpus(source);
  const client = new PersonalSearchClient({ corpus, createWorker: nodeWorkerFactory() });
  await corpus.build();
  const corpusMs = now() - t0;
  await client.whenApplied();
  return { corpus, client, corpusMs, totalMs: now() - t0 };
}

async function timeQueries(searchOnce) {
  const queries = benchmarkQueries(SEED);
  const results = {};
  for (const q of queries) results[q] = await searchOnce(q); // warm-up round, also records totals
  const times = [];
  const perQuery = {};
  for (let r = 0; r < ROUNDS; r++) {
    for (const q of queries) {
      const t = now();
      await searchOnce(q);
      const d = now() - t;
      times.push(d);
      (perQuery[q] ??= []).push(d);
    }
  }
  return { times, results, perQuery };
}

async function editToVisible(corpus, client, source, paths) {
  const times = [];
  for (let k = 0; k < EDITS; k++) {
    const p = paths[(k * 7919 + 13) % paths.length];
    const token = `editmarker${k}x${Date.now().toString(36)}`;
    const raw = (await source.readRaw(p)) + `\n${token}\n`;
    await source.write(p, raw);
    const t = now();
    const seen = new Promise((resolve) => { const off = corpus.subscribe((d) => { if (d.upserts.some((u) => u.path === p)) { off(); resolve(d.revision); } }); });
    corpus.apply({ modified: [p] });
    await client.whenApplied(await seen);
    const r = await client.search({ query: token, allowedPaths: null });
    times.push(now() - t);
    if (r.total !== 1) throw new Error(`edit ${k} not visible`);
  }
  return times;
}

/* ---------------------------------------------------------------- baseline */

async function loadStarterIndex() {
  try {
    const ref = process.env.KOSMOS_BENCH_BASELINE_REF
      || execFileSync("git", ["log", "--format=%H", "-1", "--grep=Apply reviewed 0.9.0 Personal Notes starting patch"], { cwd: root, encoding: "utf8" }).trim();
    if (!ref) return null;
    const source = execFileSync("git", ["show", `${ref}:src/personal-notes/fulltext.ts`], { cwd: root, encoding: "utf8" });
    const out = await esbuild.build({ stdin: { contents: source, loader: "ts", sourcefile: "starter-fulltext.ts" }, bundle: false, format: "esm", write: false, logLevel: "silent" });
    const file = join(fixtureDir, "..", "starter-fulltext.mjs");
    writeFileSync(file, out.outputFiles[0].text);
    return { ref: ref.slice(0, 12), FullTextIndex: (await import(pathToFileURL(file).href)).FullTextIndex };
  } catch (e) {
    console.error("starter baseline unavailable:", e.message);
    return null;
  }
}

async function mainThreadRun(Index, docs) {
  gc();
  const t0 = now();
  const index = new Index(docs);
  const buildMs = now() - t0;
  const q = await timeQueries(async (query) => index.search(query, { limit: 20 }));
  return { buildMs, ...q };
}

/* ----------------------------------------------------------------- browser */

async function chromiumRun() {
  const { chromium } = await import("@playwright/test");
  const port = 8400 + Math.floor(Math.random() * 400);
  const server = spawn(process.execPath, [join(root, "scripts/serve-static.mjs"), String(port)], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((resolve) => server.stdout.once("data", resolve));
  const browserInstance = await chromium.launch();
  try {
    const page = await browserInstance.newPage();
    await page.goto(`http://127.0.0.1:${port}/test/browser/personal-search-harness.html`);
    await page.waitForFunction(() => window.harnessReady === true);
    const r = await page.evaluate(({ notes, bytes }) => window.runPersonalSearch({ notes, targetBytes: bytes, rounds: 3, editCount: 5 }), { notes: NOTES, bytes: MIB * 1024 * 1024 });
    return { version: browserInstance.version(), ...r };
  } finally {
    await browserInstance.close();
    server.kill();
  }
}

/* -------------------------------------------------------------------- main */

const machine = {
  cpu: os.cpus()[0]?.model.trim(),
  logicalCores: os.cpus().length,
  memory: mib(os.totalmem()),
  os: `${os.type()} ${os.release()} ${os.arch()}`,
  node: process.version,
};

const fx = await ensureFixtures();
const source = fsSource(fx.paths);
gc();
const rssBefore = process.memoryUsage().rss;
resetPeak();

// 1. First build in this process (cold JIT; OS file cache as left by the fixture step).
const cold = await buildIndexed(source);
const peakIndexRss = peakRss;
// 2. Warm search.
resetPeak();
const warm = await timeQueries((query) => cold.client.search({ query, allowedPaths: null }));
const peakSearchRss = peakRss;
// 3. Scoped search (agent scope = half the vault, set sent once).
const half = new Set(fx.paths.filter((_, i) => i % 2 === 0));
const scoped = await timeQueries((query) => cold.client.search({ query, allowedPaths: half }));
// 4. Edit to visible (real 250 ms debounce).
const edits = await editToVisible(cold.corpus, cold.client, source, fx.paths);
cold.client.dispose();
cold.corpus.dispose();

// 5. Rebuild after restart: fresh corpus and worker.
gc();
await pause(200);
resetPeak();
const restart = await buildIndexed(source);
const peakRestartRss = peakRss;
restart.client.dispose();
restart.corpus.dispose();

// 6. Main-thread comparisons on the same corpus: starter patch vs this matcher.
const docs = [];
for (const p of fx.paths) docs.push({ path: p, title: p.replace(/^.*\//, "").replace(/\.md$/, ""), aliases: [], tags: [], body: await source.readRaw(p) });
const starter = await loadStarterIndex();
const starterRun = starter ? await mainThreadRun(starter.FullTextIndex, docs) : null;
const currentSync = await mainThreadRun(FullTextIndex, docs);
docs.length = 0;
clearInterval(sampler);

// 7. Chromium long tasks.
const chrome = browser ? await chromiumRun() : null;

/* ------------------------------------------------------------------ report */

const sum = (t) => ({ p50: pct(t, 50), p95: pct(t, 95), max: Math.max(...t) });
const w = sum(warm.times), s = sum(scoped.times), e = sum(edits);
const slowest = Object.entries(warm.perQuery).map(([q, t]) => [q, pct(t, 50)]).sort((a, b) => b[1] - a[1]).slice(0, 5);
const lines = [];
lines.push(`Machine: ${machine.cpu}, ${machine.logicalCores} logical cores, ${machine.memory} RAM, ${machine.os}, Node ${machine.node}${chrome ? `, Chromium ${chrome.version}` : ""}`);
lines.push(`Corpus: ${fx.notes} notes, ${mib(fx.bytes)} UTF-8 (${fx.bytes} bytes), seed 0x${SEED.toString(16)}; fixtures ${fx.written ? "written this run" : "reused"}`);
lines.push("");
lines.push("| Measurement | Result | Target |");
lines.push("| --- | --- | --- |");
lines.push(`| First build in fresh process: corpus read | ${ms(cold.corpusMs)} | |`);
lines.push(`| First build: searchable in worker (total) | ${ms(cold.totalMs)} | ≤ 120 s |`);
lines.push(`| Rebuild after restart (fresh corpus + worker) | ${ms(restart.totalMs)} | ≤ 120 s |`);
lines.push(`| Warm search p50 / p95 / max (50 queries × ${ROUNDS}) | ${ms(w.p50)} / ${ms(w.p95)} / ${ms(w.max)} | p95 ≤ 300 ms |`);
lines.push(`| Scoped search (half vault) p50 / p95 | ${ms(s.p50)} / ${ms(s.p95)} | |`);
lines.push(`| Edit to visible p50 / max (${EDITS} edits, 250 ms debounce) | ${ms(e.p50)} / ${ms(e.max)} | ≤ 3 s |`);
lines.push(`| Peak RSS: before / index / search / restart | ${mib(rssBefore)} / ${mib(peakIndexRss)} / ${mib(peakSearchRss)} / ${mib(peakRestartRss)} | |`);
if (starterRun) lines.push(`| Starter patch FullTextIndex (main thread, ${starter.ref}): build; search p50 / p95 | ${ms(starterRun.buildMs)}; ${ms(sum(starterRun.times).p50)} / ${ms(sum(starterRun.times).p95)} | before |`);
lines.push(`| This matcher, synchronous (main thread): build; search p50 / p95 | ${ms(currentSync.buildMs)}; ${ms(sum(currentSync.times).p50)} / ${ms(sum(currentSync.times).p95)} | after |`);
if (chrome) {
  const cs = sum(chrome.searchTimes);
  const max = (xs) => xs.length ? ms(Math.max(...xs.map((t) => t.duration))) : "none";
  lines.push(`| Chromium: searchable after | ${ms(chrome.indexMs)} | |`);
  lines.push(`| Chromium: search p50 / p95 | ${ms(cs.p50)} / ${ms(cs.p95)} | |`);
  lines.push(`| Chromium main-thread long tasks during search (count, longest) | ${chrome.searchLongTasks.length}, ${max(chrome.searchLongTasks)} | none > 50 ms |`);
  lines.push(`| Chromium main-thread long tasks during indexing (count, longest) | ${chrome.indexLongTasks.length}, ${max(chrome.indexLongTasks)} | |`);
  lines.push(`| Chromium main-thread long tasks during edits (count, longest) | ${chrome.editLongTasks.length}, ${max(chrome.editLongTasks)} | |`);
  lines.push(`| Chromium edit to visible max | ${ms(Math.max(...chrome.editTimes))} | ≤ 3 s |`);
}
lines.push("");
lines.push(`Slowest queries (worker, p50): ${slowest.map(([q, t]) => `\`${q}\` ${ms(t)}`).join(", ")}`);
const mismatch = starterRun ? Object.keys(warm.results).filter((q) => starterRun.results[q].total !== warm.results[q].total) : [];
lines.push(`Result totals differing from the starter: ${mismatch.length ? mismatch.map((q) => `\`${q}\``).join(", ") : "none"}`);
console.log(lines.join("\n"));
writeFileSync(join(fixtureDir, "..", "results.json"), JSON.stringify({ machine, fx: { notes: fx.notes, bytes: fx.bytes }, cold: { corpusMs: cold.corpusMs, totalMs: cold.totalMs }, restartMs: restart.totalMs, warm: w, scoped: s, edits: e, rss: { rssBefore, peakIndexRss, peakSearchRss, peakRestartRss }, starter: starterRun && { ref: starter.ref, buildMs: starterRun.buildMs, ...sum(starterRun.times) }, currentSync: { buildMs: currentSync.buildMs, ...sum(currentSync.times) }, chrome: chrome && { version: chrome.version, indexMs: chrome.indexMs, search: sum(chrome.searchTimes), searchLongTasks: chrome.searchLongTasks, indexLongTasks: chrome.indexLongTasks, editLongTasks: chrome.editLongTasks, editTimes: chrome.editTimes } }, null, 2));
process.exit(0);
