/**
 * Personal Notes UI behavior against a fake PersonalPluginHost and the stub
 * `obsidian` module in test/helpers/ui-harness.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { all, button, byClass, dom, fakeApp, fakeHost, hasButton, loadUi, resetDom, setting, settle } from "./helpers/ui-harness.mjs";

const ui = await loadUi();
const text = (el) => el.textContent;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const hit = (path, extra = {}) => ({ path, title: path.split("/").pop().replace(/\.md$/, ""), score: 1, matchedIn: ["body"], excerpt: `excerpt of ${path}`, ...extra });
const response = (hits, total = hits.length, coverage = { state: "ready", searched: 10, omitted: 0 }) => ({ contract: "kosmos-personal-notes/1", terms: [], total, hits, coverage, corpusRevision: 1 });

async function openSearch(host) {
  const view = new ui.PersonalSearchView({ app: host.app }, host);
  await view.onOpen();
  const input = all(view.contentEl).find((n) => n.tagName === "INPUT");
  const list = byClass(view.contentEl, "kosmos-notes-search-results")[0];
  return { view, input, list };
}
async function search(input, query) { input.value = query; input.key("Enter"); await settle(); }

/* ------------------------------------------------------------------ search */

test("search: index status for indexing, partial and failed (with Retry); subscription is released on unload", async () => {
  resetDom();
  let status = { state: "indexing", notes: 40, omitted: 0 };
  let listener = null;
  const host = fakeHost(fakeApp(), { searchStatus: () => status, onSearchStatus: (fn) => { listener = fn; return () => { listener = null; }; } });
  const { view } = await openSearch(host);
  const index = byClass(view.contentEl, "kosmos-notes-search-index")[0];
  assert.match(text(index), /Reading your notes… 40 so far/);
  assert.match(text(view.contentEl), /whole vault/);
  assert.match(text(view.contentEl), /Assistants can read only the Folders shared with agents/);

  status = { state: "partial", notes: 98, omitted: 2 };
  listener();
  assert.match(text(index), /98 notes searchable\. 2 files were skipped/);

  status = { state: "failed", notes: 0, omitted: 0, error: "worker crashed" };
  listener();
  assert.match(text(index), /Search stopped working: worker crashed/);
  button(index, "Retry").click();
  assert.ok(host.calls.some(([n]) => n === "retrySearch"));

  view.unload();
  assert.equal(listener, null, "status listener removed on unload");
});

test("search: each keystroke aborts the previous request and stale results are dropped", async () => {
  resetDom();
  const pending = [];
  const host = fakeHost(fakeApp(), { search: (query, opts) => { const d = deferred(); pending.push({ query, opts, d }); return d.promise; } });
  const { input, view } = await openSearch(host);
  input.value = "first"; input.key("Enter"); await settle();
  assert.equal(pending.length, 1);
  input.value = "second"; input.dispatch("input");
  assert.equal(pending[0].opts.signal.aborted, true, "typing aborts the in-flight search at once");
  await wait(300);
  assert.equal(pending.length, 2, "debounced search ran");
  assert.equal(pending[1].query, "second");
  pending[0].d.resolve(response([hit("Stale.md")]));
  pending[1].d.resolve(response([hit("Fresh.md")]));
  await settle();
  const rows = byClass(view.contentEl, "kosmos-notes-search-row");
  assert.deepEqual(rows.map((r) => byClass(r, "kosmos-notes-search-path")[0].textContent), ["Fresh.md"]);
  assert.equal(pending[1].opts.limit, 50);
});

