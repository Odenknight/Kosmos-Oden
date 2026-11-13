/**
 * Semantic search (0.9.5) — test doubles.
 *
 * The real modules run unchanged: the SQLite store on SQLite compiled to
 * WebAssembly (sql.js, the same engine the plugin bundles), the worker
 * protocol, the service and the controller. Only two things are replaced:
 *
 *   - the embedding model, by a tiny deterministic "concept" embedder (words
 *     of the same concept land on the same axis), so a test can say exactly
 *     which notes are close in meaning without a 30 MB model;
 *   - the Web Worker, by an in-process object that passes messages the same
 *     way (asynchronously, structured-cloned).
 *
 * The real model in a real browser is covered by scripts/semantic-smoke.mjs.
 */
import { createHash } from "node:crypto";
import initSqlJs from "sql.js";
import { MODEL_CATALOG, SemanticController, installSemanticWorker, modelFileUrl, normalizeSemanticSettings } from "../../dist/kosmos-semantic.mjs";

let sqlModule = null;
export async function sql() {
  sqlModule ??= await initSqlJs();
  return sqlModule;
}

/** Words that mean the same thing share an axis. Everything else is spread thinly by a hash. */
export const CONCEPTS = [
  ["restore", "recovery", "recover", "crash", "crashed", "boot", "rescue", "machine", "computer", "runbook"],
  ["snapshot", "backup", "backups", "disk", "drive", "night", "nightly", "monthly"],
  ["bread", "baking", "bake", "sourdough", "flour", "starter", "proof", "oven"],
  ["tax", "taxes", "revenue", "paperwork", "receipts", "wage", "mortgage", "deadline", "file"],
  ["tomatoes", "tomato", "plants", "plant", "vegetable", "garden", "blight", "diseased", "frost", "water"],
  ["lisbon", "portugal", "tram", "sightseeing", "sintra", "trip", "travel"],
];
const AXIS = new Map(CONCEPTS.flatMap((words, axis) => words.map((w) => [w, axis])));
export const FAKE_DIMS = CONCEPTS.length + 6;

