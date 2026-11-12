/**
 * Loads the real plugin (src/plugin/main.ts) against a stub `obsidian` module
 * and an in-memory vault that implements the public Obsidian APIs production
 * uses. Every vault/adapter write API is recorded in `app.writes`, so tests
 * can prove that nothing was written.
 *
 * The search worker is the real built worker (dist/kosmos-personal-search-
 * worker.txt) on node:worker_threads. The global `Worker` stand-in checks that
 * the Blob URL production created is still live, so revocation is observable.
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolveObjectURL } from "node:buffer";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFrontmatter } from "../../dist/kosmos-core.mjs";
import { NodeWorkerLike } from "./node-search-worker.mjs";

const obsidianStub = `
export const notices = [];
export class Notice { constructor(message) { notices.push(String(message)); } }
export class ItemView { constructor(leaf) { this.app = leaf.app; this.containerEl = { offsetParent: {}, empty() {}, addClass() {} }; this.contentEl = this.containerEl; } registerDomEvent() {} }
export class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; } }
export class Modal { constructor(app) { this.app = app; } open() {} close() {} }
export class Setting {}
export class Plugin {
  constructor(app, manifest) { this.app = app; this.manifest = manifest; this.registered = { events: [], intervals: [], views: [], commands: [] }; }
  async loadData() { return this.app.persisted === undefined ? null : structuredClone(this.app.persisted); }
  async saveData(data) { this.app.saved.push(JSON.parse(JSON.stringify(data))); }
  registerView(type) { this.registered.views.push(type); }
  registerEvent(ref) { this.registered.events.push(ref); }
  registerInterval(id) { this.registered.intervals.push(id); return id; }
  addSettingTab() {} addRibbonIcon() {}
  addCommand(command) { this.registered.commands.push(command.id); }
}
export class TFile {} export class TFolder {} export class WorkspaceLeaf {}
export const Platform = {}; export const normalizePath = (p) => p; export const requestUrl = async () => ({ status: 200, text: "", json: {} });
export const parseYaml = (text) => globalThis.__kosmosParseYaml(text);
`;

const entry = `
export { default as KosmosOdenPlugin, KosmosView } from "./src/plugin/main.ts";
export { buildNoteMeta, isPhysicallyContained, strictYaml } from "./src/plugin/personal-source.ts";
export { PersonalDeviceState, deviceNamespace } from "./src/plugin/personal-runtime.ts";
export { notices } from "obsidian";
`;

const bundled = await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false,
  loader: { ".html": "text", ".txt": "text" },
  plugins: [{ name: "obsidian-stub", setup(p) {
    p.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian-stub", namespace: "stub" }));
    p.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: obsidianStub, loader: "js" }));
  } }],
});
// Desktop Obsidian exposes Node's require; esbuild's ESM `__require` shim picks up a global one at load.
const require = createRequire(import.meta.url);
globalThis.require = require;
globalThis.window = { setTimeout, clearTimeout, setInterval, clearInterval, require };
export const mod = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);

/** Test YAML parser: the Engine's parser, made strict for the marker "!!broken" (Obsidian's parseYaml is strict). */
export const testYaml = (text) => {
  if (text.includes("!!broken")) throw new Error("bad indentation of a mapping entry");
  return parseFrontmatter(`---\n${text}\n---\n`).data;
};
globalThis.__kosmosParseYaml = testYaml;

/** Dedicated-worker stand-in over node:worker_threads; refuses a revoked Blob URL like a browser would. */
export const workers = [];
globalThis.Worker = class extends NodeWorkerLike {
  constructor(url) {
    if (!resolveObjectURL(String(url))) throw new Error("worker script URL is not a live Blob URL");
    super();
    this.url = String(url);
    workers.push(this);
  }
};

const baseName = (p) => p.slice(p.lastIndexOf("/") + 1).replace(/\.md$/, "");
const extension = (p) => { const n = p.slice(p.lastIndexOf("/") + 1); const i = n.lastIndexOf("."); return i > 0 ? n.slice(i + 1) : ""; };

/**
 * In-memory Obsidian App. `files`: path -> text (".md" notes or any other file).
 * `persisted`: what loadData() returns (undefined = fresh install).
 */