test("search: results show original excerpts, field hints and shown-of-total; keyboard navigation opens and returns", async () => {
  resetDom();
  const app = fakeApp(["Notes/One.md", "Notes/Two.md"]);
  const host = fakeHost(app, { search: async () => response([hit("Notes/One.md", { excerpt: "İSTANBUL MixedCASE", matchedIn: ["title", "body"] }), hit("Notes/Two.md")], 5, { state: "ready", searched: 10, omitted: 1 }) });
  const { view, input, list } = await openSearch(host);
  await search(input, "istanbul");
  const summary = byClass(view.contentEl, "kosmos-notes-search-status")[0];
  assert.match(text(summary), /Showing 2 of 5 notes found\. 1 file was not searched/);
  const rows = byClass(list, "kosmos-notes-search-row");
  assert.equal(rows[0].getAttribute("role"), "option");
  assert.equal(list.getAttribute("role"), "listbox");
  assert.match(text(rows[0]), /İSTANBUL MixedCASE/, "excerpt is shown as the source spelled it");
  assert.match(text(rows[0]), /Found in: title, text/);

  input.key("ArrowDown");
  assert.equal(dom.activeElement, rows[0]);
  assert.equal(rows[0].getAttribute("aria-selected"), "true");
  rows[0].key("ArrowDown");
  assert.equal(dom.activeElement, rows[1]);
  rows[1].key("Enter");
  await settle();
  assert.deepEqual(app.opened, ["Notes/Two.md"]);
  rows[1].key("Escape");
  assert.equal(dom.activeElement, input, "Escape returns to the search box");
  input.key("ArrowDown");
  rows[0].key("ArrowUp");
  assert.equal(dom.activeElement, input, "ArrowUp from the first result returns to the box");
  byClass(rows[0], "kosmos-notes-search-snippet")[0].click();
  await settle();
  assert.deepEqual(app.opened, ["Notes/Two.md", "Notes/One.md"], "clicking inside a row opens it");
});

test("search: re-rendering results does not accumulate event listeners", async () => {
  resetDom();
  let n = 0;
  const host = fakeHost(fakeApp(), { search: async () => response(Array.from({ length: 20 }, (_, i) => hit(`N/${n}-${i}.md`))) });
  const { view, input } = await openSearch(host);
  const count = () => all(view.contentEl).reduce((sum, el) => sum + el.listenerCount(), 0);
  await search(input, "a"); n++;
  const first = count();
  for (let i = 0; i < 5; i++) { await search(input, `a${i}`); n++; }
  assert.equal(count(), first, "listener total is constant across renders");
  assert.equal(byClass(view.contentEl, "kosmos-notes-search-row").reduce((s, r) => s + r.listenerCount(), 0), 0, "rows carry no listeners of their own");
});

test("search: invalid queries get plain explanations; other failures are shown", async () => {
  resetDom();
  const fail = (code, message) => Object.assign(new Error(message), { code });
  let error = fail("invalid_query", "unclosed quote");
  const host = fakeHost(fakeApp(), { search: async () => { throw error; } });
  const { view, input } = await openSearch(host);
  const summary = () => text(byClass(view.contentEl, "kosmos-notes-search-status")[0]);
  await search(input, '"open phrase');
  assert.match(summary(), /quotation mark is not closed/);
  error = fail("invalid_query", "query too long");
  await search(input, "x".repeat(501));
  assert.match(summary(), /too long\. Use at most 500 characters/);
  error = fail("invalid_query", "too many terms");
  await search(input, Array.from({ length: 17 }, (_, i) => `w${i}`).join(" "));
  assert.match(summary(), /Too many words\. Use at most 16/);
  error = fail("search_unavailable", "worker stopped");
  await search(input, "plumber");
  assert.match(summary(), /Search is not available right now/);
  error = Object.assign(new Error("aborted"), { name: "AbortError" });
  await search(input, "quiet");
  assert.match(summary(), /Searching…/, "an aborted search shows no error");
  assert.equal(ui.invalidQueryMessage("ok", "x"), "This search could not be run: x");
});

/* ----------------------------------------------------------------- connect */

function openConnect(host) {
  const modal = new ui.ConnectAiModal(host);
  modal.open();
  return modal;
}

