/**
 * The real sync engine (src/plugin/nextcloud-sync.ts) run against an in-memory
 * vault and an in-memory WebDAV server, several runs in a row. The planner
 * tests in nextcloud-sync.test.mjs cover one decision; these cover what a
 * conflict leaves behind from one run to the next.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const obsidianStub = `
export class App {}
export const normalizePath = (p) => p;
export const requestUrl = (request) => globalThis.__nextcloudTestRequest(request);
`;
const bundled = await build({
  stdin: { contents: `export { NextcloudSyncEngine } from "./src/plugin/nextcloud-sync.ts";`, resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent",
  plugins: [{ name: "obsidian-stub", setup(p) {
    p.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian-stub", namespace: "stub" }));
    p.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: obsidianStub, loader: "js" }));
  } }],
});
const { NextcloudSyncEngine } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);

// The engine reads PROPFIND answers with DOMParser. Node has none; this one reads the answers the server below writes.
globalThis.DOMParser = class {
  parseFromString(xml) {
    // Only the innermost elements carry text here, so no markup has to be taken out of it.
    const element = (text) => ({
      textContent: text.includes("<") ? "" : text,
      getElementsByTagNameNS: (_ns, name) => [...text.matchAll(new RegExp(`<d:${name}(?:/>|>([\\s\\S]*?)</d:${name}>)`, "g"))].map((m) => element(m[1] ?? "")),
    });
    return { querySelector: () => null, getElementsByTagNameNS: (ns, name) => element(xml).getElementsByTagNameNS(ns, name) };
  }
};

const SETTINGS = {
  schemaVersion: 2, enabled: true, serverUrl: "https://cloud.example.test", username: "ada", remoteFolder: "Vault",
  syncOnStartup: false, intervalMinutes: 15, propagateDeletes: false, syncObsidianConfig: false, excludePatterns: [".git/**", ".trash/**"],
};
const ROOT = "/remote.php/dav/files/ada/Vault/";
const bytes = (text) => new TextEncoder().encode(text).buffer;
const text = (data) => new TextDecoder().decode(data);
const isCopy = (path) => path.includes(".nextcloud-conflict-");

/** One device and one Nextcloud folder. `local` and `remote` map a path to its text. */
function world({ local = {}, remote = {} } = {}) {
  const localFiles = new Map(Object.entries(local));
  const remoteFiles = new Map(); let etagCounter = 0;
  const putRemote = (path, body) => remoteFiles.set(path, { body, etag: `"e${++etagCounter}"` });
  for (const [path, body] of Object.entries(remote)) putRemote(path, body);
  const requests = [];

  const reply = (status, body = "", headers = {}) => ({ status, text: body, headers, arrayBuffer: bytes(body) });
  globalThis.__nextcloudTestRequest = async ({ url, method, headers = {}, body }) => {
    const pathname = decodeURIComponent(new URL(url).pathname);
    if (!pathname.startsWith(ROOT.slice(0, -1))) return reply(method === "MKCOL" ? 405 : 207);
    const path = pathname.slice(ROOT.length);
    requests.push(`${method} ${path}`);
    if (method === "MKCOL") return reply(405);
    if (method === "PROPFIND") {
      const dir = path && !path.endsWith("/") ? path + "/" : path;
      const children = new Map();
      for (const [file, entry] of remoteFiles) {
        if (!file.startsWith(dir)) continue;
        const rest = file.slice(dir.length); const slash = rest.indexOf("/");
        if (slash < 0) children.set(file, entry); else children.set(dir + rest.slice(0, slash) + "/", null);
      }
      const href = (p) => ROOT + p.split("/").map(encodeURIComponent).join("/");
      const items = [...children].map(([p, entry]) => entry
        ? `<d:response><d:href>${href(p)}</d:href><d:propstat><d:prop><d:resourcetype/><d:getetag>${entry.etag}</d:getetag><d:getcontentlength>${entry.body.length}</d:getcontentlength><d:getlastmodified>Fri, 13 Nov 2026 05:00:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response>`
        : `<d:response><d:href>${href(p)}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>`);
      return reply(207, `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${items.join("")}</d:multistatus>`);
    }
    const current = remoteFiles.get(path);
    if (method === "GET") {
      if (!current) return reply(404);
      if (headers["If-Match"] && headers["If-Match"] !== current.etag) return reply(412);
      return reply(200, current.body);
    }
    if (method === "PUT") {
      if (headers["If-None-Match"] === "*" && current) return reply(412);
      if (headers["If-Match"] && headers["If-Match"] !== current?.etag) return reply(412);
      putRemote(path, typeof body === "string" ? body : text(body));
      return reply(201, "", { ETag: remoteFiles.get(path).etag });
    }
    if (method === "DELETE") { remoteFiles.delete(path); return reply(204); }
    return reply(405);
  };

  const app = { vault: {
    getFiles: () => [...localFiles.keys()].map((path) => ({ path })),
    getAbstractFileByPath: (path) => (localFiles.has(path) ? { path } : null),
    readBinary: async (file) => bytes(localFiles.get(file.path)),
    trash: async (file) => { localFiles.delete(file.path); },
    adapter: {
      exists: async () => true, mkdir: async () => {},
      writeBinary: async (path, data) => { localFiles.set(path, text(data)); },
      readBinary: async (path) => { if (!localFiles.has(path)) throw new Error("ENOENT"); return bytes(localFiles.get(path)); },
      remove: async (path) => { localFiles.delete(path); },
      list: async (dir) => {
        const prefix = dir === "/" ? "" : dir + "/";
        return { files: [...localFiles.keys()].filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/")), folders: [] };
      },
    },
  } };

  let state = { schemaVersion: 3, scope: "https://cloud.example.test" + ROOT, files: {} };
  let clock = Date.parse("2026-11-13T05:00:00.000Z");
  return {
    localFiles, remoteFiles, requests, putRemote,
    get state() { return state; },
    record(path, localHash, remoteEtag) { state.files[path] = { localHash, remoteEtag, remoteMtime: 1, remoteSize: 1, syncedAt: 1 }; },
    localCopies: () => [...localFiles.keys()].filter(isCopy).sort(),
    remoteCopies: () => [...remoteFiles.keys()].filter(isCopy).sort(),
    /** One sync run, fifteen minutes after the last. */
    async run() {
      clock += 15 * 60_000; const now = clock; const RealDate = Date;
      globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } };
      try {
        const engine = new NextcloudSyncEngine(app, SETTINGS, state, "app-password", async (next) => { state = JSON.parse(JSON.stringify(next)); });
        return await engine.run();
      } finally { globalThis.Date = RealDate; }
    },
  };
}