export function makeApp(files, { persisted = {}, secretStorage = true, localStorage = new Map(), vaultName = "Fixture", basePath } = {}) {
  const store = new Map();
  const objs = new Map();
  const handlers = { vault: [], metadata: [] };
  const layout = [];
  const writes = [];
  const adapterFiles = new Map();
  const dirs = new Set();
  const secrets = new Map();
  let clock = 1_700_000_000_000;
  const put = (path, text) => {
    store.set(path, text);
    const prev = objs.get(path);
    const stat = { ctime: prev?.stat.ctime ?? clock, mtime: ++clock, size: Buffer.byteLength(text) };
    const obj = prev ?? { path, name: path.slice(path.lastIndexOf("/") + 1), basename: baseName(path), extension: extension(path), stat };
    obj.stat = stat;
    objs.set(path, obj);
    return obj;
  };
  for (const [path, text] of Object.entries(files)) put(path, text);
  const emit = (event, ...args) => { for (const h of handlers.vault.filter((h) => h.event === event)) h.callback(...args); };
  const notes = () => [...objs.values()].filter((f) => f.extension === "md");
  const dest = (linkpath, from) => {
    if (objs.has(linkpath)) return objs.get(linkpath);
    if (objs.has(`${linkpath}.md`)) return objs.get(`${linkpath}.md`);
    return [...objs.values()].find((f) => f.basename === linkpath || f.name === linkpath) ?? null;
  };

  const app = {
    persisted, saved: [], writes, store, adapterFiles, secrets, localStorage, layout, handlers,
    vault: {
      configDir: ".obsidian",
      getName: () => vaultName,
      adapter: {
        getBasePath: () => basePath ?? (app._base ??= mkdtempSync(join(tmpdir(), "kosmos-vault-"))),
        exists: async (p) => adapterFiles.has(p) || dirs.has(p) || store.has(p),
        mkdir: async (p) => { writes.push(["adapter.mkdir", p]); dirs.add(p); },
        write: async (p, data) => { writes.push(["adapter.write", p]); adapterFiles.set(p, data); },
        writeBinary: async (p) => { writes.push(["adapter.writeBinary", p]); },
        stat: async () => ({}),
      },
      on: (event, callback) => { const ref = { event, callback }; handlers.vault.push(ref); return ref; },
      getMarkdownFiles: () => notes(),
      getFiles: () => [...objs.values()],
      getAbstractFileByPath: (p) => objs.get(p) ?? null,
      cachedRead: async (f) => { if (!store.has(f.path)) throw new Error("ENOENT"); return store.get(f.path); },
      read: async (f) => { if (!store.has(f.path)) throw new Error("ENOENT"); return store.get(f.path); },
      readBinary: async (f) => Buffer.from(store.get(f.path) ?? ""),
      process: async (f, fn) => {
        writes.push(["vault.process", f.path]);
        const next = fn(store.get(f.path));
        if (next !== store.get(f.path)) { put(f.path, next); setImmediate(() => emit("modify", objs.get(f.path))); }
        return next;
      },
      modify: async (f) => { writes.push(["vault.modify", f.path]); },
      create: async (p) => { writes.push(["vault.create", p]); },
      createFolder: async (p) => { writes.push(["vault.createFolder", p]); },
      delete: async (f) => { writes.push(["vault.delete", f.path]); },
      rename: async (f) => { writes.push(["vault.rename", f.path]); },
    },
    metadataCache: {
      on: (event, callback) => { const ref = { event, callback }; handlers.metadata.push(ref); return ref; },
      getCache: (path) => {
        const raw = store.get(path);
        if (raw === undefined) return null;
        const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
        const links = [], embeds = [], tags = [];
        for (const m of body.matchAll(/(!?)\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) (m[1] ? embeds : links).push({ link: m[2] });
        for (const m of body.matchAll(/(?:^|\s)(#[\p{L}\p{N}_/-]+)/gu)) tags.push({ tag: m[1] });
        return { links, embeds, tags };
      },
      getFirstLinkpathDest: (linkpath, from) => dest(linkpath, from),
    },
    workspace: {
      on: () => ({}),
      onLayoutReady: (callback) => layout.push(callback),
      getLeavesOfType: () => [],
      getActiveFile: () => null,
    },
    fileManager: { processFrontMatter: async (f) => { writes.push(["fileManager.processFrontMatter", f.path]); } },
    loadLocalStorage: (key) => (localStorage.has(key) ? localStorage.get(key) : null),
    saveLocalStorage: (key, value) => { if (value == null) localStorage.delete(key); else localStorage.set(key, value); },
    /* Test controls (not Obsidian API). */
    edit(path, text) { const created = !objs.has(path); const f = put(path, text); emit(created ? "create" : "modify", f); },
    layoutReady() { for (const cb of layout.splice(0)) cb(); },
  };
  if (secretStorage) app.secretStorage = { getSecret: (id) => secrets.get(id) ?? null, setSecret: (id, v) => { secrets.set(id, v); }, listSecrets: () => [...secrets.keys()] };
  return app;
}

/** Construct and load the plugin over `app`; returns it after onload. */
export async function loadPlugin(app, { id = "kosmos-oden" } = {}) {
  const plugin = new mod.KosmosOdenPlugin(app, { id, dir: `.obsidian/plugins/${id}`, version: "0.9.0" });
  await plugin.onload();
  return plugin;
}

/** onunload plus what Obsidian's Component does for registered intervals. */
export function unloadPlugin(plugin) {
  plugin.onunload();
  for (const id of plugin.registered.intervals) clearInterval(id);
}

/** Wait until the corpus is built and the worker holds it. */
export async function indexed(plugin) {
  const runtime = plugin.personal;
  await runtime.corpus.whenIdle();
  await runtime.search.whenApplied();
}

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