export function conceptVector(text) {
  const v = new Float32Array(FAKE_DIMS);
  for (const word of String(text).toLowerCase().match(/[a-z]+/g) ?? []) {
    const axis = AXIS.get(word);
    if (axis !== undefined) v[axis] += 1;
    else v[CONCEPTS.length + (createHash("md5").update(word).digest()[0] % 6)] += 0.05;
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

/**
 * An Embedder. `log` records every call; `failOn` makes a passage containing
 * that text throw, as a model would on input it cannot handle.
 */
export function fakeEmbedder({ dims = FAKE_DIMS, failOn = null, wait = null } = {}) {
  const log = [];
  return {
    dims,
    log,
    disposed: false,
    async embed(texts, kind) {
      log.push({ kind, texts: [...texts] });
      // `wait(kind)` may return a promise: a slow model, held for as long as the test needs.
      if (wait) await wait(kind);
      if (failOn && texts.some((t) => t.includes(failOn))) throw new Error("the model could not read this passage");
      return texts.map((t) => { const v = conceptVector(t); return dims === FAKE_DIMS ? v : Float32Array.from({ length: dims }, (_, i) => v[i % FAKE_DIMS]); });
    },
    async dispose() { this.disposed = true; },
  };
}

/**
 * A SemanticWorkerLike that runs the real worker code (installSemanticWorker)
 * in this process. Messages are cloned and delivered on a later tick, like
 * postMessage. `made` lists every worker created; each records the requests
 * it received and the embedder it built.
 */
export function fakeWorkerFactory(embedderOptions = {}) {
  const made = [];
  const create = () => {
    const outer = { onmessage: null, onerror: null, terminated: false, requests: [], embedder: null, loads: [] };
    const scope = {
      onmessage: null,
      postMessage(message) { if (!outer.terminated) setImmediate(() => { if (!outer.terminated) outer.onmessage?.({ data: structuredClone(message) }); }); },
    };
    installSemanticWorker(scope, {
      sql,
      async createEmbedder(files, recipe) {
        outer.loads.push({ modelBytes: files.model.byteLength, tokenizer: files.tokenizer, recipe });
        if (create.failLoad) throw new Error(create.failLoad);
        outer.embedder = fakeEmbedder(typeof embedderOptions === "function" ? embedderOptions() : embedderOptions);
        return outer.embedder;
      },
    });
    outer.postMessage = (message) => {
      if (outer.terminated) throw new Error("worker was terminated");
      outer.requests.push(message.op);
      const data = structuredClone(message);
      setImmediate(() => { if (!outer.terminated) scope.onmessage?.({ data }); });
    };
    outer.terminate = () => { outer.terminated = true; };
    /** Simulate the worker dying (out of memory, uncaught error). */
    outer.crash = (message = "out of memory") => outer.onerror?.({ message });
    made.push(outer);
    return outer;
  };
  create.made = made;
  create.failLoad = "";
  /** Passages embedded by every worker so far (questions excluded). */
  create.passages = () => made.flatMap((w) => w.embedder?.log ?? []).filter((c) => c.kind === "passage").reduce((n, c) => n + c.texts.length, 0);
  return create;
}

/** A mutable note source, as the Personal Notes corpus is to the service. */
export function noteSource(initial = {}) {
  const notes = new Map(Object.entries(initial));
  const title = (path) => path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
  let ready = true;
  return {
    notes: () => [...notes.keys()].sort().map((path) => ({ path, title: title(path), raw: notes.get(path) })),
    get: (path) => (notes.has(path) ? { path, title: title(path), raw: notes.get(path) } : null),
    ready: () => ready,
    set(path, raw) { notes.set(path, raw); },
    delete(path) { notes.delete(path); },
    rename(from, to) { notes.set(to, notes.get(from)); notes.delete(from); },
    setReady(value) { ready = value; },
    get size() { return notes.size; },
  };
}

/** SemanticFiles in memory. `writes` lists every path written, in order. */
export function memoryFiles() {
  const files = new Map();
  const dirs = new Set();
  const writes = [];
  return {
    files, dirs, writes,
    exists: async (path) => files.has(path) || dirs.has(path),
    mkdir: async (path) => { dirs.add(path); },
    readBinary: async (path) => { if (!files.has(path)) throw new Error(`ENOENT ${path}`); return files.get(path).slice(0); },
    writeBinary: async (path, data) => { writes.push(path); files.set(path, data.slice(0)); },
    remove: async (path) => { files.delete(path); },
    rename: async (from, to) => { files.set(to, files.get(from)); files.delete(from); },
    size: async (path) => (files.has(path) ? files.get(path).byteLength : null),
    list: async (dir) => [...files.keys()].filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes("/")),
  };
}

export const sha256 = async (data) => createHash("sha256").update(Buffer.from(data)).digest("hex");
export const bytes = (text) => new TextEncoder().encode(text).buffer;

/** Six short notes on five subjects; the recovery runbook is about recovery and about backups, so the backups note is its sibling. */
export const NOTES = {
  "Ops/Recovery runbook.md": "# Recovery runbook\n\nWhen the machine will not boot, attach the backup drive, start from the rescue image and copy the snapshot onto the disk.\n\nSee [[Ops/Backups]].\n",
  "Ops/Backups.md": "# Backups\n\nA snapshot of the disk is taken every night and kept on the external drive. A monthly backup goes off site.\n",
  "Home/Sourdough.md": "# Sourdough\n\nFeed the starter twice a day. Mix flour and salt, proof overnight, bake in a hot oven.\n",
  "Money/Tax checklist.md": "# Tax checklist\n\nCollect the wage statements, the mortgage form and the receipts before the deadline.\n",
  "Garden/Tomatoes.md": "# Tomatoes\n\nPlant after the last frost. Water deeply. Blight shows as brown patches.\n",
  "Travel/Lisbon.md": "# Lisbon\n\nTake the tram early. A day trip to Sintra is worth it.\n",
};

/* ------------------------------------------------------------ a controller */

/**
 * A stand-in for a published model file: the published size, starting with a
 * tag that names it. JSON files are valid JSON, as the plugin checks.
 */
export function fakeModelFile(model, f) {
  const out = new Uint8Array(f.bytes);
  const enc = new TextEncoder();
  if (f.name === "model.onnx") { out.set(enc.encode(`FAKE:${model.id}/${f.name}:`)); return out.buffer; }
  out.fill(0x78);
  out.set(enc.encode(`{"FAKE:${model.id}/${f.name}:":"`));
  out.set(enc.encode('"}'), f.bytes - 2);
  return out.buffer;
}

/**
 * SHA-256, except that an intact stand-in file (its tag and the published
 * size) reports the published hash. A cut, grown or foreign file hashes as
 * what it is, so the size and hash checks are exercised for real.
 */
export async function fakeModelHash(data) {
  const head = new TextDecoder().decode(new Uint8Array(data, 0, Math.min(96, data.byteLength)));
  const tag = /FAKE:([^:"]+)\/([^:"]+):/.exec(head);
  const file = tag && MODEL_CATALOG.find((m) => m.id === tag[1])?.files.find((f) => f.name === tag[2]);
  return file && file.bytes === data.byteLength ? file.sha256 : sha256(data);
}

/**
 * The real SemanticController over in-memory files, the in-process worker and
 * a download that serves stand-in files. `requests` lists every URL asked
 * for; `hold()` makes downloads wait until the returned function is called;
 * `set()` changes the saved settings as the settings page would.
 */
export async function controllerWith({ settings = {}, install = true, notes = NOTES, embedder } = {}) {
  const real = MODEL_CATALOG.find((m) => m.id === "all-minilm-l6-v2");
  const files = memoryFiles();
  const root = ".obsidian/plugins/kosmos-oden/semantic";
  const requests = [];
  let gate = null;
  const download = async (url, onProgress, signal) => {
    requests.push(url);
    const m = MODEL_CATALOG.find((x) => url.includes(`/${x.repo}/resolve/${x.revision}/`));
    const f = m.files.find((x) => url === modelFileUrl(m, x));
    onProgress(Math.floor(f.bytes / 2));
    if (gate) await gate;
    if (signal?.aborted) throw new Error("download cancelled");
    onProgress(f.bytes);
    return fakeModelFile(m, f);
  };
  if (install) for (const f of real.files) files.files.set(`${root}/models/${real.id}/${f.name}`, fakeModelFile(real, f));
  let saved = normalizeSemanticSettings({ enabled: true, modelId: real.id, ...settings });
  const source = noteSource(notes);
  const createWorker = fakeWorkerFactory(embedder);
  let changes = 0;
  const listeners = new Set();
  const controller = new SemanticController({
    files, root, download, sha256: fakeModelHash, createWorker, source,
    settings: () => saved,
    onChange: () => { changes++; for (const fn of [...listeners]) fn(); },
  });
  return {
    controller, files, root, source, createWorker, requests, real,
    settings: () => saved,
    set(patch) { saved = normalizeSemanticSettings({ ...saved, ...patch }); },
    listen(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get changes() { return changes; },
    hold() { let release; gate = new Promise((r) => { release = r; }); return () => { gate = null; release(); }; },
  };
}