test("connect: mobile shows a clear desktop-only message and nothing else", () => {
  resetDom();
  dom.platform.isDesktopApp = false;
  const modal = openConnect(fakeHost(fakeApp()));
  assert.match(text(modal.contentEl), /needs Obsidian on a desktop computer/);
  assert.doesNotMatch(text(modal.contentEl), /Folders shared with agents/);
  assert.equal(hasButton(modal.contentEl, "Connect"), false);
});

test("connect: rejected folders are shown, / in Never share is kept and its consequence is stated", async () => {
  resetDom();
  const app = fakeApp(["Journal/a.md", "Import/b.md"]);
  let saved = null;
  const host = fakeHost(app, { updatePersonalNotes: async (change) => {
    const d = structuredClone(host.state.personalNotes); change(d); saved = d;
    return { saved: false, rejected: [{ index: 1, value: "../Private", reason: "dot_segment" }] };
  } });
  const modal = openConnect(host);
  setting(modal.contentEl, "Import").toggle.set(true);
  assert.equal(byClass(modal.contentEl, "kosmos-selection-warning")[0].textContent, "");
  setting(modal.contentEl, "Never share").text.type("/\n../Private\n  Journal  ");
  assert.match(text(modal.contentEl), /excludes everything: assistants can read no notes/);
  button(modal.contentEl, "Save shared folders").click();
  await settle();
  assert.deepEqual(saved.includeFolders, ["Import"]);
  assert.deepEqual(saved.excludeFolders, ["/", "../Private", "Journal"], "/ is passed through, invalid lines are not dropped silently");
  assert.match(text(modal.contentEl), /“\.\.\/Private” was not saved: it contains \. or \.\./);
  assert.doesNotMatch(text(modal.contentEl), /Saved\./, "nothing claims to be saved when the plugin refused");
});

test("connect: Connect awaits the real result and shows a port-in-use error", async () => {
  resetDom();
  const host = fakeHost(fakeApp(), { connect: async () => ({ state: "error", bindMode: "localhost", port: 4816, hasToken: true, autoStart: false, error: "port 4816 is already in use" }) });
  host.connection = () => ({ ...host.conn, state: host.conn.state });
  const modal = openConnect(host);
  button(modal.contentEl, "Connect").click();
  assert.match(text(modal.contentEl), /Starting…/);
  await settle();
  assert.match(text(modal.contentEl), /port 4816 is already in use/);
  setting(modal.contentEl, "Start when Obsidian opens").toggle.set(true);
  await settle();
  assert.ok(host.calls.some(([n, v]) => n === "setAutoStart" && v === true));
  setting(modal.contentEl, "Accept older MCP clients").toggle.set(false);
  await settle();
  assert.equal(host.state.personalNotes.connection.acceptOlderMcp, false);
});

