/**
 * Minimal DOM + `obsidian` stub for Personal Notes UI tests.
 *
 * Implements only the public Obsidian element helpers and components the UI
 * uses (createEl/createDiv/empty/setText/addClass…, Modal, ItemView, Setting
 * with button/toggle/text/textarea/dropdown, FuzzySuggestModal, Notice,
 * Platform, TFile, TFolder). Events bubble through parents so delegated
 * listeners behave as in a browser.
 */
import { build } from "esbuild";

export const dom = { activeElement: null, notices: [], modals: [], suggesters: [], opened: [], clipboard: [], platform: { isDesktopApp: true, isMobile: false, isWin: false } };
globalThis.__fakeDom = dom;
globalThis.window = globalThis;
globalThis.open = (url) => { dom.opened.push(url); };
Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { dom.clipboard.push(text); } } });

export class FakeEl {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parent = null;
    this.attrs = new Map();
    this.classes = new Set();
    this.text = "";
    this.listeners = new Map();
    this.value = "";
    this.disabled = false;
    this.tabIndex = 0;
    this.style = {};
  }
  get classList() { const c = this.classes; return { add: (x) => c.add(x), remove: (x) => c.delete(x), contains: (x) => c.has(x), toggle: (x, on) => (on ?? !c.has(x)) ? c.add(x) : c.delete(x) }; }
  createEl(tag, o = {}) {
    const el = new FakeEl(tag);
    if (typeof o === "string") o = { cls: o };
    for (const c of [o.cls ?? []].flat().join(" ").split(/\s+/).filter(Boolean)) el.classes.add(c);
    if (o.text != null) el.text = String(o.text);
    for (const k of ["type", "href", "placeholder", "value", "title"]) if (o[k] != null) el.setAttribute(k, o[k]);
    for (const [k, v] of Object.entries(o.attr ?? {})) el.setAttribute(k, v);
    el.parent = this;
    this.children.push(el);
    return el;
  }
  createDiv(o) { return this.createEl("div", o); }
  createSpan(o) { return this.createEl("span", o); }
  empty() { for (const c of this.children) c.parent = null; this.children = []; this.text = ""; }
  setText(t) { this.empty(); this.text = String(t); }
  get textContent() { return [this.text, ...this.children.map((c) => c.textContent)].filter(Boolean).join(" "); }
  addClass(...c) { for (const x of c) this.classes.add(x); }
  removeClass(...c) { for (const x of c) this.classes.delete(x); }
  toggleClass(c, on) { if (on) this.classes.add(c); else this.classes.delete(c); }
  hasClass(c) { return this.classes.has(c); }
  setAttribute(k, v) { this.attrs.set(k, String(v)); if (k === "value") this.value = String(v); }
  setAttr(k, v) { this.setAttribute(k, v); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  addEventListener(type, fn) { (this.listeners.get(type) ?? this.listeners.set(type, []).get(type)).push(fn); }
  removeEventListener(type, fn) { const l = this.listeners.get(type); if (l) l.splice(l.indexOf(fn) >>> 0, 1); }
  listenerCount() { let n = 0; for (const l of this.listeners.values()) n += l.length; return n; }
  dispatch(type, init = {}) {
    const ev = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...init };
    for (let n = this; n; n = n.parent) for (const fn of [...(n.listeners.get(type) ?? [])]) fn(ev);
    return ev;
  }
  click() { if (!this.disabled) this.dispatch("click"); }
  key(key) { return this.dispatch("keydown", { key }); }
  focus() { dom.activeElement = this; this.dispatch("focus"); }
  blur() { if (dom.activeElement === this) dom.activeElement = null; this.dispatch("blur"); }
  closest(sel) { const cls = sel.replace(/^\./, ""); for (let n = this; n; n = n.parent) if (n.classes.has(cls)) return n; return null; }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
}

