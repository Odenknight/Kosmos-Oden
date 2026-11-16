/**
 * Semantic search (0.9.5) — end-to-end smoke test of the BUILT worker with a
 * REAL model, in a real Chromium (the engine Obsidian runs on).
 *
 *   node scripts/semantic-smoke.mjs --model-dir <folder> [--id <catalog id>] [--chromium <path>]
 *                                   [--bench-dir <folder of .md notes> [--bench-limit <n>]]
 *
 * --bench-dir also embeds real notes from a folder and prints how long it took
 * (a measurement, not a check; the notes are read by this script and never leave
 * this machine).
 *
 * <folder> holds one .onnx file, tokenizer.json and tokenizer_config.json
 * (for example a model downloaded by the plugin: <vault>/.obsidian/plugins/
 * kosmos-oden/semantic/models/<id>).
 *
 * It starts dist/kosmos-semantic-worker.txt from a Blob URL exactly as the
 * plugin does, then: loads the model, embeds a few notes, asks questions that
 * share no words with the note they should find, exports the SQLite file,
 * reloads from it, and checks the reloaded index answers the same. The page
 * blocks every network request other than its own start page, so a pass also
 * shows the runtime fetches nothing.
 *
 * Not part of `npm test`: it needs a model (tens of MB) and a browser.
 */
import http from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback = "") => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const modelDir = arg("model-dir");
const id = arg("id", "arctic-embed-s");
if (!modelDir || !existsSync(modelDir)) { console.error("usage: node scripts/semantic-smoke.mjs --model-dir <folder> [--id <catalog id>] [--chromium <path>]"); process.exit(2); }

const { MODEL_CATALOG, contentKey } = await import(join(root, "dist/kosmos-semantic.mjs"));
const entry = MODEL_CATALOG.find((m) => m.id === id);
if (!entry) { console.error(`unknown catalog id ${id}; one of: ${MODEL_CATALOG.map((m) => m.id).join(", ")}`); process.exit(2); }
const onnx = readdirSync(modelDir).find((f) => f.endsWith(".onnx"));
if (!onnx) { console.error(`no .onnx file in ${modelDir}`); process.exit(2); }
const recipe = { dims: entry.dims, pooling: entry.pooling, maxTokens: entry.maxTokens, queryPrefix: entry.queryPrefix, passagePrefix: entry.passagePrefix };

const NOTES = [
  ["Ops/Recovery runbook.md", "Recovery runbook", "# Recovery runbook\n\nWhen the machine will not boot, attach the backup drive, start from the rescue image and copy last night's snapshot back onto the main disk. Check the database starts before pointing users at it again.\n"],
  ["Home/Sourdough.md", "Sourdough", "# Sourdough\n\nFeed the starter twice a day. Mix flour, water and salt, fold every thirty minutes for three hours, shape, and proof overnight in the fridge. Bake in a hot cast-iron pot.\n"],
  ["Money/Tax checklist.md", "Tax checklist", "# Tax checklist\n\nCollect the wage statements, the mortgage interest form and the charity receipts. File before the April deadline; keep copies for seven years.\n"],
  ["Garden/Tomatoes.md", "Tomatoes", "# Tomatoes\n\nPlant after the last frost. Water deeply twice a week and pinch off the side shoots. Blight shows as brown patches on the leaves; remove affected plants.\n"],
  ["Ops/Backups.md", "Backups", "# Backups\n\nSnapshots of the main disk are taken every night at two and kept for thirty days on the external drive. A monthly copy goes off site.\n"],
  ["Travel/Lisbon.md", "Lisbon", "# Lisbon\n\nTake tram 28 early to avoid the queue. The custard tarts in Belém are worth the trip. Three days is enough for the old town and a day in Sintra.\n"],
].map(([path, title, raw]) => ({ path, title, raw, key: contentKey(raw, title) }));

/** Real notes for the optional timing run: up to --bench-limit Markdown files under --bench-dir. */
const benchDir = arg("bench-dir");
const benchLimit = Number(arg("bench-limit", "300")) || 300;
const BENCH = [];
if (benchDir) {
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (BENCH.length >= benchLimit) return;
      if (name.startsWith(".")) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.endsWith(".md") && st.size > 0 && st.size < 2_000_000) {
        const raw = readFileSync(full, "utf8");
        const title = name.slice(0, -3);
        BENCH.push({ path: full.slice(benchDir.length + 1), title, raw, key: contentKey(raw, title) });
      }
    }
  };
  walk(resolve(benchDir));
}

