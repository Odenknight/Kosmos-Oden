import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const obsidianStub = `
export class ItemView { constructor(leaf) { this.app = leaf.app; this.containerEl = { offsetParent: {}, empty() {}, addClass() {} }; this.contentEl = this.containerEl; } registerDomEvent() {} }
export class Notice {} export class Plugin {} export class PluginSettingTab {} export class Modal {} export class Setting {} export class TFile {} export class TFolder {} export class WorkspaceLeaf {} export class FileSystemAdapter {}
export const Platform = {}; export const normalizePath = (p) => p; export const requestUrl = async () => ({ status: 200, text: "", json: {} });
`;
const bundled = await build({
  entryPoints: ["src/plugin/main.ts"], bundle: true, platform: "node", format: "esm", write: false,
  loader: { ".html": "text" },
  plugins: [{ name: "obsidian-stub", setup(p) {
    p.onLoad({ filter: /kosmos-embed\.html$/ }, () => ({ contents: Buffer.from("<!doctype html><title>Lifecycle fixture</title>").toString("base64"), loader: "text" }));
    p.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian-stub", namespace: "stub" }));
    p.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: obsidianStub, loader: "js" }));
  } }],
});
const { KosmosView } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
globalThis.window = { setTimeout, clearTimeout };

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("pop-out visibility follows the view document instead of the main window", () => {
  const previous = globalThis.document;
  const view = new KosmosView({ app: {} }, () => true);
  try {
    globalThis.document = { visibilityState: "hidden" };
    view.containerEl.ownerDocument = { visibilityState: "visible" };
    assert.equal(view.isVisible(), true);
    globalThis.document.visibilityState = "visible";
    view.containerEl.ownerDocument.visibilityState = "hidden";
    assert.equal(view.isVisible(), false);
    view.containerEl.ownerDocument.visibilityState = "visible";
    view.containerEl.offsetParent = null;
    assert.equal(view.isVisible(), false);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test("pop-out frame and message listener belong to the view window", async () => {
  const view = new KosmosView({ app: {} }, () => true);
  const ownerWindow = {};
  const frame = { setAttribute() {}, addEventListener() {} };
  view.contentEl.ownerDocument = { defaultView: ownerWindow, createElement: () => frame };
  view.contentEl.appendChild = element => assert.equal(element, frame);
  const listeners = [];
  view.registerDomEvent = (...args) => listeners.push(args);
  await view.onOpen();
  assert.equal(listeners.length, 2);
  assert.equal(listeners[0][0], ownerWindow);
  assert.equal(listeners[0][1], "message");
  const visibility = listeners.find(([, event]) => event === "visibilitychange");
  assert.equal(visibility[0], view.contentEl.ownerDocument);
  const messages = [];
  frame.contentWindow = { postMessage: message => messages.push(message) };
  let resumed = 0;
  view.flushIfDeferred = () => resumed++;
  view.contentEl.ownerDocument.visibilityState = "hidden";
  visibility[2]();
  assert.equal(messages.at(-1).payload.visible, false);
  assert.equal(resumed, 0);
  view.contentEl.ownerDocument.visibilityState = "visible";
  visibility[2]();
  assert.equal(messages.at(-1).payload.visible, true);
  assert.equal(resumed, 1);
});
function deferred() { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
function note(path, content) { return { path, name: path.split("/").at(-1), extension: "md", stat: { size: content.length, mtime: 1, ctime: 1 }, content }; }

test("close/reopen fences stale full read and retries after the shared physical permit settles", async () => {
  const oldRead = deferred();
  const freshRead = deferred();
  const oldFile = note("old.md", "# old");
  // Same path models a reopened view while the prior physical read is still
  // unsettled; the shared registry must refuse the duplicate, then retry it.
  const freshFile = note("old.md", "# fresh");
  let files = [oldFile];
  const vault = {
    getMarkdownFiles: () => [...files], getFiles: () => [...files],
    cachedRead: (f) => f === oldFile ? oldRead.promise : freshRead.promise,
  };
  const app = { vault };
  const view = new KosmosView({ app }, () => true);
  const messages = [];
  const frame1 = { contentWindow: { postMessage: (message) => messages.push(["old", message]) } };
  view.frame = frame1;
  const first = view.sendFull();
  await tick();

  await view.onClose();
  files = [freshFile];
  const frame2 = { contentWindow: { postMessage: (message) => messages.push(["new", message]) } };
  view.frame = frame2;
  try {
    const reopened = view.sendFull();
    await reopened;
    assert.equal(messages.filter(([owner, message]) => owner === "new" && message.type === "vault-snapshot").length, 0);

    oldRead.resolve(oldFile.content);
    await first;
    await tick();
    // The deferred retry is scheduled by the failed reopened sendFull().
    freshRead.resolve(freshFile.content);
    await new Promise((resolve) => setTimeout(resolve, 1600));
    assert.equal(messages.filter(([owner, message]) => owner === "old" && message.type === "vault-snapshot").length, 0, JSON.stringify(messages));
    assert.equal(messages.filter(([owner, message]) => owner === "new" && message.type === "vault-snapshot").length, 1, JSON.stringify(messages));
  } finally {
    oldRead.resolve(oldFile.content);
    freshRead.resolve(freshFile.content);
    await view.onClose();
  }
});
