import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const obsidianStub = `
export class ItemView { constructor(leaf) { this.app = leaf.app; this.containerEl = { offsetParent: {}, empty() {}, addClass() {} }; this.contentEl = this.containerEl; } registerDomEvent() {} }
export class Notice {} export class PluginSettingTab {} export class Modal {} export class Setting {}
export class Plugin { constructor(app) { this.app = app; } async loadData() { return {}; } async saveData() {} registerView() {} registerEvent() {} registerInterval() {} addSettingTab() {} addRibbonIcon() {} addCommand() {} }
export class TFile {} export class TFolder {} export class WorkspaceLeaf {}
export const Platform = {}; export const normalizePath = (p) => p; export const requestUrl = async () => ({ status: 200, text: "", json: {} });
`;
const bundled = await build({
  entryPoints: ["src/plugin/main.ts"], bundle: true, platform: "node", format: "esm", write: false,
  loader: { ".html": "text" },
  plugins: [{ name: "obsidian-stub", setup(p) {
    p.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian-stub", namespace: "stub" }));
    p.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: obsidianStub, loader: "js" }));
  } }],
});
const { default: KosmosOdenPlugin, KosmosView } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
globalThis.window = { setTimeout, clearTimeout, setInterval: () => 0, clearInterval };

test("metadata-only events do not invalidate the source index; vault modify updates provider and view", async () => {
  const handlers = { metadata: [], vault: [] };
  const layoutReady = [];
  const viewCalls = [];
  const fakeView = Object.create(KosmosView.prototype);
  fakeView.noteChanged = (path) => viewCalls.push(path);
  const app = {
    vault: {
      getName: () => "Synthetic",
      on: (event, callback) => { handlers.vault.push({ event, callback }); return callback; },
      adapter: { getBasePath: () => "synthetic" },
    },
    metadataCache: { on: (event, callback) => { handlers.metadata.push({ event, callback }); return callback; } },
    workspace: {
      on: () => () => {},
      onLayoutReady: (callback) => layoutReady.push(callback),
      getLeavesOfType: (type) => type === "kosmos-oden-view" ? [{ view: fakeView }] : [],
    },
  };
  const plugin = new KosmosOdenPlugin(app);
  plugin.agentSettings = { ...plugin.agentSettings, agentEnabled: false, noteTimestampsEnabled: false };
  plugin.app = app;
  await plugin.onload();
  plugin.agentSettings.noteTimestampsEnabled = false;
  const providerCalls = [];
  plugin.provider = { markChanged: (path) => providerCalls.push(["changed", path]), markFullDirty: () => providerCalls.push(["full"]), markRemoved() {}, markRenamed() {} };
  plugin.agentSettings.noteTimestampsEnabled = true;
  try {
    const created = handlers.vault.find((entry) => entry.event === "create").callback;
    created({ path: "existing-at-startup.md", extension: "md" });
    assert.equal(plugin.timestampTimers.size, 0, "startup discovery must not schedule source writes");
  } finally {
    for (const timer of plugin.timestampTimers.values()) clearTimeout(timer);
    plugin.timestampTimers.clear();
    plugin.agentSettings.noteTimestampsEnabled = false;
  }
  for (const callback of layoutReady) callback();
  providerCalls.length = 0;

  const metadataEntry = handlers.metadata.find((entry) => entry.event === "changed");
  const modifyEntry = handlers.vault.find((entry) => entry.event === "modify");
  assert.ok(modifyEntry, JSON.stringify(handlers.vault.map((entry) => entry.event)));
  const modified = modifyEntry.callback;
  if (metadataEntry) metadataEntry.callback({ path: "note.md" });
  assert.deepEqual(providerCalls, [], "metadata cache resolution must not invalidate source text");
  modified({ path: "note.md", extension: "md" });
  assert.deepEqual(providerCalls, [["changed", "note.md"]]);
  assert.deepEqual(viewCalls, ["note.md"]);
});

test("slow timestamp writes do not schedule themselves again when their modify event arrives", async () => {
  let complete;
  const pending = new Promise(resolve => { complete = resolve; });
  const plugin = new KosmosOdenPlugin({ fileManager: { processFrontMatter: () => pending } });
  plugin.eventsLive = true;
  plugin.agentSettings.noteTimestampsEnabled = true;
  const note = { path: "slow.md", extension: "md", stat: { ctime: 1, mtime: 1 } };
  const write = plugin.stampNote(note);
  const realNow = Date.now;
  try {
    const later = realNow() + 3000;
    Date.now = () => later;
    plugin.scheduleTimestamp(note, 10000);
    assert.equal(plugin.timestampTimers.size, 0, "an outstanding write must suppress its own modify event beyond 2.5 seconds");
  } finally {
    Date.now = realNow;
    complete(); await write;
    for (const timer of plugin.timestampTimers.values()) clearTimeout(timer);
    plugin.timestampTimers.clear();
  }
  plugin.timestampWriteUntil.clear();
  plugin.scheduleTimestamp(note, 10000);
  assert.equal(plugin.timestampTimers.size, 1, "later real edits still schedule timestamps");
  for (const timer of plugin.timestampTimers.values()) clearTimeout(timer);
});
