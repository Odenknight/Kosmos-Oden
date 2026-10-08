/**
 * How long does a cold graph build of the REAL vault actually take?
 *
 * Nobody has measured this. JEFFREY established the 30s socket kill, dale found
 * the mechanism (no 'timeout' listener) and a provider bug forcing repeated full
 * rebuilds, but explicitly did not claim it accounts for 30 seconds. This
 * measures the engine cost directly, outside the server, with no timeout.
 *
 * Read-only and local: reads vault files to build the graph, prints ONLY
 * timings, counts and diagnostics. No note content is printed and nothing
 * leaves this machine. Does not touch the live server.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { performance } from "node:perf_hooks";

const VAULT = process.argv[2] ?? "C:/Users/FAC/Documents/_NC/Obsidian-Oden";
const ENGINE = "file:///C:/Users/FAC/Documents/_AI_builds_GPT/Kosmos-Oden/node_modules/gkos-engine/dist/gkos-engine.mjs";

const t = (label, fn) => {
  const t0 = performance.now();
  const out = fn();
  const ms = performance.now() - t0;
  console.log(`${label.padEnd(46)} ${(ms / 1000).toFixed(2)}s`);
  return [out, ms];
};

/* ---- 1. walk the vault ---- */
function walk(dir, acc = [], folders = new Set()) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;           // .obsidian, .git, .trash
    const full = join(dir, e.name);
    if (e.isDirectory()) { folders.add(relative(VAULT, full).split(sep).join("/")); walk(full, acc, folders); }
    else if (e.name.toLowerCase().endsWith(".md")) acc.push(full);
  }
  acc.folders = folders;
  return acc;
}

const [paths, walkMs] = t("walk vault (directory scan)", () => walk(VAULT));
const folders = [...(paths.folders ?? [])];
console.log(`   ${paths.length} markdown files, ${folders.length} folders`);

/* ---- 2. read them all ---- */
const [files, readMs] = t("read all markdown from disk", () =>
  paths.map((p) => {
    const st = statSync(p);
    const rel = relative(VAULT, p).split(sep).join("/");
    return {
      relativePath: rel,
      name: rel.split("/").pop(),
      extension: "md",
      size: st.size,
      modifiedTime: st.mtimeMs,
      createdTime: st.birthtimeMs,
      content: readFileSync(p, "utf8"),
      kind: "note",
    };
  }),
);
const bytes = files.reduce((n, f) => n + Buffer.byteLength(f.content, "utf8"), 0);
console.log(`   ${(bytes / 1024 / 1024).toFixed(1)} MiB of markdown`);

/* ---- 3. build the graph, the way the provider does ---- */
const engine = await import(ENGINE);
console.log(`\nengine ${engine.ENGINE_NAME ?? "gkos-engine"} v${engine.ENGINE_VERSION ?? "?"}\n`);

const projection = { defaultSensitivity: "public" };

const [graph, buildMs] = t("buildGraph() — COLD, full vault", () =>
  engine.buildGraph(files, folders, Date.now(), projection),
);
console.log(`   nodes=${graph?.nodes?.length ?? "?"} edges=${graph?.edges?.length ?? "?"}`);

/* ---- 4. the index path the provider actually uses ---- */
const idx = new engine.GkxIndex(projection);
const [, setFilesMs] = t("GkxIndex.setFiles() — COLD (provider path)", () => idx.setFiles(files, folders, []));
const [, setFilesWarmMs] = t("GkxIndex.setFiles() — repeat (warm process)", () => idx.setFiles(files, folders, []));

/* ---- verdict ---- */
const TIMEOUT = 30;
console.log(`\n${"=".repeat(64)}`);
const worst = Math.max(buildMs, setFilesMs) / 1000;
const endToEnd = (readMs + setFilesMs) / 1000;
console.log(`cold provider path (read + setFiles): ${endToEnd.toFixed(2)}s   vs REQUEST_TIMEOUT_MS = ${TIMEOUT}s`);
if (endToEnd >= TIMEOUT) {
  console.log(`\nEXCEEDS the socket timeout on its own. A cold rebuild cannot complete`);
  console.log(`before the socket is destroyed, so the graph read can never succeed.`);
} else if (endToEnd >= TIMEOUT / 3) {
  console.log(`\nUnder the timeout here, but within the same order of magnitude.`);
  console.log(`On the server this runs through Obsidian's vault API rather than raw`);
  console.log(`fs, alongside other work, so the real cost is higher than this floor.`);
} else {
  console.log(`\nWELL under the timeout. The engine build is NOT the 30s cost by itself;`);
  console.log(`the delay is elsewhere — I/O through the Obsidian API, contention, or a`);
  console.log(`rebuild loop repeating this work many times per request.`);
  console.log(`\nAt ${(setFilesMs / 1000).toFixed(2)}s per full rebuild, ${Math.ceil(TIMEOUT / (setFilesMs / 1000))} repeats exceed the ${TIMEOUT}s timeout —`);
  console.log(`which is the shape dale's markRenamed defect (perpetual fullDirty) produces.`);
}
console.log("=".repeat(64));
