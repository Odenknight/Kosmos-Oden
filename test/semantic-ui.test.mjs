/**
 * Semantic search (0.9.5) — the settings section, as a user meets it.
 *
 * The section is rendered into the fake DOM (test/helpers/ui-harness.mjs) and
 * driven by clicks, over the REAL controller, SQLite store and worker
 * protocol (test/helpers/semantic-fixture.mjs). Nothing here stubs the
 * behaviour the buttons promise.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_MODEL_LICENSES, MODEL_CATALOG, modelFileUrl } from "../dist/kosmos-semantic.mjs";
import { all, button, byClass, dom, hasButton, loadUi, resetDom, setting, settle } from "./helpers/ui-harness.mjs";
import { bytes, controllerWith } from "./helpers/semantic-fixture.mjs";

const ui = await loadUi();
const tick = () => new Promise((r) => setImmediate(r));
/** Wait by the clock, not by a count of turns: hashing a model file takes real time on a busy machine. */
async function until(check, what, ms = 20000) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await check()) return;
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`);
    await tick();
  }
}

/** The plugin's side of the section, over a real controller. */
function hostFor(c) {
  return {
    semanticSettings: () => c.settings(),
    updateSemantic: async (change) => { const draft = structuredClone(c.settings()); change(draft); c.set(draft); await c.controller.apply(); },
    semanticOverview: () => c.controller.overview(),
    semanticInstalled: () => c.controller.installed(),
    downloadSemanticModel: (id) => c.controller.download(id),
    cancelSemanticDownload: () => c.controller.cancelDownload(),
    importSemanticModel: (files) => c.controller.importCustom(files),
    removeSemanticModel: (id) => c.controller.removeModel(id),
    rebuildSemanticIndex: () => c.controller.rebuild(),
    setSemanticPaused: (paused) => c.controller.setPaused(paused),
    onSemanticStatus: (fn) => c.listen(fn),
  };
}

async function open(options) {
  resetDom();
  const c = await controllerWith(options);
  // As the plugin does when it loads: semantic search that was left on resumes by itself.
  if (c.settings().enabled) void c.controller.apply();
  const el = new dom.FakeEl("div");
  const stop = ui.renderSemanticSettings(el, hostFor(c));
  await settle();
  const status = () => setting(el, "Index").descEl.textContent;
  const options_ = () => all(setting(el, "Embedding model").settingEl).filter((n) => n.tagName === "OPTION");
  const progress = () => byClass(el, "kosmos-semantic-progress")[0];
  const ready = async () => { await until(() => /^Ready\./.test(status()), `ready (is: ${status()})`); await settle(); };
  return { c, el, stop, status, options: options_, progress, ready, async close() { stop(); await c.controller.dispose(); } };
}
const sizeOf = (m) => `${Math.round(m.files.reduce((n, f) => n + f.bytes, 0) / 1e6)} MB`;

test("settings: off by default — the list offers only MIT and Apache-2.0 models, or your own, and nothing has run", async () => {
  const s = await open({ settings: { enabled: false }, install: false });
  try {
    assert.equal(setting(s.el, "Search by meaning").toggle.getValue(), false);
    assert.equal(s.status(), "Semantic search is off. Search uses words only.");
    assert.ok(s.progress().hasClass("kosmos-semantic-hidden"), "no progress bar when nothing is in progress");

    const options = s.options();
    assert.deepEqual(options.map((o) => o.getAttribute("value")), [...MODEL_CATALOG.map((m) => m.id), "custom"]);
    for (const [i, m] of MODEL_CATALOG.entries()) {
      assert.ok(ALLOWED_MODEL_LICENSES.includes(m.license));
      assert.equal(options[i].textContent, `${m.label} · ${m.license}`, "each model shows its licence in the list");
    }
    assert.equal(options.at(-1).textContent, "Use my own model files…");
    assert.match(s.el.textContent, /Every model in this list is published under MIT or Apache-2\.0/);
    assert.match(s.el.textContent, /Nothing else needs to be installed/);
    assert.match(s.el.textContent, /one SQLite file in the plugin's folder, made by Kosmos-Oden itself/);
    assert.match(s.el.textContent, /never note text/);

    assert.equal(s.c.requests.length, 0);
    assert.equal(s.c.createWorker.made.length, 0);
    assert.equal(s.c.files.files.size, 0);
  } finally { await s.close(); }
});

test("settings: turn on, press Download once — the model is fetched, checked, and the index builds with no further step", async () => {
  const s = await open({ settings: { enabled: false }, install: false });
  try {
    setting(s.el, "Search by meaning").toggle.set(true);
    await until(() => /not on this device yet\. Press Download/.test(s.status()), "the prompt to download");
    await settle();
    assert.equal(s.c.requests.length, 0, "turning it on downloads nothing");
    assert.equal(s.c.createWorker.made.length, 0);

    const size = sizeOf(s.c.real);
    assert.match(setting(s.el, "Embedding model").descEl.textContent, new RegExp(`Licence: ${s.c.real.license}\\. ${size} download, once\\.`));
    const release = s.c.hold();
    button(s.el, `Download (${size})`).click();
    await until(() => hasButton(s.el, "Cancel download"), "the Cancel button");
    assert.match(s.status(), /^Downloading the model: [\d.]+ MB of \d+ MB \(\d+%\)\.$/);
    assert.ok(!s.progress().hasClass("kosmos-semantic-hidden"));
    assert.ok(Number(s.progress().getAttribute("value")) >= 0);
    release();

    await s.ready();
    assert.deepEqual(s.c.requests, s.c.real.files.map((f) => modelFileUrl(s.c.real, f)), "exactly the chosen model's files, from its pinned revision");
    assert.ok(dom.notices.some((n) => /is downloaded and verified/.test(n)), dom.notices.join(" | "));
    assert.match(s.status(), /^Ready\. 6 notes in \d+ passages are searchable by meaning\.$/);
    assert.ok(s.progress().hasClass("kosmos-semantic-hidden"));
    assert.match(s.options().find((o) => o.getAttribute("value") === s.c.real.id).textContent, / · downloaded$/);
    assert.ok(hasButton(s.el, "Delete model") && !hasButton(s.el, `Download (${size})`));
    assert.equal([...s.c.files.files.keys()].filter((p) => p.endsWith(".sqlite")).length, 1, "the SQLite index was created by the plugin");
  } finally { await s.close(); }
});

test("settings: a download can be cancelled; nothing is kept and the button comes back", async () => {
  const s = await open({ install: false });
  try {
    await until(() => /Press Download/.test(s.status()), "the prompt to download");
    const size = sizeOf(s.c.real);
    const release = s.c.hold();
    button(s.el, `Download (${size})`).click();
    await until(() => hasButton(s.el, "Cancel download"), "the Cancel button");
    button(s.el, "Cancel download").click();
    release();
    await until(() => hasButton(s.el, `Download (${size})`), "the Download button again");
    assert.ok(dom.notices.some((n) => /the download did not finish/.test(n)), dom.notices.join(" | "));
    assert.equal([...s.c.files.files.keys()].filter((p) => p.includes("/models/")).length, 0, "no partial model is left");
    assert.match(s.status(), /Press Download/);
    assert.equal(s.c.createWorker.made.length, 0);
  } finally { await s.close(); }
});

test("settings: your own model — choose the files, no download; text boxes save when left, not on every key", async () => {
  const s = await open({ install: false });
  try {
    setting(s.el, "Embedding model").dropdown.select("custom");
    await until(() => /Choose your model files below/.test(s.status()), "the prompt to choose files");
    await settle();
    assert.match(setting(s.el, "Embedding model").descEl.textContent, /Nothing is downloaded\. Its licence is yours to check\./);
    assert.ok(!all(s.el).some((n) => n.tagName === "BUTTON" && /^Download/.test(n.textContent)), "no Download button for your own model");

    const input = byClass(s.el, "kosmos-semantic-file")[0];
    assert.equal(input.getAttribute("type"), "file");
    assert.equal(input.getAttribute("accept"), ".onnx,.json");
    const file = (name, text) => ({ name, arrayBuffer: async () => bytes(text) });
    input.files = [file("bge-micro.onnx", "ONNX-A"), file("tokenizer.json", "{}"), file("README.md", "x")];
    input.dispatch("change");
    await s.ready();
    assert.ok(dom.notices.some((n) => n === "Kosmos-Oden: saved model.onnx, tokenizer.json; ignored README.md."), dom.notices.join(" | "));
    assert.match(setting(s.el, "Your model files").descEl.textContent, /Your model is in place/);
    assert.equal(s.c.requests.length, 0, "your own model never uses the network");

    // Typing a name: nothing is saved (and the model is not restarted) until the box is left.
    const workers = s.c.createWorker.made.length;
    const name = setting(s.el, "Name").text.inputEl;
    name.focus();
    name.value = "House";
    name.dispatch("input");
    await settle();
    assert.equal(s.c.settings().custom.name, "", "not saved while typing");
    name.value = "House model";
    name.key("Enter");
    await until(() => s.c.settings().custom.name === "House model", "the name to be saved");
    await settle();
    assert.equal(s.c.controller.overview().model, "House model");
    assert.equal(s.c.createWorker.made.length, workers, "a new name does not reload the model");

    // A value that cannot be right is refused with a reason and not saved.
    const tokens = setting(s.el, "Longest input (tokens)").text.inputEl;
    tokens.focus(); tokens.value = "3"; tokens.blur();
    await settle();
    assert.ok(dom.notices.some((n) => /whole number from 16 to 8192/.test(n)));
    assert.equal(s.c.settings().custom.maxTokens, 512);

    // Pooling changes the vectors: a second index, built by itself.
    setting(s.el, "Pooling").dropdown.select("cls");
    await until(() => [...s.c.files.files.keys()].filter((p) => p.endsWith(".sqlite")).length === 2, "a second index");
    assert.equal(s.c.settings().custom.pooling, "cls");
    await s.ready();
  } finally { await s.close(); }
});

test("settings: pause, resume and rebuild; rebuild asks before embedding everything again", async () => {
  const notes = {};
  for (let i = 0; i < 30; i++) notes[`N/${String(i).padStart(2, "0")}.md`] = `# N${i}\n\nbread flour oven number ${i}.\n`;
  // A slow model: each batch of passages waits until the test lets it through.
  let gate = null;
  const slow = () => { let open; gate = new Promise((r) => { open = r; }); return () => { gate = null; open(); }; };
  const s = await open({ notes, embedder: { wait: (kind) => (kind === "passage" ? gate : null) } });
  try {
    await s.ready();
    assert.match(s.status(), /^Ready\. 30 notes/);
    const first = s.c.createWorker.passages();
    assert.ok(!hasButton(s.el, "Pause") && !hasButton(s.el, "Resume"), "nothing to pause when the index is complete");

    let go = slow();
    button(s.el, "Rebuild index").click();
    await settle();
    assert.equal(s.c.controller.overview().phase, "ready", "the first click only asks");
    button(s.el, "Rebuild: embed every note again?").click();
    await until(() => hasButton(s.el, "Pause"), `the Pause button (status: ${s.status()})`);
    assert.match(s.status(), /^Reading your notes: 0 of 30 embedded\. Search already works and improves as this finishes\.$/);
    assert.equal(Number(s.progress().getAttribute("value")), 0);

    button(s.el, "Pause").click();
    go();
    await until(() => hasButton(s.el, "Resume") && /^Paused\. [1-9]\d* of 30/.test(s.status()), `paused part-way (status: ${s.status()})`);
    await s.c.controller.service.idle();
    await settle();
    const partial = s.c.controller.overview().indexedNotes;
    assert.ok(partial > 0 && partial < 30, `stopped part-way (${partial})`);
    assert.equal(s.status(), `Paused. ${partial} of 30 notes are embedded; questions use those.`);
    assert.ok(!hasButton(s.el, "Pause"));
    assert.ok((await s.c.controller.candidates("bread flour", new Set(Object.keys(notes)))).length > 0, "a paused index still answers");

    button(s.el, "Resume").click();
    await s.ready();
    assert.match(s.status(), /^Ready\. 30 notes/);
    assert.equal(s.c.createWorker.passages(), first * 2, "every note was embedded again, once");

    // Paused with nothing to do is still shown as paused, so a waiting change is never a mystery.
    s.c.controller.setPaused(true);
    s.c.source.set("New/Note.md", "# New\n\nA monthly backup goes off site.\n");
    s.c.controller.noteChanges(["New/Note.md"]);
    await until(() => hasButton(s.el, "Resume"), `the Resume button (status: ${s.status()})`);
    assert.equal(s.status(), "Paused. 30 notes are embedded; questions use those. Changed notes wait until you resume.");
    button(s.el, "Resume").click();
    await until(() => /^Ready\. 31 notes/.test(s.status()), `the waiting note to be embedded (status: ${s.status()})`);
  } finally { gate = null; await s.close(); }
});

test("settings: turning it off stops the model and keeps the index; closing the page stops its updates", async () => {
  const s = await open();
  try {
    await s.ready();
    setting(s.el, "Search by meaning").toggle.set(false);
    await until(() => s.status() === "Semantic search is off. Search uses words only.", "off");
    assert.equal(s.c.createWorker.made.at(-1).terminated, true, "the model is unloaded");
    assert.equal([...s.c.files.files.keys()].filter((p) => p.endsWith(".sqlite")).length, 1, "the index file stays for next time");
    assert.ok(!hasButton(s.el, "Rebuild index"));

    s.stop();
    const before = s.el.textContent;
    s.c.set({ enabled: true });
    await s.c.controller.apply();
    await s.c.controller.service.idle();
    await settle();
    assert.equal(s.el.textContent, before, "a closed settings page is not redrawn");
  } finally { await s.close(); }
});