/** Every element under root (root included). */
export function all(root) { const out = []; const walk = (n) => { out.push(n); n.children.forEach(walk); }; walk(root); return out; }
export const byClass = (root, cls) => all(root).filter((n) => n.classes.has(cls));
export function button(root, text) {
  const hit = all(root).filter((n) => n.tagName === "BUTTON" && n.textContent === text);
  if (!hit.length) throw new Error(`no button "${text}" in: ${all(root).filter((n) => n.tagName === "BUTTON").map((n) => n.textContent).join(" | ")}`);
  return hit[0];
}
export const hasButton = (root, text) => all(root).some((n) => n.tagName === "BUTTON" && n.textContent === text);
/** The Setting whose name is `name`. */
export function setting(root, name) {
  const el = all(root).find((n) => n.setting && n.setting.nameEl.textContent === name);
  if (!el) throw new Error(`no setting "${name}"`);
  return el.setting;
}
export const tick = () => new Promise((r) => setImmediate(r));
export async function settle(n = 5) { for (let i = 0; i < n; i++) await tick(); }

const STUB = `
const dom = globalThis.__fakeDom;
const El = dom.FakeEl;
export const Platform = dom.platform;
export class Notice { constructor(message) { dom.notices.push(String(message)); } }
export class TAbstractFile {}
export class TFile extends TAbstractFile { constructor(path) { super(); this.path = path; this.name = path.split("/").pop(); this.extension = this.name.includes(".") ? this.name.split(".").pop() : ""; this.basename = this.name.replace(/\\.[^.]*$/, ""); } }
export class TFolder extends TAbstractFile { constructor(path, children = []) { super(); this.path = path; this.name = path.split("/").pop(); this.children = children; } }
dom.TFile = TFile; dom.TFolder = TFolder;
export class WorkspaceLeaf {}
export class Modal {
  constructor(app) { this.app = app; this.modalEl = new El("div"); this.contentEl = this.modalEl.createDiv(); this.isOpen = false; }
  open() { this.isOpen = true; dom.modals.push(this); this.onOpen?.(); }
  close() { if (!this.isOpen) return; this.isOpen = false; this.onClose?.(); }
}
export class FuzzySuggestModal extends Modal {
  setPlaceholder(p) { this.placeholder = p; }
  open() { dom.suggesters.push(this); }
}
export class ItemView {
  constructor(leaf) { this.leaf = leaf; this.app = leaf.app; this.containerEl = new El("div"); this.contentEl = this.containerEl.createDiv(); this._cleanups = []; }
  registerDomEvent(el, type, fn) { el.addEventListener(type, fn); this._cleanups.push(() => el.removeEventListener(type, fn)); }
  register(fn) { this._cleanups.push(fn); }
  unload() { for (const fn of this._cleanups.splice(0)) fn(); }
}
class Button { constructor(el) { this.buttonEl = el.createEl("button"); }
  setButtonText(t) { this.buttonEl.setText(t); return this; } setCta() { this.buttonEl.addClass("mod-cta"); return this; }
  setWarning() { this.buttonEl.addClass("mod-warning"); return this; } setDisabled(d) { this.buttonEl.disabled = !!d; return this; }
  setTooltip() { return this; } onClick(fn) { this.buttonEl.addEventListener("click", (e) => fn(e)); return this; } }
class Toggle { constructor(el) { this.toggleEl = el.createDiv({ cls: "checkbox-container" }); this.value = false; this.cbs = []; }
  setValue(v) { this.value = !!v; return this; } getValue() { return this.value; } onChange(fn) { this.cbs.push(fn); return this; }
  setDisabled(d) { this.disabled = !!d; return this; } setTooltip() { return this; } set(v) { this.value = v; for (const fn of this.cbs) fn(v); } }
class Text { constructor(el, tag) { this.inputEl = el.createEl(tag); this.cbs = []; }
  setValue(v) { this.inputEl.value = String(v ?? ""); return this; } getValue() { return this.inputEl.value; }
  setPlaceholder(p) { this.inputEl.setAttribute("placeholder", p); return this; } onChange(fn) { this.cbs.push(fn); return this; }
  setDisabled(d) { this.inputEl.disabled = !!d; return this; } type(v) { this.inputEl.value = v; for (const fn of this.cbs) fn(v); } }
class Dropdown { constructor(el) { this.selectEl = el.createEl("select"); this.cbs = []; this.value = ""; }
  addOption(v, label) { this.selectEl.createEl("option", { text: label, value: v }); return this; }
  setValue(v) { this.value = v; return this; } getValue() { return this.value; } onChange(fn) { this.cbs.push(fn); return this; }
  setDisabled() { return this; } select(v) { this.value = v; for (const fn of this.cbs) fn(v); } }
export class Setting {
  constructor(containerEl) {
    this.settingEl = containerEl.createDiv({ cls: "setting-item" });
    this.settingEl.setting = this;
    this.nameEl = this.settingEl.createDiv({ cls: "setting-item-name" });
    this.descEl = this.settingEl.createDiv({ cls: "setting-item-description" });
    this.controlEl = this.settingEl.createDiv({ cls: "setting-item-control" });
    this.components = [];
  }
  setName(t) { this.nameEl.setText(t); return this; } setDesc(t) { this.descEl.setText(t); return this; }
  setClass(c) { this.settingEl.addClass(c); return this; } setHeading() { return this; } setDisabled() { return this; }
  add(c, cb) { this.components.push(c); cb(c); return this; }
  addButton(cb) { return this.add(new Button(this.controlEl), cb); }
  addToggle(cb) { return this.add(new Toggle(this.controlEl), cb); }
  addText(cb) { return this.add(new Text(this.controlEl, "input"), cb); }
  addTextArea(cb) { return this.add(new Text(this.controlEl, "textarea"), cb); }
  addDropdown(cb) { return this.add(new Dropdown(this.controlEl), cb); }
  get toggle() { return this.components.find((c) => c instanceof Toggle); }
  get text() { return this.components.find((c) => c instanceof Text); }
  get dropdown() { return this.components.find((c) => c instanceof Dropdown); }
}
`;
dom.FakeEl = FakeEl;