test("connect: test steps, protocol and transport are rendered with the route caveat", async () => {
  resetDom();
  const host = fakeHost(fakeApp(), { testConnection: async (baseUrl) => ({
    ok: false, baseUrl, transport: "streamable-http", protocolVersion: "2025-11-25",
    steps: [
      { name: "authenticate", ok: true, detail: "key accepted" },
      { name: "open", ok: true, detail: "initialize 2025-11-25" },
      { name: "list_tools", ok: true, detail: "5 tools" },
      { name: "search", ok: false, detail: "no shared notes" },
    ] }) });
  host.conn.state = "running";
  const modal = openConnect(host);
  button(modal.contentEl, "Test connection").click();
  await settle();
  assert.deepEqual(host.calls.find(([n]) => n === "testConnection").slice(1, 2), ["http://127.0.0.1:4816"]);
  const steps = all(modal.contentEl).filter((n) => n.getAttribute("data-step"));
  assert.deepEqual(steps.map((s) => s.getAttribute("data-step")), ["authenticate", "open", "list_tools", "search"]);
  assert.match(text(steps[3]), /Search: failed — no shared notes/);
  assert.match(text(modal.contentEl), /Streamable HTTP · MCP 2025-11-25/);
  assert.match(text(modal.contentEl), /cannot prove that another computer's firewall or network route/);
});

test("connect: another computer shows the chosen address before copying; loopback and wildcard are refused", async () => {
  resetDom();
  const host = fakeHost(fakeApp());
  host.state.personalNotes.connection.bindMode = "lan";
  host.conn.bindMode = "lan";
  const modal = openConnect(host);
  setting(modal.contentEl, "Where does the assistant run?").dropdown.select("another-computer");
  const endpoint = () => text(byClass(modal.contentEl, "kosmos-quick-connect-endpoint")[0]);
  assert.equal(endpoint(), "The assistant will connect to: http://192.0.2.10:4816/mcp");
  assert.match(text(modal.contentEl), /Plain http:\/\/ is not encrypted/);
  assert.match(text(modal.contentEl), /does not change your firewall or router/);
  const token = host.connectionToken();
  assert.ok(!text(modal.contentEl).includes(token), "the key is never rendered");
  button(modal.contentEl, "Copy configuration").click();
  await settle();
  assert.ok(dom.clipboard[0].includes("http://192.0.2.10:4816/mcp") && dom.clipboard[0].includes(token));

  const addr = setting(modal.contentEl, "Address of this computer");
  addr.dropdown.select("__custom");
  setting(modal.contentEl, "Address of this computer").text.type("127.0.0.1");
  assert.match(endpoint(), /always mean the assistant's own computer/);
  setting(modal.contentEl, "Address of this computer").text.type("0.0.0.0");
  assert.match(endpoint(), /0\.0\.0\.0 is where a server listens/);
  assert.equal(all(modal.contentEl).filter((n) => n.tagName === "BUTTON" && n.textContent === "Copy configuration").every((b) => b.disabled), true);

  setting(modal.contentEl, "Address of this computer").text.type("vpn-host.example.lan");
  setting(modal.contentEl, "Connection type").dropdown.select("stdio");
  assert.match(text(modal.contentEl), /Path of kosmos-mcp-stdio\.mjs on the other computer/);
  assert.match(text(modal.contentEl), /Enter the full path of kosmos-mcp-stdio\.mjs on the assistant's computer/, "the local Obsidian path is never offered for a remote bridge");
});

/* --------------------------------------------------------------- add notes */

test("add notes: choosing a source changes no profile; Open Importer saves the folder or shows the palette fallback", async () => {
  resetDom();
  const host = fakeHost(fakeApp(), { openImporter: () => false });
  const modal = new ui.AddNotesModal(host);
  modal.open();
  assert.match(text(modal.contentEl), /Switching to the Personal Notes profile changes only what a connected assistant can read/);
  const keep = setting(modal.contentEl, "Google Keep");
  button(keep.settingEl, "Official guide").click();
  assert.deepEqual(dom.opened, ["https://obsidian.md/help/import/google-keep"]);
  button(keep.settingEl, "Choose").click();
  assert.equal(host.calls.some(([n]) => n === "setActiveProfile"), false, "choosing a source never switches profile");
  assert.match(text(modal.contentEl), /Skip existing notes/);
  assert.match(text(modal.contentEl), /new, empty folder/);
  button(modal.contentEl, "Open Importer").click();
  await settle();
  assert.deepEqual(host.state.personalNotes.importFolders, ["Import/Google Keep"]);
  assert.ok(host.calls.some(([n, f]) => n === "openImporter" && f === "Import/Google Keep"));
  assert.match(text(modal.contentEl), /could not be opened from here\. Open the command palette/);
  assert.equal(modal.isOpen, true);

  setting(modal.contentEl, "Destination folder").text.type("/");
  button(modal.contentEl, "Open Importer").click();
  await settle();
  assert.match(text(modal.contentEl), /Enter a folder inside the vault/);
});

test("add notes: Importer missing, untested or unreadable gives guidance, never a crash", () => {
  resetDom();
  const host = fakeHost(fakeApp());
  host.importer = () => ({ state: "missing", version: null, tested: false });
  assert.match(ui.importerGuidance(host).text, /not installed/);
  host.importer = () => ({ state: "enabled", version: "3.2.0", tested: false });
  assert.match(ui.importerGuidance(host).text, /checked with version 3\.1\.17/);
  host.importer = () => { throw new Error("internals changed"); };
  assert.match(ui.importerGuidance(host).text, /Could not check/);
  const modal = new ui.AddNotesModal(host);
  modal.open();
  button(setting(modal.contentEl, "OneNote: exported files").settingEl, "Choose").click();
  assert.match(text(modal.contentEl), /Could not check whether the Importer/);
  assert.match(text(modal.contentEl), /kept as a drawing only; Kosmos-Oden does not transcribe it/, "ink is not described as transcription");
});

test("add notes: review uses honest wording, report selection works for any file, Import finished is explicit", async () => {
  resetDom();
  const app = fakeApp(["Import/Keep/a.md", "Import/Keep/Rapport d'importation.md"]);
  const host = fakeHost(app, {
    personalNotesStatus: async () => ({ importFolders: ["Import/Keep"], notesPresent: 3, otherFilesPresent: 2, searchable: 2, needsAttentionTotal: 1, needsAttention: ["Import/Keep/pic.md"],
      reports: host.state.personalNotes.importReportPaths.map((path) => ({ path, present: true })) }),
    pendingImportFolders: () => (finished ? [] : ["Import/Keep"]),
  });
  let finished = false;
  host.importFinished = async (folder) => { host.calls.push(["importFinished", folder]); finished = true; };
  const modal = new ui.AddNotesModal(host);
  modal.open();
  button(modal.contentEl, "Review results").click();
  await settle();
  const body = text(modal.contentEl);
  assert.match(body, /Files present: 3 notes and 2 other files/);
  assert.match(body, /not what the last import created/);
  assert.match(body, /skipped or could not convert: unknown to Kosmos-Oden/);
  assert.doesNotMatch(body, /\bimported: \d/i);

  button(modal.contentEl, "Select the Importer report").click();
  const picker = dom.suggesters.at(-1);
  assert.ok(picker.getItems().some((f) => f.path === "Import/Keep/Rapport d'importation.md"), "any vault file can be chosen, in any language");
  picker.onChooseItem(picker.getItems().find((f) => f.path.includes("Rapport")));
  await settle();
  assert.deepEqual(host.state.personalNotes.importReportPaths, ["Import/Keep/Rapport d'importation.md"]);
  button(setting(modal.contentEl, "Import/Keep/Rapport d'importation.md").settingEl, "Open").click();
  await settle();
  assert.deepEqual(app.opened, ["Import/Keep/Rapport d'importation.md"]);

  modal.open(); // reopens on the review step
  await settle();
  button(modal.contentEl, "Import finished — review tags").click();
  await settle();
  assert.ok(host.calls.some(([n, f]) => n === "importFinished" && f === "Import/Keep"));
  assert.equal(hasButton(modal.contentEl, "Import finished — review tags"), false);
});

/* ----------------------------------------------------------------- tagging */

const plan = () => ({
  contract: "kosmos-tagging-plan/1", proposalTimeMs: 1, options: { timestamps: true, uniqueIds: true, supersession: false },
  notes: [
    { path: "Notes/a.md", originalHash: "h1", changes: [{ op: "setScalar", key: "uid", value: "u" }], proposedRaw: "---\nuid: u\n---\nA", previewBefore: "", previewAfter: "uid: u", reasons: ["uid: new identity (UUIDv7)"], skips: [] },
    { path: "Notes/b.md", originalHash: "h2", changes: [{ op: "setScalar", key: "created_at", value: "t" }], proposedRaw: "---\ncreated_at: t\n---\nB", previewBefore: "title: B", previewAfter: "title: B\ncreated_at: t", reasons: ["created_at: from file creation time"], skips: [] },
    { path: "Notes/c.md", originalHash: "h3", changes: [], proposedRaw: null, previewBefore: "", previewAfter: "", reasons: [], skips: [] },
  ],
  findings: [{ kind: "duplicate_uid", uid: "019a72b0-0000-7000-8000-000000000001", paths: ["Notes/x.md", "Notes/y.md"], repairing: [] }],
  frozen: {},
});

function taggingHost(overrides = {}) {
  const host = fakeHost(fakeApp(), { previewTagging: async () => plan(), ...overrides });
  Object.assign(host.state.personalNotes.tagging, { enabled: true, folders: ["Notes"], timestamps: true, uniqueIds: true });
  return host;
}

test("tagging: off by default disables preview; toggles save through updatePersonalNotes", async () => {
  resetDom();
  const host = fakeHost(fakeApp());
  const modal = new ui.TaggingModal(host);
  modal.open();
  assert.equal(button(modal.contentEl, "Preview deterministic tags").disabled, true);
  assert.match(text(modal.contentEl), /tagging a folder never shares it, and sharing a folder never tags it/);
  setting(modal.contentEl, "Use optional tags").toggle.set(true);
  await settle();
  assert.equal(host.state.personalNotes.tagging.enabled, true);
  assert.equal(host.state.personalNotes.tagging.timestamps, false, "fields stay off");
  setting(modal.contentEl, "Folders to tag").text.type("Notes\n");
  button(modal.contentEl, "Save folders").click();
  await settle();
  setting(modal.contentEl, "Unique IDs").toggle.set(true);
  await settle();
  assert.deepEqual(host.state.personalNotes.tagging.folders, ["Notes"]);
  assert.equal(button(modal.contentEl, "Preview deterministic tags").disabled, false);
  assert.deepEqual(host.state.personalNotes.includeFolders, [], "tagging never shares");
});

test("tagging: preview shows a bounded diff and duplicate IDs; Cancel writes nothing", async () => {
  resetDom();
  const host = taggingHost();
  const modal = new ui.TaggingModal(host);
  modal.open();
  button(modal.contentEl, "Preview deterministic tags").click();
  await settle();
  const body = text(modal.contentEl);
  assert.match(body, /2 notes would change\. 1 needs no change\. Nothing has been written yet\./);
  assert.match(body, /The ID 019a72b0-0000-7000-8000-000000000001 is used by more than one note: Notes\/x\.md, Notes\/y\.md\. They all keep it/);
  assert.match(body, /title: B\s+created_at: t/);
  button(modal.contentEl, "Cancel").click();
  assert.match(text(modal.contentEl), /Cancelled\. Nothing was written\./);
  assert.equal(host.calls.some(([n]) => n === "applyTagging"), false);
});

test("tagging: Apply selected tags sends only the selected notes and reports skips and backups", async () => {
  resetDom();
  const host = taggingHost({ applyTagging: async (p) => ({
    written: [{ path: "Notes/a.md", backupRef: ".kosmos/backups/1/a.md", beforeHash: "h1", afterHash: "h1b" }],
    skipped: [], failed: [], ownWrites: [], manifest: null, sent: p }) });
  const modal = new ui.TaggingModal(host);
  modal.open();
  button(modal.contentEl, "Preview deterministic tags").click();
  await settle();
  setting(modal.contentEl, "Notes/b.md").toggle.set(false);
  button(modal.contentEl, "Apply selected tags").click();
  await settle();
  const sent = host.calls.find(([n]) => n === "applyTagging")[1];
  assert.deepEqual(sent.notes.map((n) => n.path), ["Notes/a.md"]);
  assert.equal(sent.proposalTimeMs, 1, "frozen values are passed through unchanged");
  assert.match(text(modal.contentEl), /Written: 1\. Skipped: 0\. Failed: 0\./);
  assert.match(text(modal.contentEl), /Backup: \.kosmos\/backups\/1\/a\.md/);

  const host2 = taggingHost({ applyTagging: async () => ({ written: [], skipped: [{ path: "Notes/a.md", reason: "changed", detail: "x" }], failed: [{ path: "Notes/b.md", error: "disk full" }], ownWrites: [], manifest: null }) });
  const m2 = new ui.TaggingModal(host2);
  m2.open();
  button(m2.contentEl, "Preview deterministic tags").click();
  await settle();
  button(m2.contentEl, "Apply selected tags").click();
  await settle();
  assert.match(text(m2.contentEl), /Notes\/a\.md: changed after the preview, so it was not overwritten/);
  assert.match(text(m2.contentEl), /Notes\/b\.md: not written — disk full/);
});

/* -------------------------------------------------------------- supersedes */

test("supersedes: check failures are explained and nothing can be written", async () => {
  resetDom();
  const app = fakeApp(["Plans/New.md", "Plans/Old.md"]);
  const file = app.vault.getAbstractFileByPath("Plans/New.md");
  for (const [reason, pattern] of [["cycle", /would make a loop/], ["self", /cannot supersede itself/], ["ambiguous", /More than one note matches/], ["unresolved", /No matching note/]]) {
    resetDom();
    const host = fakeHost(app, { previewSupersedes: async () => ({ check: { ok: false, reason, detail: "d" }, plan: null }) });
    const modal = new ui.SupersedesModal(host, file);
    modal.open();
    button(modal.contentEl, "Choose note").click();
    const picker = dom.suggesters.at(-1);
    assert.deepEqual(picker.getItems().map((f) => f.path), ["Plans/Old.md"], "the note itself is not offered");
    picker.onChooseItem(picker.getItems()[0]);
    await settle();
    assert.deepEqual(host.calls.find(([n]) => n === "previewSupersedes").slice(1).map((v) => v.path ?? v), ["Plans/New.md", "Plans/Old"]);
    assert.match(text(modal.contentEl), pattern);
    assert.equal(button(modal.contentEl, "Add supersedes").disabled, true);
    assert.equal(host.calls.some(([n]) => n === "applyTagging"), false);
  }
});

test("supersedes: a valid choice previews the property change and writes only through applyTagging", async () => {
  resetDom();
  const app = fakeApp(["Plans/New.md", "Plans/Old.md"]);
  const file = app.vault.getAbstractFileByPath("Plans/New.md");
  const p = { contract: "kosmos-tagging-plan/1", proposalTimeMs: 5, options: { timestamps: false, uniqueIds: false, supersession: true }, findings: [], frozen: {},
    notes: [{ path: "Plans/New.md", originalHash: "h", changes: [{ op: "addListItem", key: "supersedes", value: "[[Plans/Old]]" }], proposedRaw: "x", previewBefore: "", previewAfter: "supersedes:\n  - \"[[Plans/Old]]\"", reasons: ["supersedes: explicit choice [[Plans/Old]]"], skips: [] }] };
  const host = fakeHost(app, {
    previewSupersedes: async () => ({ check: { ok: true, target: "Plans/Old.md", link: "[[Plans/Old]]", alreadyDeclared: false }, plan: p }),
    applyTagging: async () => ({ written: [{ path: "Plans/New.md", backupRef: "b", beforeHash: "h", afterHash: "h2" }], skipped: [], failed: [], ownWrites: [], manifest: null }),
  });
  const modal = new ui.SupersedesModal(host, file);
  modal.open();
  button(modal.contentEl, "Choose note").click();
  dom.suggesters.at(-1).onChooseItem(app.vault.getAbstractFileByPath("Plans/Old.md"));
  await settle();
  assert.match(text(modal.contentEl), /supersedes:\s+- "\[\[Plans\/Old\]\]"/);
  button(modal.contentEl, "Add supersedes").click();
  await settle();
  assert.equal(host.calls.find(([n]) => n === "applyTagging")[1], p);
  assert.equal(modal.isOpen, false);
  assert.match(dom.notices.at(-1), /New supersedes Old/);
});