test("a note that differs on the two sides gets one conflict copy, not one on every run", async () => {
  const w = world({ local: { "Notes/Plan.md": "mine" }, remote: { "Notes/Plan.md": "theirs" } });
  const summaries = [];
  for (let i = 0; i < 4; i++) summaries.push(await w.run());
  assert.deepEqual(w.localCopies(), ["Notes/Plan.nextcloud-conflict-2026-11-13T05-15-00-000Z.md"]);
  assert.equal(w.localFiles.get(w.localCopies()[0]), "theirs");
  // Neither side is overwritten while the two disagree, and the copy stays on this device.
  assert.equal(w.localFiles.get("Notes/Plan.md"), "mine");
  assert.equal(w.remoteFiles.get("Notes/Plan.md").body, "theirs");
  assert.deepEqual(w.remoteCopies(), []);
  assert.deepEqual(summaries.map((s) => [s.uploaded, s.downloaded, s.conflicts.length, s.errors.length]), [[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]]);
  assert.match(summaries[0].conflicts[0], /Nextcloud copy saved as Notes\/Plan\.nextcloud-conflict-/);
  assert.match(summaries[3].conflicts[0], /already saved as Notes\/Plan\.nextcloud-conflict-2026-11-13T05-15-00-000Z\.md/);
  // Made the same by hand, the note is recorded and the conflict is over.
  w.localFiles.set("Notes/Plan.md", "theirs");
  const settled = await w.run();
  assert.deepEqual([settled.conflicts.length, Object.keys(w.state.files)], [0, ["Notes/Plan.md"]]);
});