/** Bundle the Personal Notes UI modules against the stub and import them. */
export async function loadUi() {
  const out = await build({
    stdin: {
      contents: ["connect-ai-modal", "add-notes-modal", "personal-search-view", "tagging-modal", "supersedes-modal", "quick-connect", "semantic-settings"].map((f) => `export * from "./src/ui/${f}.ts";`).join("\n"),
      resolveDir: process.cwd(), loader: "ts",
    },
    bundle: true, platform: "neutral", format: "esm", write: false,
    plugins: [{ name: "obsidian-stub", setup(b) {
      b.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: STUB, loader: "js" }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
}

export function resetDom() {
  dom.activeElement = null;
  for (const k of ["notices", "modals", "suggesters", "opened", "clipboard"]) dom[k].length = 0;
  Object.assign(dom.platform, { isDesktopApp: true, isMobile: false, isWin: false });
}

/** A fake vault + workspace good enough for the UI. */
export function fakeApp(paths = []) {
  const files = paths.map((p) => new dom.TFile(p));
  const opened = [];
  const top = [...new Set(paths.filter((p) => p.includes("/")).map((p) => p.split("/")[0]))].map((name) => new dom.TFolder(name));
  return {
    opened,
    vault: {
      getFiles: () => files,
      getMarkdownFiles: () => files.filter((f) => f.extension === "md"),
      getAbstractFileByPath: (p) => files.find((f) => f.path === p) ?? null,
      getRoot: () => ({ children: top }),
    },
    workspace: { getLeaf: () => ({ openFile: async (f) => { opened.push(f.path); } }) },
    metadataCache: { fileToLinktext: (f) => f.path.replace(/\.md$/, "") },
  };
}

const defaultSettings = () => ({
  includeFolders: [], excludeFolders: [], importFolders: [], importReportPaths: [],
  tagging: { enabled: false, folders: [], timestamps: false, uniqueIds: false, supersession: false, automaticTimestamps: false },
  connection: { bindMode: "localhost", advertisedBaseUrl: "", autoStart: false, acceptOlderMcp: true },
});

/** A fake PersonalPluginHost recording every call. Override any member. */
export function fakeHost(app, overrides = {}) {
  const calls = [];
  const rec = (name, value) => (...args) => { calls.push([name, ...args]); return typeof value === "function" ? value(...args) : value; };
  const state = { activeProfile: "existing", personalNotes: defaultSettings(), port: 4816 };
  const conn = { state: "stopped", bindMode: "localhost", port: 4816, hasToken: true, autoStart: false };
  const host = {
    app, calls, state, conn,
    settings: () => state,
    settingsNotices: () => [],
    setActiveProfile: rec("setActiveProfile", async (p) => { state.activeProfile = p; }),
    updatePersonalNotes: rec("updatePersonalNotes", async (change) => {
      const draft = structuredClone(state.personalNotes);
      change(draft);
      state.personalNotes = draft;
      conn.bindMode = draft.connection.bindMode;
      return { saved: true, rejected: [] };
    }),
    search: rec("search", async () => ({ contract: "kosmos-personal-notes/1", terms: [], total: 0, hits: [], coverage: { state: "ready", searched: 0, omitted: 0 }, corpusRevision: 1 })),
    searchStatus: () => ({ state: "ready", notes: 10, omitted: 0 }),
    onSearchStatus: rec("onSearchStatus", () => () => calls.push(["unsubscribe"])),
    retrySearch: rec("retrySearch"),
    sharedNoteCount: () => 7,
    importer: () => ({ state: "enabled", version: "3.1.17", tested: true }),
    openImporter: rec("openImporter", true),
    pendingImportFolders: () => [],
    importFinished: rec("importFinished", async () => {}),
    personalNotesStatus: rec("personalNotesStatus", async () => ({ importFolders: [], notesPresent: 0, otherFilesPresent: 0, searchable: 0, needsAttentionTotal: 0, needsAttention: [], reports: [] })),
    previewTagging: rec("previewTagging", async () => ({ contract: "kosmos-tagging-plan/1", proposalTimeMs: 1, options: {}, notes: [], findings: [], frozen: {} })),
    applyTagging: rec("applyTagging", async () => ({ written: [], skipped: [], failed: [], ownWrites: [], manifest: null })),
    previewSupersedes: rec("previewSupersedes", async () => ({ check: { ok: false, reason: "unresolved", detail: "no matching note was found" }, plan: null })),
    connection: () => ({ ...conn }),
    connect: rec("connect", async () => { conn.state = "running"; return { ...conn }; }),
    disconnect: rec("disconnect", async () => { conn.state = "stopped"; }),
    rotateToken: rec("rotateToken", async () => {}),
    setAutoStart: rec("setAutoStart", async (on) => { conn.autoStart = on; }),
    reachableAddresses: () => ["192.0.2.10"],
    testConnection: rec("testConnection", async (baseUrl) => ({ ok: true, baseUrl, transport: "streamable-http", protocolVersion: "2026-07-28", steps: [] })),
    connectionToken: () => "t0k3n".repeat(8),
    bridgePath: () => "/home/me/vault/.obsidian/plugins/kosmos-oden/kosmos-mcp-stdio.mjs",
    mcpProtocols: () => ({ http: ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"], stdio: ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] }),
    openPersonalSearch: rec("openPersonalSearch", async () => {}),
    openAddNotes: rec("openAddNotes"),
    openConnectAi: rec("openConnectAi"),
    openTagging: rec("openTagging"),
    openSupersedes: rec("openSupersedes"),
  };
  for (const [k, v] of Object.entries(overrides)) host[k] = typeof v === "function" ? rec(k, v) : v;
  return host;
}