/** Questions that share no meaningful word with the note they should find. */
const QUESTIONS = [
  ["how do I restore the server after a crash", "Ops/Recovery runbook.md"],
  ["baking bread at home", "Home/Sourdough.md"],
  ["what paperwork do I need for the revenue service", "Money/Tax checklist.md"],
  ["my vegetable plants look diseased", "Garden/Tomatoes.md"],
  ["sightseeing in Portugal", "Travel/Lisbon.md"],
];

const files = {
  "/worker.txt": join(root, "dist/kosmos-semantic-worker.txt"),
  "/model.onnx": join(modelDir, onnx),
  "/tokenizer.json": join(modelDir, "tokenizer.json"),
  "/tokenizer_config.json": join(modelDir, "tokenizer_config.json"),
};
const server = http.createServer((req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  if (p === "/") { res.writeHead(200, { "content-type": "text/html" }); res.end("<!doctype html><title>semantic smoke</title>"); return; }
  if (!files[p] || !existsSync(files[p])) { res.writeHead(404); res.end(); return; }
  const body = readFileSync(files[p]);
  res.writeHead(200, { "content-type": "application/octet-stream", "content-length": body.length });
  res.end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

const executablePath = arg("chromium", process.env.CHROMIUM_PATH || "");
const browser = await chromium.launch(executablePath ? { executablePath } : {});
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? "ok  " : "FAIL"} ${text}`); if (!ok) failed++; };
try {
  const page = await browser.newPage();
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("console", (m) => { if (m.type() === "error") console.log("[page error]", m.text().slice(0, 300)); });
  await page.goto(base);

  const out = await page.evaluate(async ({ recipe, notes, questions, bench }) => {
    const bytes = async (p) => (await fetch(p)).arrayBuffer();
    const text = async (p) => (await fetch(p)).text();
    const model = await bytes("/model.onnx");
    const tokenizer = await text("/tokenizer.json");
    const tokenizerConfig = await text("/tokenizer_config.json");
    const source = await text("/worker.txt");
    // From here on, the page's own fetches are done: the worker must not make any.
    performance.mark("worker-start");
    const start = () => {
      const worker = new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })));
      let next = 1;
      const waiting = new Map();
      worker.onmessage = (e) => { const w = waiting.get(e.data.id); waiting.delete(e.data.id); if (e.data.ok) w.resolve(e.data.result); else w.reject(new Error(e.data.error)); };
      worker.onerror = (e) => { for (const w of waiting.values()) w.reject(new Error(`worker error: ${e.message}`)); };
      return { worker, call: (m) => new Promise((resolve, reject) => { const id = next++; waiting.set(id, { resolve, reject }); worker.postMessage({ id, ...m }); }) };
    };
    const allowed = notes.map((n) => n.path);
    const ask = async (w, list) => {
      const answers = [];
      for (const [question] of list) answers.push((await w.call({ op: "query", question, allowed, limit: 3 })).map((h) => ({ path: h.path, score: h.score, lead: h.lead })));
      return answers;
    };

    let t = performance.now();
    const a = start();
    const loaded = await a.call({ op: "load", model: model.slice(0), tokenizer, tokenizerConfig, recipe, modelKey: "smoke", database: null });
    const loadMs = performance.now() - t;
    t = performance.now();
    const indexed = await a.call({ op: "index", notes });
    const indexMs = performance.now() - t;
    t = performance.now();
    const first = await ask(a, questions);
    const queryMs = (performance.now() - t) / questions.length;
    // Scope: with only the bread note allowed, a server question must not return the runbook.
    const scoped = await a.call({ op: "query", question: questions[0][0], allowed: ["Home/Sourdough.md"], limit: 5 });
    const nothing = await a.call({ op: "query", question: questions[0][0], allowed: [], limit: 5 });
    const related = await a.call({ op: "related", sources: ["Ops/Recovery runbook.md"], allowed, perSource: 3, limit: 3 });
    const database = await a.call({ op: "export" });
    const header = new TextDecoder().decode(new Uint8Array(database, 0, 15));
    const dbText = new TextDecoder("latin1").decode(new Uint8Array(database));
    const leaks = notes.filter((n) => dbText.includes(n.raw.slice(20, 60))).map((n) => n.path);
    await a.call({ op: "unload" });
    a.worker.terminate();

    // A second worker, started from the stored file only: nothing is embedded again.
    const b = start();
    const reloaded = await b.call({ op: "load", model: model.slice(0), tokenizer, tokenizerConfig, recipe, modelKey: "smoke", database });
    const manifest = await b.call({ op: "manifest" });
    const second = await ask(b, questions);
    // Another model key must not reuse these vectors.
    const c = start();
    const other = await c.call({ op: "load", model: model.slice(0), tokenizer, tokenizerConfig, recipe, modelKey: "another-model", database: await b.call({ op: "export" }) });
    b.worker.terminate(); c.worker.terminate();

    // Optional timing run over real notes, in the batches the plugin uses.
    let timing = null;
    if (bench.length) {
      const d = start();
      await d.call({ op: "load", model: model.slice(0), tokenizer, tokenizerConfig, recipe, modelKey: "bench", database: null });
      const paths = bench.map((n) => n.path);
      t = performance.now();
      for (let i = 0; i < bench.length; i += 6) await d.call({ op: "index", notes: bench.slice(i, i + 6) });
      const embedMs = performance.now() - t;
      const chunks = (await d.call({ op: "stats" })).chunks;
      t = performance.now();
      for (const [question] of questions) await d.call({ op: "query", question, allowed: paths, limit: 12 });
      const askMs = (performance.now() - t) / questions.length;
      t = performance.now();
      const stored = await d.call({ op: "export" });
      const exportMs = performance.now() - t;
      timing = { notes: bench.length, chars: bench.reduce((n, b) => n + b.raw.length, 0), chunks, embedMs, askMs, exportMs, bytes: stored.byteLength };
      d.worker.terminate();
    }
    return { loaded, indexed, first, second, scoped, nothing, related, header, dbBytes: dbText.length, leaks, reloaded, manifest, other, loadMs, indexMs, queryMs, timing };
  }, { recipe, notes: NOTES, questions: QUESTIONS, bench: BENCH });
  if (out.timing) {
    const b = out.timing;
    console.log(`timing ${id}: ${b.notes} notes (${(b.chars / 1e6).toFixed(2)} million characters) → ${b.chunks} passages in ${(b.embedMs / 1000).toFixed(1)} s (${(b.chunks / (b.embedMs / 1000)).toFixed(1)} passages/s, ${(b.notes / (b.embedMs / 1000)).toFixed(1)} notes/s); question ${Math.round(b.askMs)} ms; index ${(b.bytes / 1e6).toFixed(1)} MB written in ${Math.round(b.exportMs)} ms`);
  }

  console.log(`model ${id} (${onnx}): load ${Math.round(out.loadMs)} ms, embed ${NOTES.length} notes ${Math.round(out.indexMs)} ms, question ${Math.round(out.queryMs)} ms each, database ${out.dbBytes} bytes`);
  check(out.loaded.dims === entry.dims, `the model loads in the built worker and emits ${entry.dims}-number vectors (got ${out.loaded.dims})`);
  check(out.indexed.notes === NOTES.length && out.indexed.chunks >= NOTES.length, `all ${NOTES.length} notes were embedded (${out.indexed.chunks} passages)`);
  QUESTIONS.forEach(([question, want], i) => {
    const got = out.first[i][0];
    check(got?.path === want, `"${question}" → ${got?.path} (similarity ${got?.score.toFixed(3)})`);
  });
  check(out.scoped.every((h) => h.path === "Home/Sourdough.md"), "a question never returns a note outside the allowed set");
  check(out.nothing.length === 0, "an empty allowed set returns nothing");
  check(out.related[0]?.path === "Ops/Backups.md", `the note most related to the recovery runbook is the backups note (got ${out.related[0]?.path})`);
  check(out.header === "SQLite format 3", `the exported index is an SQLite database (header "${out.header}")`);
  check(out.leaks.length === 0, "the database contains no note text");
  check(!out.reloaded.rebuilt && out.reloaded.notes === NOTES.length && Object.keys(out.manifest).length === NOTES.length, "a new worker reuses the stored database without embedding again");
  check(JSON.stringify(out.first.map((a) => a.map((h) => h.path))) === JSON.stringify(out.second.map((a) => a.map((h) => h.path))), "the reloaded index gives the same answers");
  check(out.other.rebuilt && out.other.notes === 0, "a database built with one model is not reused for another");
  // The page fetches its start page and the four files above. Anything else (other than starting a Blob worker) would be the runtime reaching out.
  const expected = new Set([base, ...Object.keys(files).map((p) => base + p.slice(1))]);
  const extra = requests.filter((u) => !expected.has(u) && !u.startsWith("blob:") && u !== `${base}favicon.ico`);
  check(extra.length === 0, `the worker fetched nothing (${requests.filter((u) => u.startsWith("blob:")).length} Blob worker starts, ${extra.length} other requests${extra.length ? `: ${extra.slice(0, 3).join(", ")}` : ""})`);
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