test("a note another program rewrites between runs stops at the copy limit", async () => {
  const w = world({ local: { "Plan.md": "mine" }, remote: { "Plan.md": "theirs 0" } });
  const summaries = [];
  for (let i = 1; i <= 9; i++) { summaries.push(await w.run()); w.putRemote("Plan.md", `theirs ${i}`); }
  assert.equal(w.localCopies().length, 5);
  assert.deepEqual(w.localCopies().map((p) => w.localFiles.get(p)), ["theirs 0", "theirs 1", "theirs 2", "theirs 3", "theirs 4"]);
  assert.match(summaries[8].conflicts[0], /left as it is on both sides: 5 conflict copies of it exist already/);
  assert.equal(w.localFiles.get("Plan.md"), "mine");
  assert.deepEqual(w.remoteCopies(), []);
});

test("edited on both sides since the last sync: the Nextcloud version is kept once, then the local one is uploaded", async () => {
  const w = world({ local: { "Plan.md": "mine, edited" }, remote: { "Plan.md": "theirs, edited" } });
  w.record("Plan.md", "hash-of-the-last-common-version", '"e0"');
  const first = await w.run();
  assert.deepEqual([first.uploaded, first.conflicts.length, first.errors], [1, 1, []]);
  assert.equal(w.remoteFiles.get("Plan.md").body, "mine, edited");
  assert.deepEqual(w.localCopies().map((p) => w.localFiles.get(p)), ["theirs, edited"]);
  const second = await w.run();
  assert.deepEqual([second.uploaded, second.downloaded, second.conflicts, second.unchanged], [0, 0, [], 1]);
  assert.equal(w.localCopies().length, 1);
});

test("edited on both sides with five copies kept already: nothing is uploaded over a version that was not saved", async () => {
  const copies = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`Plan.nextcloud-conflict-2026-11-12T0${n}-00-00-000Z.md`, `older ${n}`]));
  const w = world({ local: { "Plan.md": "mine, edited", ...copies }, remote: { "Plan.md": "theirs, new" } });
  w.record("Plan.md", "hash-of-the-last-common-version", '"e0"');
  const blocked = await w.run();
  assert.deepEqual([blocked.uploaded, blocked.errors], [0, []]);
  assert.match(blocked.conflicts[0], /left as it is on both sides/);
  assert.equal(w.remoteFiles.get("Plan.md").body, "theirs, new");
  assert.equal(w.localFiles.get("Plan.md"), "mine, edited");
  assert.equal(w.localCopies().length, 5);
  // A version that is among the copies is safe to replace.
  w.putRemote("Plan.md", "older 3");
  const allowed = await w.run();
  assert.deepEqual([allowed.uploaded, allowed.errors], [1, []]);
  assert.match(allowed.conflicts[0], /already saved as Plan\.nextcloud-conflict-2026-11-12T03-00-00-000Z\.md/);
  assert.equal(w.remoteFiles.get("Plan.md").body, "mine, edited");
  assert.equal(w.localCopies().length, 5);
});

test("conflict copies an earlier build synced are left alone on both sides", async () => {
  const onBoth = "Plan.nextcloud-conflict-2026-11-13T05-14-44-594Z.md";
  const onlyRemote = "Notes/Plan.nextcloud-conflict-2026-11-13T06-34-19-142Z.md";
  const onlyLocal = "Plan.nextcloud-conflict-2026-11-14T04-25-21-523Z.md";
  const w = world({ local: { "Plan.md": "same", [onBoth]: "old", [onlyLocal]: "old 2" }, remote: { "Plan.md": "same", [onBoth]: "old", [onlyRemote]: "old 3" } });
  w.record(onBoth, "a-recorded-hash", '"e2"');
  const summary = await w.run();
  assert.deepEqual([summary.uploaded, summary.downloaded, summary.deletedLocal, summary.deletedRemote, summary.conflicts, summary.errors], [0, 0, 0, 0, [], []]);
  assert.deepEqual([...w.localFiles.keys()].sort(), ["Plan.md", onBoth, onlyLocal].sort());
  assert.deepEqual([...w.remoteFiles.keys()].sort(), ["Plan.md", onBoth, onlyRemote].sort());
  assert.deepEqual(Object.keys(w.state.files), ["Plan.md"]);
  assert.deepEqual(w.requests.filter((r) => /^(GET|PUT|DELETE) .*nextcloud-conflict/.test(r)), []);
});
