/**
 * Semantic search (0.9.5): catalog, passages, the SQLite store, the engine,
 * the worker protocol, the service, model files and the controller.
 *
 * SQLite is the real one (sql.js, the build the plugin embeds). The model is
 * replaced by a deterministic "concept" embedder and the Web Worker by an
 * in-process one; see test/helpers/semantic-fixture.mjs. The real model in a
 * real browser is exercised by scripts/semantic-smoke.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  ALLOWED_MODEL_LICENSES,
  CHUNK_LIMITS,
  CUSTOM_MODEL_ID,
  DEFAULT_MODEL_ID,
  MODEL_CATALOG,
  ModelStore,
  SEMANTIC_SCHEMA,
  SERVICE_LIMITS,
  SemanticController,
  SemanticEngine,
  SemanticService,
  SemanticStore,
  activeModel,
  catalogModel,
  chunkNote,
  chunkText,
  contentKey,
  customFileRole,
  defaultSemanticSettings,
  keyName,
  modelDownloadBytes,
  modelFileUrl,
  normalizeSemanticSettings,
  validateCatalog,
} from "../dist/kosmos-semantic.mjs";
import { defaultPersonalNotesSettings, normalizeAgentSettingsForTest } from "./helpers/semantic-settings-probe.mjs";
import { FAKE_DIMS, NOTES, bytes, conceptVector, controllerWith, fakeEmbedder, fakeWorkerFactory, memoryFiles, noteSource, sha256, sql } from "./helpers/semantic-fixture.mjs";

const tick = () => new Promise((r) => setImmediate(r));
/** Wait by the clock, not by a count of turns, so a busy machine cannot fail a test. */
async function until(check, what = "condition", ms = 20000) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await check()) return;
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`);
    await tick();
  }
}
const paths = (hits) => hits.map((h) => h.path);

/* ----------------------------------------------------------------- catalog */

test("catalog: every downloadable model is MIT or Apache-2.0, pinned to a commit, with a size and SHA-256 per file", () => {
  assert.deepEqual(validateCatalog(), []);
  assert.deepEqual([...ALLOWED_MODEL_LICENSES], ["MIT", "Apache-2.0"]);
  assert.ok(MODEL_CATALOG.length >= 3, "a real choice of models");
  for (const m of MODEL_CATALOG) {
    assert.ok(ALLOWED_MODEL_LICENSES.includes(m.license), `${m.id} licence`);
    assert.match(m.revision, /^[0-9a-f]{40}$/);
    assert.match(m.label, /\(\d+ MB\)/, "the label states the size");
    assert.ok(Math.abs(Number(/\((\d+) MB\)/.exec(m.label)[1]) - modelDownloadBytes(m) / 1e6) < 0.51, `${m.id}: the stated size is the real size`);
    for (const f of m.files) {
      const url = modelFileUrl(m, f);
      assert.ok(url.startsWith(`https://huggingface.co/${m.repo}/resolve/${m.revision}/`), "a file comes from the pinned revision, never a branch");
      assert.doesNotMatch(url, /\/resolve\/main\//);
    }
  }
  assert.equal(catalogModel(DEFAULT_MODEL_ID).recommended, true);
  assert.equal(catalogModel("nope"), null);
  assert.equal(catalogModel(CUSTOM_MODEL_ID), null, "the user's own model is not a catalog entry");
});

test("catalog: a model under another licence, or one that floats, is reported", () => {
  const good = MODEL_CATALOG[0];
  const bad = (patch) => validateCatalog([{ ...good, recommended: true, ...patch }]);
  assert.match(bad({ license: "CC-BY-NC-4.0" }).join("\n"), /is not MIT or Apache-2\.0/);
  assert.match(bad({ license: "GPL-3.0" }).join("\n"), /is not MIT or Apache-2\.0/);
  assert.match(bad({ revision: "main" }).join("\n"), /40-hex commit/);
  assert.match(bad({ licenseUrl: "https://example.com/license" }).join("\n"), /declared by the repository/);
  assert.match(bad({ files: good.files.map((f) => ({ ...f, sha256: "" })) }).join("\n"), /no SHA-256/);
  assert.match(bad({ files: good.files.slice(0, 2) }).join("\n"), /must list exactly/);
  assert.match(bad({ id: "custom" }).join("\n"), /invalid id/);
  assert.match(validateCatalog([{ ...good, recommended: false }]).join("\n"), /exactly one model must be recommended/);
});

test("catalog: an index key changes with the model, its revision or (own model) its file and recipe", () => {
  const a = activeModel("arctic-embed-s", defaultSemanticSettings().custom);
  const b = activeModel("all-minilm-l6-v2", defaultSemanticSettings().custom);
  assert.notEqual(a.key, b.key);
  assert.ok(a.key.includes(catalogModel("arctic-embed-s").revision.slice(0, 12)));
  const custom = (over, fp = "aaaa") => activeModel(CUSTOM_MODEL_ID, { ...defaultSemanticSettings().custom, ...over }, fp);
  assert.equal(custom({}).dims, 0, "the vector length of the user's own model is detected, not asked for");
  assert.equal(custom({}).label, "Your own model");
  assert.equal(custom({ name: "Work model" }).key, custom({}).key, "a display name does not change the vectors");
  assert.notEqual(custom({ pooling: "cls" }).key, custom({}).key);
  assert.notEqual(custom({ queryPrefix: "query: " }).key, custom({}).key);
  assert.notEqual(custom({}, "bbbb").key, custom({}).key, "other model file, other index");
  assert.equal(activeModel("nope", defaultSemanticSettings().custom), null);
});

test("settings: off by default; malformed or unknown values fall back to off and never throw", () => {
  const d = defaultSemanticSettings();
  assert.deepEqual(d, { enabled: false, modelId: DEFAULT_MODEL_ID, custom: { name: "", pooling: "mean", maxTokens: 512, queryPrefix: "", passagePrefix: "" } });
  for (const junk of [undefined, null, 7, "on", [], { enabled: "yes" }, { enabled: true, modelId: "gone-model" }, { enabled: true, modelId: 5 }]) {
    assert.equal(normalizeSemanticSettings(junk).enabled, false);
    assert.equal(normalizeSemanticSettings(junk).modelId, DEFAULT_MODEL_ID);
  }
  const kept = normalizeSemanticSettings({ enabled: true, modelId: "custom", custom: { name: "  Mine ", pooling: "cls", maxTokens: 99999, queryPrefix: "q: ", passagePrefix: 4 } });
  assert.deepEqual(kept, { enabled: true, modelId: "custom", custom: { name: "Mine", pooling: "cls", maxTokens: 8192, queryPrefix: "q: ", passagePrefix: "" } });
});

test("settings: the saved plugin settings carry the semantic choices through a load, and an older file has none", () => {
  assert.equal(defaultPersonalNotesSettings().semantic, undefined, "nothing is written for a user who never opened the section");
  const older = normalizeAgentSettingsForTest({ personalNotes: { includeFolders: ["Notes"] } });
  assert.equal(older.personalNotes.semantic, undefined);
  assert.deepEqual(older.personalNotes.includeFolders, ["Notes"]);
  const saved = normalizeAgentSettingsForTest({ personalNotes: { includeFolders: ["Notes"], semantic: { enabled: true, modelId: "all-minilm-l6-v2" } } });
  assert.equal(saved.personalNotes.semantic.enabled, true);
  assert.equal(saved.personalNotes.semantic.modelId, "all-minilm-l6-v2");
  const broken = normalizeAgentSettingsForTest({ personalNotes: { includeFolders: ["Notes"], semantic: "yes please" } });
  assert.equal(broken.personalNotes.semantic.enabled, false, "malformed = off");
  assert.deepEqual(broken.personalNotes.includeFolders, ["Notes"], "and what is shared is untouched");
});

/* ---------------------------------------------------------------- passages */

test("passages: front matter is skipped, headings travel as context, offsets point into the note", () => {
  const raw = "---\ntitle: X\ntags: [a]\n---\n# Restore\n\nAttach the drive.\n\n## Verify\n\nBoot once.\nCheck the log.\n";
  const chunks = chunkNote(raw);
  assert.deepEqual(chunks.map((c) => c.heading), ["Restore", "Verify"]);
  assert.equal(raw.slice(chunks[0].offsetChars, chunks[0].offsetChars + chunks[0].lengthChars), "Attach the drive.");
  assert.equal(raw.slice(chunks[1].offsetChars, chunks[1].offsetChars + chunks[1].lengthChars), "Boot once.\nCheck the log.");
  assert.equal(chunkText(raw, chunks[1], "Runbook"), "Runbook — Verify\nBoot once.\nCheck the log.");
  assert.equal(chunkText(raw, chunks[0], "Restore"), "Restore\nAttach the drive.", "a heading equal to the title is not repeated");
  assert.deepEqual(chunkNote(""), []);
  assert.deepEqual(chunkNote("---\na: 1\n---\n"), [], "a note with only properties has nothing to embed");
  assert.equal(chunkNote("# Only a heading\n").length, 0);
});

test("passages: long text is cut at sentence ends within the limit; a '#' inside a code block is not a heading", () => {
  const sentence = "The quick brown fox jumps over the lazy dog near the river bank. ";
  const raw = `# Long\n\n${sentence.repeat(80)}`;
  const chunks = chunkNote(raw);
  assert.ok(chunks.length >= 3);
  let covered = "";
  for (const c of chunks) {
    assert.ok(c.lengthChars <= CHUNK_LIMITS.maxChars, "no passage is longer than the limit");
    covered += raw.slice(c.offsetChars, c.offsetChars + c.lengthChars);
  }
  assert.equal(covered.replace(/\s+/g, ""), sentence.repeat(80).replace(/\s+/g, ""), "nothing is lost or repeated");
  assert.ok(chunks.slice(0, -1).every((c) => /[.\n] ?$/.test(raw.slice(c.offsetChars, c.offsetChars + c.lengthChars))), "cuts fall at sentence ends");

  const fenced = chunkNote("# Setup\n\n```sh\n# not a heading\nmake install\n```\n");
  assert.deepEqual(fenced.map((c) => c.heading), ["Setup"]);
  assert.match(chunkText("# Setup\n\n```sh\n# not a heading\nmake install\n```\n", fenced[0], "Setup"), /# not a heading/);

  const emoji = "😀".repeat(3000);
  for (const c of chunkNote(emoji)) {
    const first = emoji.charCodeAt(c.offsetChars);
    assert.ok(first < 0xdc00 || first > 0xdfff, "a passage never starts in the middle of a character");
  }
  assert.ok(chunkNote(`${"word ".repeat(200)}\n\n`.repeat(400)).length <= CHUNK_LIMITS.maxChunksPerNote, "a huge note is bounded");
});

test("passages: the change key follows the text and the title, nothing else", () => {
  assert.equal(contentKey("abc", "T"), contentKey("abc", "T"));
  assert.notEqual(contentKey("abc", "T"), contentKey("abd", "T"));
  assert.notEqual(contentKey("abc", "T"), contentKey("abc", "U"), "the title is part of every passage");
  assert.notEqual(contentKey("ab", "c"), contentKey("a", "bc"));
});

/* ------------------------------------------------------------------- store */

const unit = (i, dims = 4) => { const v = new Float32Array(dims); v[i] = 1; return v; };
const one = [{ heading: "", offsetChars: 0, lengthChars: 5 }];

test("store: the file is close to the size of its vectors, and reopens whole", async () => {
  // Measured before the fix: 4.7 KB per 384-number vector (1.5 KB of data), every vector on its own overflow page.
  const SQL = await sql();
  const dims = 384, notes = 200, per = 5;
  const store = SemanticStore.open(SQL, null, "m@1", dims);
  for (let n = 0; n < notes; n++) {
    const vectors = new Float32Array(per * dims);
    for (let i = 0; i < vectors.length; i++) vectors[i] = Math.sin(n * 31 + i);
    store.upsert(`N/${n}.md`, `k${n}`, Array.from({ length: per }, (_, k) => ({ heading: "", offsetChars: k * 1000, lengthChars: 1000 })), vectors, 1);
  }
  const file = store.export();
  const raw = notes * per * dims * 4;
  assert.ok(file.length < raw * 1.25, `${file.length} bytes for ${raw} bytes of vectors`);
  const again = SemanticStore.open(SQL, file, "m@1", dims);
  assert.deepEqual({ notes: again.stats().notes, chunks: again.stats().chunks }, { notes, chunks: notes * per });
  assert.equal(again.rebuilt, false);
  store.close(); again.close();
});

test("store: a real SQLite file; it holds paths and vectors and never note text — no passage, heading or title", async () => {
  const SQL = await sql();
  const store = SemanticStore.open(SQL, null, "m@1", 4);
  const secret = "the pass phrase is hunter2";
  store.upsert("A/secret.md", contentKey(secret), [{ heading: "Vault", offsetChars: 0, lengthChars: secret.length }], unit(0), 1700000000000);
  const file = store.export();
  assert.equal(Buffer.from(file.subarray(0, 15)).toString(), "SQLite format 3");
  assert.ok(!Buffer.from(file).includes("hunter2"), "note text is not stored");
  assert.ok(!Buffer.from(file).includes("pass phrase"));
  assert.ok(!Buffer.from(file).includes("Vault"), "nor is the heading above the passage");
  assert.ok(Buffer.from(file).includes("A/secret.md"), "the path is");

  const db = new SQL.Database(file);
  assert.equal(db.exec("PRAGMA user_version")[0].values[0][0], SEMANTIC_SCHEMA);
  assert.deepEqual(db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0].values.flat(), ["chunks", "meta", "notes"]);
  assert.deepEqual(db.exec("PRAGMA table_info(chunks)")[0].values.map((r) => r[1]), ["note_id", "seq", "offset_chars", "length_chars", "vector"]);
  assert.deepEqual(db.exec("PRAGMA table_info(notes)")[0].values.map((r) => r[1]), ["id", "path", "content_key", "chunk_count", "indexed_at"]);
  const meta = Object.fromEntries(db.exec("SELECT key, value FROM meta")[0].values);
  assert.equal(meta.model_key, "m@1");
  assert.equal(meta.dims, "4");
  assert.equal(db.exec("SELECT length(vector) FROM chunks")[0].values[0][0], 16, "four 32-bit numbers");
  db.close();
  store.close();
});

test("store: reopening restores every vector; another model, vector length or a damaged file starts again", async () => {
  const SQL = await sql();
  const store = SemanticStore.open(SQL, null, "m@1", 4);
  store.upsert("a.md", "k1", [{ heading: "H", offsetChars: 3, lengthChars: 9 }, { heading: "I", offsetChars: 20, lengthChars: 4 }], Float32Array.from([1, 0, 0, 0, 0, 2, 0, 0]), 1);
  store.upsert("b.md", "k2", one, unit(2), 1);
  const file = store.export();
  assert.equal(store.dirty, false);

  const again = SemanticStore.open(SQL, file, "m@1", 4);
  assert.equal(again.rebuilt, false);
  assert.deepEqual(again.stats(), { modelKey: "m@1", dims: 4, notes: 2, chunks: 3 });
  assert.deepEqual({ ...again.manifest() }, { "a.md": "k1", "b.md": "k2" });
  const [hit] = again.search(unit(1), null, 1);
  assert.deepEqual({ path: hit.path, offsetChars: hit.offsetChars, lengthChars: hit.lengthChars }, { path: "a.md", offsetChars: 20, lengthChars: 4 });
  assert.ok(!("heading" in hit), "nothing of the note travels with a hit");
  assert.ok(Math.abs(hit.score - 1) < 1e-6, "vectors are stored at unit length");

  for (const [label, key, dims, data] of [["another model", "m@2", 4, file], ["another vector length", "m@1", 8, file], ["not a database", "m@1", 4, new Uint8Array([1, 2, 3, 4, 5])], ["a truncated file", "m@1", 4, file.slice(0, 700)]]) {
    const fresh = SemanticStore.open(SQL, data, key, dims);
    assert.equal(fresh.rebuilt, true, label);
    assert.equal(fresh.stats().notes, 0, label);
    assert.equal(fresh.dirty, true, label);
    fresh.close();
  }
  assert.equal(SemanticStore.open(SQL, null, "m@1", 4).rebuilt, false, "no file yet is not a rebuild");
  assert.throws(() => SemanticStore.open(SQL, null, "m@1", 0), /invalid vector length/);
});

test("store: search compares only allowed notes, returns each note's best passage, and survives edits", async () => {
  const SQL = await sql();
  const store = SemanticStore.open(SQL, null, "m", 4);
  store.upsert("a.md", "k", one, unit(0), 1);
  store.upsert("b.md", "k", one, Float32Array.from([0.9, 0.1, 0, 0]), 1);
  store.upsert("c.md", "k", one, unit(3), 1);
  assert.deepEqual(paths(store.search(unit(0), null, 10)), ["a.md", "b.md", "c.md"]);
  assert.deepEqual(paths(store.search(unit(0), new Set(["b.md", "c.md"]), 10)), ["b.md", "c.md"], "a note outside the allowed set is not compared at all");
  assert.deepEqual(paths(store.search(unit(0), new Set(), 10)), []);
  assert.deepEqual(paths(store.search(unit(0), new Set(["zz.md"]), 10)), []);
  assert.deepEqual(paths(store.search(unit(0), null, 10, new Set(["a.md"]))), ["b.md", "c.md"]);
  assert.deepEqual(paths(store.search(unit(0), null, 1)), ["a.md"]);
  const led = store.search(unit(0), null, 10);
  assert.equal(led[0].lead, 1, "lead: 1 is the closest note");
  assert.equal(led[1].lead, 0, "0 is the typical (median) note");
  assert.ok(led[2].lead < 0);
  assert.equal(store.search(unit(0), new Set(["c.md"]), 10)[0].lead, 1, "a single note is its own best");
  assert.throws(() => store.search(new Float32Array(3), null, 1), /query vector has 3 numbers/);
  assert.throws(() => store.upsert("d.md", "k", one, new Float32Array(3), 1), /must hold 4 numbers/);

  store.upsert("a.md", "k2", one, unit(3), 2);
  assert.deepEqual(paths(store.search(unit(0), null, 1)), ["b.md"], "an edited note replaces its old vectors");
  assert.equal(store.stats().chunks, 3);
  assert.equal(store.rename("b.md", "moved/b.md"), true);
  assert.equal(store.rename("b.md", "x.md"), false);
  assert.equal(store.rename("a.md", "c.md"), false, "a rename never overwrites another note");
  assert.equal(store.remove("c.md"), true);
  assert.equal(store.remove("c.md"), false);
  const reopened = SemanticStore.open(SQL, store.export(), "m", 4);
  assert.deepEqual(Object.keys(reopened.manifest()).sort(), ["a.md", "moved/b.md"]);
  assert.deepEqual(store.centroid("nope.md"), null);
  store.clear();
  assert.deepEqual(store.stats().notes, 0);
});

/* ------------------------------------------------------------------ engine */

async function engineWith(notes = NOTES, embedderOptions) {
  const embedder = fakeEmbedder(embedderOptions);
  const engine = SemanticEngine.open(await sql(), null, "fake@1", embedder);
  await engine.index(Object.entries(notes).map(([path, raw]) => ({ path, key: contentKey(raw), title: path.split("/").pop().replace(/\.md$/, ""), raw })));
  return { engine, embedder };
}

test("engine: a question finds the note that means the same, sharing no word with it", async () => {
  const { engine, embedder } = await engineWith();
  const question = "my computer crashed, how do I get it going again";
  const noteWords = new Set(NOTES["Ops/Recovery runbook.md"].toLowerCase().match(/[a-z]+/g));
  assert.deepEqual(question.toLowerCase().match(/[a-z]{4,}/g).filter((w) => noteWords.has(w)), [], "the question and the note share no word");
  const hits = await engine.query(question, null, 3);
  assert.equal(hits[0].path, "Ops/Recovery runbook.md");
  assert.ok(hits[0].score > 2 * hits[1].score, "and it stands clear of every other note");
  assert.ok(hits[0].score > 0.5 && hits[0].score <= 1.0001);
  assert.equal((await engine.query("how long should dough proof in the oven", null, 1))[0].path, "Home/Sourdough.md");
  assert.equal((await engine.query("which paperwork does the revenue office want", null, 1))[0].path, "Money/Tax checklist.md");
  assert.deepEqual(embedder.log.at(-1), { kind: "query", texts: ["which paperwork does the revenue office want"] }, "a question is embedded as a question");
  assert.ok(embedder.log.filter((c) => c.kind === "passage").every((c) => c.texts.length <= 8), "passages go to the model in small batches");
  assert.match(embedder.log[0].texts[0], /^Backups\n|^Recovery runbook\n|^[A-Z]/, "a passage is embedded with its title");

  await assert.rejects(engine.query("   ", null, 3), /must not be empty/);
  await assert.rejects(engine.query("x".repeat(2001), null, 3), /too long/);
  await engine.dispose();
  assert.equal(embedder.disposed, true);
});

test("engine: related notes exclude the sources and never leave the allowed set", async () => {
  const { engine } = await engineWith();
  const related = engine.related(["Ops/Recovery runbook.md"], null, 3, 5);
  assert.equal(related[0].path, "Ops/Backups.md");
  assert.equal(related[0].relatedTo, "Ops/Recovery runbook.md");
  assert.ok(!paths(related).includes("Ops/Recovery runbook.md"));
  const allowed = new Set(["Ops/Recovery runbook.md", "Home/Sourdough.md"]);
  assert.deepEqual(paths(engine.related(["Ops/Recovery runbook.md"], allowed, 3, 5)), ["Home/Sourdough.md"]);
  assert.deepEqual(engine.related(["Ops/Recovery runbook.md"], new Set(["Home/Sourdough.md"]), 3, 5), [], "a source the requester cannot read gives nothing away");
  assert.deepEqual(engine.related(["missing.md"], null, 3, 5), []);
  await engine.dispose();
});

test("engine: a model whose vectors do not fit the index is refused", async () => {
  const SQL = await sql();
  const store = SemanticStore.open(SQL, null, "m", 8);
  assert.throws(() => new SemanticEngine(store, fakeEmbedder()), new RegExp(`makes ${FAKE_DIMS}-number vectors, the index holds 8`));
  const lying = { dims: FAKE_DIMS, embed: async (texts) => texts.map(() => new Float32Array(3)) };
  const engine = SemanticEngine.open(SQL, null, "m", lying);
  await assert.rejects(engine.index([{ path: "a.md", key: "k", title: "a", raw: "some text" }]), /returned a 3-number vector/);
  assert.equal(engine.stats().notes, 0, "nothing half-written");
});

/* ----------------------------------------------------------------- service */

const MODEL = activeModel("arctic-embed-s", defaultSemanticSettings().custom);
const modelBytes = () => ({ model: bytes("onnx bytes"), tokenizer: "{}", tokenizerConfig: "{}" });

function serviceWith(notes = NOTES, { embedder, saveEveryMs } = {}) {
  const source = noteSource(notes);
  const createWorker = fakeWorkerFactory(embedder);
  const saved = new Map();
  const changes = [];
  const service = new SemanticService({
    createWorker, source,
    readDatabase: async (key) => saved.get(key)?.slice(0) ?? null,
    writeDatabase: async (key, data) => { saved.set(key, data.slice(0)); },
    onChange: () => changes.push(service.status().state),
    ...(saveEveryMs !== undefined ? { saveEveryMs } : {}),
  });
  return { service, source, createWorker, saved, changes };
}

test("service: start embeds every note, saves the SQLite file and reports progress; a restart embeds nothing again", async () => {
  const { service, createWorker, saved, changes } = serviceWith();
  assert.equal(service.status().state, "off");
  assert.deepEqual(await service.candidates("anything", null), [], "off: no candidates, no error");
  await service.start(MODEL, modelBytes());
  assert.equal(service.searchable, true, "questions are answered while the index fills");
  await service.idle();
  const st = service.status();
  assert.deepEqual([st.state, st.indexedNotes, st.totalNotes, st.pendingNotes, st.failedNotes, st.dims, st.rebuilt], ["ready", 6, 6, 0, 0, FAKE_DIMS, false]);
  assert.ok(st.chunks >= 6);
  assert.deepEqual([...new Set(changes)].filter((s) => s !== "off"), ["loading", "indexing", "ready"]);
  assert.equal(createWorker.passages(), st.chunks);
  assert.equal(Buffer.from(saved.get(MODEL.key).slice(0, 15)).toString(), "SQLite format 3");
  assert.equal(createWorker.made[0].loads[0].recipe.pooling, "cls");
  assert.equal(createWorker.made[0].loads[0].recipe.queryPrefix, MODEL.queryPrefix);

  await service.stop();
  assert.equal(createWorker.made[0].terminated, true, "stopping frees the model");
  assert.equal(service.status().state, "off");
  const before = createWorker.passages();
  await service.start(MODEL, modelBytes());
  await service.idle();
  assert.equal(service.status().indexedNotes, 6);
  assert.equal(createWorker.passages(), before, "the stored index was reused: no note was embedded again");
  assert.equal((await service.candidates("my computer crashed, how do I get it going again", null))[0].path, "Ops/Recovery runbook.md");
  await service.stop();
});

test("service: edits, new notes, deletions and renames reach the index; an unchanged note is not embedded twice", async () => {
  const { service, source, createWorker } = serviceWith();
  await service.start(MODEL, modelBytes());
  await service.idle();
  const base = createWorker.passages();

  service.noteChanges(["Home/Sourdough.md"]);
  await service.idle();
  assert.equal(createWorker.passages(), base, "a save that changed nothing costs nothing");

  source.set("Home/Sourdough.md", "# Sourdough\n\nNow about tomatoes: plant them in the garden after frost.\n");
  source.set("Home/New.md", "# New\n\nLisbon by tram, then Sintra.\n");
  source.delete("Money/Tax checklist.md");
  service.noteChanges(["Home/Sourdough.md", "Home/New.md", "Money/Tax checklist.md"]);
  await service.idle();
  assert.equal(service.status().indexedNotes, 6);
  assert.equal(service.status().totalNotes, 6);
  assert.equal(createWorker.passages(), base + 2);
  assert.ok(!paths(await service.candidates("tax paperwork receipts", null)).includes("Money/Tax checklist.md"), "a deleted note is gone from the index");
  assert.ok(paths(await service.candidates("vegetable plants in the garden", null)).slice(0, 2).includes("Home/Sourdough.md"), "the edited note is found by its new meaning");

  const embedded = createWorker.passages();
  source.rename("Travel/Lisbon.md", "Archive/Lisbon 2024.md");
  service.noteChanges(null);
  await service.idle();
  // The title is part of each passage, so a rename that changes the title re-embeds that one note.
  assert.equal(createWorker.passages(), embedded + 1);
  source.rename("Garden/Tomatoes.md", "Plots/Tomatoes.md");
  service.noteChanges(["Garden/Tomatoes.md", "Plots/Tomatoes.md"]);
  await service.idle();
  assert.equal(createWorker.passages(), embedded + 1, "a moved note (same title, same text) keeps its vectors");
  assert.ok(createWorker.made[0].requests.includes("rename"));
  assert.equal((await service.candidates("blight on tomato plants", null))[0].path, "Plots/Tomatoes.md");
  assert.equal(service.status().indexedNotes, 6);
  await service.stop();
});

test("service: candidates stay inside the allowed notes, and an unrelated question does not return the vault", async () => {
  const many = { ...NOTES };
  for (let i = 0; i < 30; i++) many[`Misc/Note ${i}.md`] = `# Note ${i}\n\nzeta${i} omicron${i} filler words unrelated${i} to anything at all.\n`;
  const { service } = serviceWith(many);
  await service.start(MODEL, modelBytes());
  await service.idle();
  const all = await service.candidates("restore the machine from last night's snapshot", null);
  // The concept embedder scores an unrelated note 0, which no real model does
  // (theirs sit around 0.5): this checks the rule, not how well it works. That
  // was measured with real models; see SemanticHit.lead.
  assert.equal(all[0].path, "Ops/Recovery runbook.md");
  assert.equal(all[0].lead, 1);
  assert.ok(all.length <= 2, `the best note and those near it, not the vault (got ${all.length} of 36)`);
  assert.ok(all.every((h) => h.lead >= SERVICE_LIMITS.minLead) && all.length <= SERVICE_LIMITS.candidates);
  assert.ok(!paths(all).some((p) => p.startsWith("Misc/")));

  const allowed = new Set(["Ops/Backups.md", "Home/Sourdough.md", ...Object.keys(many).filter((p) => p.startsWith("Misc/"))]);
  const scoped = await service.candidates("restore the machine from last night's snapshot", allowed);
  assert.equal(scoped[0].path, "Ops/Backups.md");
  assert.ok(paths(scoped).every((p) => allowed.has(p)), "nothing outside the requester's notes");
  assert.ok(!paths(scoped).includes("Ops/Recovery runbook.md"));
  assert.deepEqual(await service.candidates("my computer crashed", new Set()), []);
  assert.deepEqual(paths(await service.related(["Ops/Recovery runbook.md"], new Set(["Ops/Recovery runbook.md", "Garden/Tomatoes.md"]), 5)), ["Garden/Tomatoes.md"]);
  assert.deepEqual(await service.related([], null, 5), []);
  await service.stop();
});

test("service: one note the model cannot read does not stop the rest, and is retried only when it changes", async () => {
  const notes = { ...NOTES, "Odd/Broken.md": "# Broken\n\nPOISON text the model rejects.\n" };
  const { service, source, createWorker } = serviceWith(notes, { embedder: { failOn: "POISON" } });
  await service.start(MODEL, modelBytes());
  await service.idle();
  let st = service.status();
  assert.deepEqual([st.state, st.indexedNotes, st.failedNotes, st.totalNotes], ["ready", 6, 1, 7]);
  const asked = createWorker.made[0].requests.length;
  service.noteChanges(null);
  await service.idle();
  assert.equal(createWorker.made[0].requests.filter((r) => r === "index").length, createWorker.made[0].requests.slice(0, asked).filter((r) => r === "index").length, "the same failing text is not sent again");
  source.set("Odd/Broken.md", "# Broken\n\nNow readable: bread and flour.\n");
  service.noteChanges(["Odd/Broken.md"]);
  await service.idle();
  st = service.status();
  assert.deepEqual([st.indexedNotes, st.failedNotes], [7, 0]);
  await service.stop();
});

test("service: a model that cannot load is an error with a plain message, and the next start works", async () => {
  const { service, createWorker } = serviceWith();
  createWorker.failLoad = "the model file is not a valid ONNX model";
  await assert.rejects(service.start(MODEL, modelBytes()), /not a valid ONNX model/);
  assert.deepEqual([service.status().state, service.status().error], ["error", "the model file is not a valid ONNX model"]);
  assert.equal(createWorker.made[0].terminated, true);
  assert.deepEqual(await service.candidates("anything", null), []);
  createWorker.failLoad = "";
  await service.start(MODEL, modelBytes());
  await service.idle();
  assert.equal(service.status().state, "ready");

  const bad = serviceWith();
  await assert.rejects(bad.service.start(MODEL, { model: bytes("x"), tokenizer: "{not json", tokenizerConfig: "" }), /tokenizer\.json is not valid JSON/);
  await service.stop();
});

test("service: a worker that dies fails the waiting question and reports the error; nothing hangs", async () => {
  const { service, createWorker } = serviceWith();
  await service.start(MODEL, modelBytes());
  await service.idle();
  const pending = service.candidates("my computer crashed", null);
  createWorker.made[0].crash("out of memory");
  await assert.rejects(pending, /out of memory/);
  assert.deepEqual([service.status().state, service.status().error], ["error", "out of memory"]);
  assert.equal(createWorker.made[0].terminated, true);
  assert.deepEqual(await service.candidates("again", null), [], "after an error, search by meaning is simply absent");
  await service.stop();
  assert.equal(service.status().state, "off");
});

test("service: pause holds embedding (questions still work), resume continues, rebuild embeds everything again", async () => {
  const notes = {};
  for (let i = 0; i < 40; i++) notes[`N/${String(i).padStart(2, "0")}.md`] = `# N${i}\n\nbread flour oven number ${i}.\n`;
  const { service, createWorker } = serviceWith(notes);
  service.setPaused(true);
  await service.start(MODEL, modelBytes());
  await service.idle();
  assert.equal(service.status().state, "indexing");
  assert.equal(service.status().indexedNotes, 0, "paused before the first batch");
  assert.deepEqual(await service.candidates("bread", null), []);
  service.setPaused(false);
  await until(() => service.status().indexedNotes >= SERVICE_LIMITS.batchNotes, "the first batch");
  service.setPaused(true);
  await service.idle();
  const partial = service.status().indexedNotes;
  assert.ok(partial >= SERVICE_LIMITS.batchNotes && partial < 40, `stopped part-way (${partial})`);
  assert.ok((await service.candidates("bread flour", null)).length > 0, "a paused index still answers from what it has");
  service.setPaused(false);
  await service.idle();
  assert.deepEqual([service.status().state, service.status().indexedNotes], ["ready", 40]);

  const before = createWorker.passages();
  await service.rebuild();
  assert.equal(service.status().state, "indexing");
  await service.idle();
  assert.deepEqual([service.status().state, service.status().indexedNotes], ["ready", 40]);
  assert.equal(createWorker.passages(), before + 40);
  await service.stop();
});

test("service: a vault that has not loaded yet is not mistaken for an empty one", async () => {
  const { service, source, createWorker, saved } = serviceWith();
  await service.start(MODEL, modelBytes());
  await service.idle();
  await service.stop();
  const embedded = createWorker.passages();

  source.setReady(false);
  const all = source.notes();
  const hidden = noteSource({});
  hidden.setReady(false);
  const late = new SemanticService({
    createWorker,
    source: { notes: () => (source.ready() ? source.notes() : []), get: (p) => (source.ready() ? source.get(p) : null), ready: () => source.ready() },
    readDatabase: async (key) => saved.get(key)?.slice(0) ?? null,
    writeDatabase: async (key, data) => { saved.set(key, data.slice(0)); },
  });
  await late.start(MODEL, modelBytes());
  await late.idle();
  assert.equal(late.status().indexedNotes, 6, "the stored index is kept while the notes are still being read");
  assert.equal(late.status().state, "indexing");
  assert.equal((await late.candidates("my computer crashed, how do I get it going again", null))[0].path, "Ops/Recovery runbook.md", "and already answers");
  assert.ok(!createWorker.made.at(-1).requests.includes("remove"));
  source.setReady(true);
  late.noteChanges(null);
  await late.idle();
  assert.deepEqual([late.status().state, late.status().indexedNotes], ["ready", all.length]);
  assert.equal(createWorker.passages(), embedded, "nothing was embedded again");
  await late.stop();
});

test("service: the index is saved while a long build runs, so closing Obsidian loses little", async () => {
  const notes = {};
  for (let i = 0; i < 30; i++) notes[`N/${i}.md`] = `# N${i}\n\nbread ${i}.\n`;
  const { service, createWorker, saved } = serviceWith(notes, { saveEveryMs: 0 });
  await service.start(MODEL, modelBytes());
  await service.idle();
  const exports = createWorker.made[0].requests.filter((r) => r === "export").length;
  assert.ok(exports >= 30 / SERVICE_LIMITS.batchNotes, `saved after each batch (${exports})`);
  assert.ok(saved.get(MODEL.key).byteLength > 4096);
  await service.stop();
});

/* ------------------------------------------------------------- model files */

const CATALOG_FAKE = async () => {
  const file = (name, text) => ({ path: `onnx/${name}`, name, data: bytes(text) });
  const parts = [file("model.onnx", "MODEL-BYTES-".repeat(50)), file("tokenizer.json", '{"version":"1.0"}'), file("tokenizer_config.json", '{"do_lower_case":true}')];
  const model = {
    ...MODEL_CATALOG[0], id: "tiny-test", label: "Tiny test model", repo: "example/tiny", revision: "a".repeat(40),
    files: await Promise.all(parts.map(async (p) => ({ path: p.path, name: p.name, bytes: p.data.byteLength, sha256: await sha256(p.data) }))),
  };
  const served = new Map(parts.map((p) => [`https://huggingface.co/example/tiny/resolve/${"a".repeat(40)}/${p.path}`, p.data]));
  return { model, served };
};

function downloader(served, { corrupt = null, chunk = 64 } = {}) {
  const requests = [];
  const fn = async (url, onProgress, signal) => {
    requests.push(url);
    const data = served.get(url);
    if (!data) throw new Error(`the model host answered 404`);
    for (let at = chunk; at < data.byteLength; at += chunk) { if (signal?.aborted) throw new Error("download cancelled"); onProgress(at); await tick(); }
    onProgress(data.byteLength);
    if (corrupt && url.endsWith(corrupt)) { const copy = new Uint8Array(data.slice(0)); copy[0] ^= 0xff; return copy.buffer; }
    return data.slice(0);
  };
  fn.requests = requests;
  return fn;
}

test("model files: a download is checked against its size and SHA-256 before it is kept, and again on every load", async () => {
  const { model, served } = await CATALOG_FAKE();
  const files = memoryFiles();
  const get = downloader(served);
  const store = new ModelStore(files, ".obsidian/plugins/kosmos-oden/semantic", get, sha256);
  assert.equal(await store.isInstalled(model), false);
  const progress = [];
  await store.install(model, (received, total) => progress.push([received, total]));
  assert.equal(await store.isInstalled(model), true);
  assert.deepEqual(get.requests, model.files.map((f) => `https://huggingface.co/example/tiny/resolve/${"a".repeat(40)}/${f.path}`), "exactly the catalog's files, from the pinned revision");
  assert.deepEqual(progress.at(-1), [modelDownloadBytes(model), modelDownloadBytes(model)]);
  assert.ok(progress.every(([r], i) => i === 0 || r >= progress[i - 1][0]), "progress never goes backwards");
  assert.deepEqual([...files.files.keys()].sort(), ["model.onnx", "tokenizer.json", "tokenizer_config.json"].map((n) => `.obsidian/plugins/kosmos-oden/semantic/models/tiny-test/${n}`), "no .part file is left");
  const loaded = await store.load(model);
  assert.equal(loaded.tokenizer, '{"version":"1.0"}');
  assert.equal(loaded.model.byteLength, model.files[0].bytes);

  await store.install(model);
  assert.equal(get.requests.length, 3, "files already on disk and intact are not downloaded again");

  const path = store.modelDir(model.id) + "/model.onnx";
  const tampered = new Uint8Array(files.files.get(path).slice(0)); tampered[5] ^= 1;
  files.files.set(path, tampered.buffer);
  assert.equal(await store.isInstalled(model), true, "same size…");
  await assert.rejects(store.load(model), /does not match its published SHA-256/, "…but a changed file is never loaded");
  await store.install(model);
  assert.equal(get.requests.length, 4, "and a repair downloads only that file");
  await store.load(model);
});

test("model files: a corrupted, oversized or interrupted download keeps nothing", async () => {
  const { model, served } = await CATALOG_FAKE();
  const root = "p/semantic";
  let files = memoryFiles();
  await assert.rejects(new ModelStore(files, root, downloader(served, { corrupt: "model.onnx" }), sha256).install(model), /does not match its published SHA-256\. It was not kept/);
  assert.equal(files.files.size, 0);

  files = memoryFiles();
  const bigger = new Map(served);
  const url = [...served.keys()][0];
  bigger.set(url, bytes("MODEL-BYTES-".repeat(60)));
  await assert.rejects(new ModelStore(files, root, downloader(bigger), sha256).install(model), /larger than the published/);
  assert.equal(files.files.size, 0);

  files = memoryFiles();
  const shorter = new Map(served);
  shorter.set(url, bytes("MODEL"));
  await assert.rejects(new ModelStore(files, root, downloader(shorter), sha256).install(model), /is 5 bytes, expected 600/);
  assert.equal(files.files.size, 0);

  files = memoryFiles();
  const abort = new AbortController();
  const slow = downloader(served, { chunk: 8 });
  const run = new ModelStore(files, root, slow, sha256).install(model, (received) => { if (received > 40) abort.abort(); }, abort.signal);
  await assert.rejects(run, /cancelled/);
  assert.equal(files.files.size, 0, "a cancelled download leaves no file");
  const store = new ModelStore(files, root, slow, sha256);
  assert.equal(await store.isInstalled(model), false);
  await assert.rejects(store.load(model), /is not downloaded on this device/);
});

test("model files: the user's own model is copied in, checked, and never downloaded", async () => {
  const files = memoryFiles();
  const get = downloader(new Map());
  const store = new ModelStore(files, "p/semantic", get, sha256);
  assert.equal((await store.customStatus()).ready, false);
  await assert.rejects(store.loadCustom(), /not set up yet/);
  assert.equal(customFileRole("C:\\models\\bge\\model_quantized.onnx"), "model.onnx");
  assert.equal(customFileRole("/home/me/Tokenizer.JSON"), "tokenizer.json");
  assert.equal(customFileRole("tokenizer_config.json"), "tokenizer_config.json");
  assert.equal(customFileRole("vocab.txt"), null);

  const picked = [{ name: "model_int8.onnx", data: bytes("ONNX!") }, { name: "tokenizer.json", data: bytes('{"a":1}') }, { name: "README.md", data: bytes("hi") }, { name: "second.onnx", data: bytes("x") }];
  assert.deepEqual(await store.importCustom(picked), { saved: ["model.onnx", "tokenizer.json"], ignored: ["README.md", "second.onnx"] });
  assert.equal((await store.customStatus()).ready, true);
  const loaded = await store.loadCustom();
  assert.equal(loaded.tokenizerConfig, "", "tokenizer_config.json is optional");
  assert.equal(loaded.fingerprint, (await sha256(bytes("ONNX!"))).slice(0, 16));
  assert.equal(get.requests.length, 0, "nothing was requested from anywhere");

  await assert.rejects(store.importCustom([{ name: "tokenizer.json", data: bytes("{broken") }]), /tokenizer\.json is not valid JSON/);
  await assert.rejects(store.importCustom([{ name: "m.onnx", data: new ArrayBuffer(0) }]), /is empty/);
  assert.equal((await store.loadCustom()).tokenizer, '{"a":1}', "a refused file replaces nothing");

  await store.writeIndex("custom", "custom:abc:mean", bytes("db-one"));
  await store.writeIndex("arctic-embed-s", "arctic@1", bytes("db-two"));
  assert.equal(new TextDecoder().decode(await store.readIndex("custom", "custom:abc:mean")), "db-one");
  assert.equal(await store.readIndex("custom", "custom:other:mean"), null, "another model file has another index");
  assert.match(store.indexPath("custom", "custom:abc:mean"), /^p\/semantic\/index-custom-[0-9a-f]{16}\.sqlite$/);
  assert.notEqual(keyName("a|b"), keyName("a|c"));
  await store.removeModel("custom");
  assert.equal((await store.customStatus()).ready, false);
  assert.equal(await store.readIndex("custom", "custom:abc:mean"), null, "its index goes with it");
  assert.ok(await store.readIndex("arctic-embed-s", "arctic@1"), "another model's index is untouched");
});

test("model files: an index is written beside the old one and swapped in; an interrupted write is recovered", async () => {
  const files = memoryFiles();
  const store = new ModelStore(files, "p/semantic", downloader(new Map()), sha256);
  await store.writeIndex("m", "k", bytes("one"));
  await store.writeIndex("m", "k", bytes("two"));
  const path = store.indexPath("m", "k");
  assert.deepEqual(files.writes, [`${path}.tmp`, `${path}.tmp`], "the live file is never written in place");
  assert.equal(new TextDecoder().decode(await store.readIndex("m", "k")), "two");
  // Stopped between "remove the old file" and "rename the new one".
  files.files.set(`${path}.tmp`, files.files.get(path));
  files.files.delete(path);
  assert.equal(new TextDecoder().decode(await store.readIndex("m", "k")), "two");
  assert.equal(await store.indexSize("m", "nope"), null);
});

/* -------------------------------------------------------------- controller */

test("controller: off does nothing at all; on with the model present builds the index and answers", async () => {
  const off = await controllerWith({ settings: { enabled: false } });
  await off.controller.apply();
  assert.equal(off.controller.overview().phase, "off");
  assert.match(off.controller.overview().message, /off\. Search uses words only/);
  assert.equal(off.createWorker.made.length, 0, "no worker, no model in memory");
  assert.equal(off.requests.length, 0);
  assert.deepEqual(off.controller.info().state, "off");
  assert.deepEqual(await off.controller.candidates("anything", new Set(["Ops/Backups.md"])), []);

  const on = await controllerWith();
  await on.controller.apply();
  await on.controller.service.idle();
  const o = on.controller.overview();
  assert.deepEqual([o.phase, o.indexedNotes, o.totalNotes, o.download], ["ready", 6, 6, null]);
  assert.match(o.message, /^Ready\. 6 notes in \d+ passages are searchable by meaning\.$/);
  assert.deepEqual(on.controller.info(), { state: "ready", model: on.real.label });
  assert.equal(on.requests.length, 0, "a model already on this device is never downloaded");
  const allowed = new Set(Object.keys(NOTES));
  assert.deepEqual(Object.keys((await on.controller.candidates("my computer crashed, how do I get it going again", allowed))[0]).sort(), ["offsetChars", "path", "score"]);
  assert.equal((await on.controller.related(["Ops/Recovery runbook.md"], allowed, 3))[0].path, "Ops/Backups.md");
  assert.ok([...on.files.files.keys()].some((p) => /semantic\/index-all-minilm-l6-v2-[0-9a-f]{16}\.sqlite$/.test(p)), "the SQLite index is in the plugin's folder");
  assert.ok([...on.files.files.keys()].every((p) => p.startsWith(".obsidian/plugins/kosmos-oden/semantic/")), "nothing is written anywhere else");

  await on.controller.apply();
  assert.equal(on.createWorker.made.length, 1, "applying unchanged settings does not reload the model");
  await on.controller.dispose();
  assert.equal(on.createWorker.made[0].terminated, true);
  await on.controller.dispose();
});

test("controller: turned on without the model it waits for the user; it never downloads by itself", async () => {
  const c = await controllerWith({ install: false });
  await c.controller.apply();
  assert.equal(c.controller.overview().phase, "needs_model");
  assert.match(c.controller.overview().message, /not on this device yet\. Press Download/);
  assert.equal(c.requests.length, 0, "settings that synced from another device download nothing");
  assert.equal(c.createWorker.made.length, 0);
  assert.equal(c.controller.info().state, "off");
  assert.match(c.controller.info().detail, /model is not on this device/);
  assert.deepEqual(await c.controller.installed(), { "arctic-embed-s": false, "all-minilm-l6-v2": false, "bge-small-en-v1.5": false, "bge-base-en-v1.5": false, "multilingual-e5-small": false, custom: false });

  const release = c.hold();
  const run = c.controller.download(c.real.id);
  await until(() => c.controller.overview().download?.receivedBytes > 0, "download progress");
  const during = c.controller.overview();
  assert.equal(during.phase, "downloading");
  assert.match(during.message, /^Downloading the model: [\d.]+ MB of 24 MB \(\d+%\)\.$/);
  await assert.rejects(c.controller.download("arctic-embed-s"), /Another model is being downloaded/);
  release();
  await run;
  assert.deepEqual(c.requests, c.real.files.map((f) => modelFileUrl(c.real, f)), "only the chosen model's three files were requested");
  await c.controller.service.idle();
  assert.equal(c.controller.overview().phase, "ready", "after the download the index is built without another click");
  assert.equal((await c.controller.installed())[c.real.id], true);
  await assert.rejects(c.controller.download("not-a-model"), /not in the catalog/);
  await c.controller.dispose();
});

test("controller: a cancelled download keeps nothing and says so", async () => {
  const c = await controllerWith({ install: false });
  await c.controller.apply();
  const release = c.hold();
  const run = c.controller.download(c.real.id);
  await until(() => c.controller.overview().phase === "downloading", "downloading");
  c.controller.cancelDownload();
  release();
  await assert.rejects(run, /The download was cancelled\. Nothing was kept\./);
  assert.equal(c.controller.overview().phase, "needs_model");
  assert.equal(c.controller.overview().download, null);
  assert.equal(c.files.files.size, 0);
  await c.controller.dispose();
});

test("controller: switching model, turning off and on, and deleting a model", async () => {
  const c = await controllerWith();
  await c.controller.apply();
  await c.controller.service.idle();
  const embedded = c.createWorker.passages();

  c.set({ enabled: false });
  await c.controller.apply();
  assert.equal(c.controller.overview().phase, "off");
  assert.equal(c.createWorker.made[0].terminated, true, "off frees the model");
  assert.ok([...c.files.files.keys()].some((p) => p.endsWith(".sqlite")), "the index file stays");
  c.set({ enabled: true });
  await c.controller.apply();
  await c.controller.service.idle();
  assert.equal(c.controller.overview().phase, "ready");
  assert.equal(c.createWorker.passages(), embedded, "turning it on again embeds nothing: the stored index is reused");

  c.set({ modelId: "arctic-embed-s" });
  await c.controller.apply();
  assert.equal(c.controller.overview().phase, "needs_model", "another model that is not here: wait for the user");
  assert.equal(c.controller.overview().model, catalogModel("arctic-embed-s").label);
  assert.equal(c.createWorker.made.at(-1).terminated, true);
  assert.deepEqual(await c.controller.candidates("my computer crashed", new Set(Object.keys(NOTES))), [], "meanwhile, words only");
  c.set({ modelId: c.real.id });
  await c.controller.apply();
  await c.controller.service.idle();
  assert.equal(c.controller.overview().phase, "ready");

  await c.controller.removeModel(c.real.id);
  assert.equal(c.controller.overview().phase, "needs_model");
  assert.equal(c.files.files.size, 0, "the model and the index built with it are deleted");
  await c.controller.dispose();
});

test("controller: the user's own model — pick files, an index per file and recipe, no download", async () => {
  const c = await controllerWith({ install: false, settings: { modelId: "custom", custom: { name: "House model", pooling: "cls" } } });
  await c.controller.apply();
  assert.equal(c.controller.overview().phase, "needs_model");
  assert.match(c.controller.overview().message, /Choose your model files below/);
  const result = await c.controller.importCustom([{ name: "my-model.onnx", data: bytes("ONNX-A") }, { name: "tokenizer.json", data: bytes("{}") }, { name: "notes.txt", data: bytes("x") }]);
  assert.deepEqual(result, { saved: ["model.onnx", "tokenizer.json"], ignored: ["notes.txt"] });
  await c.controller.service.idle();
  const o = c.controller.overview();
  assert.deepEqual([o.phase, o.model, o.indexedNotes], ["ready", "House model", 6]);
  assert.equal(c.controller.info().model, "House model");
  const load = c.createWorker.made.at(-1).loads[0];
  assert.deepEqual([load.recipe.pooling, load.recipe.dims, load.modelBytes], ["cls", 0, 6], "the vector length is detected from the model");
  assert.equal((await c.controller.candidates("my computer crashed, how do I get it going again", new Set(Object.keys(NOTES))))[0].path, "Ops/Recovery runbook.md");
  assert.equal(c.requests.length, 0, "the user's own model never touches the network");

  const workers = c.createWorker.made.length;
  c.set({ custom: { name: "Renamed", pooling: "cls" } });
  await c.controller.apply();
  assert.equal(c.createWorker.made.length, workers, "a new display name does not reload the model");
  await c.controller.service.idle();
  assert.equal(c.controller.overview().model, "Renamed", "but it is shown at once");
  assert.equal(c.controller.info().model, "Renamed");
  const indexes = () => [...c.files.files.keys()].filter((p) => p.endsWith(".sqlite")).length;
  assert.equal(indexes(), 1, "and keeps the same index");
  c.set({ custom: { name: "Renamed", pooling: "mean" } });
  await c.controller.apply();
  await c.controller.service.idle();
  assert.equal(indexes(), 2, "another pooling makes other vectors: another index");
  await c.controller.importCustom([{ name: "other.onnx", data: bytes("ONNX-B") }]);
  await c.controller.service.idle();
  assert.equal(indexes(), 3, "another model file: another index");
  assert.equal(c.controller.overview().phase, "ready");
  await c.controller.dispose();
});

test("controller: a model that will not load is shown as a plain error and search continues with words", async () => {
  const c = await controllerWith();
  c.createWorker.failLoad = "this file is not an ONNX model";
  await c.controller.apply();
  const o = c.controller.overview();
  assert.equal(o.phase, "error");
  assert.equal(o.message, "Semantic search could not start: this file is not an ONNX model");
  assert.equal(c.controller.info().state, "error");
  assert.deepEqual(await c.controller.candidates("anything", new Set(Object.keys(NOTES))), []);
  c.createWorker.failLoad = "";
  await c.controller.apply();
  await c.controller.service.idle();
  assert.equal(c.controller.overview().phase, "ready", "applying again retries");

  c.createWorker.made.at(-1).crash("out of memory");
  assert.equal(c.controller.overview().phase, "error");
  assert.match(c.controller.overview().message, /stopped: out of memory\. Search uses words only/);
  await c.controller.dispose();
});

test("controller: while the index is being built it says so, and an agent is told the answer is partial", async () => {
  const notes = {};
  for (let i = 0; i < 40; i++) notes[`N/${i}.md`] = `# N${i}\n\nbread flour ${i}.\n`;
  const c = await controllerWith({ notes });
  c.controller.setPaused(true);
  await c.controller.apply();
  await c.controller.service.idle();
  assert.equal(c.controller.overview().phase, "paused");
  c.controller.setPaused(false);
  await until(() => c.controller.overview().indexedNotes > 0, "some progress");
  const mid = c.controller.overview();
  if (mid.phase === "indexing") {
    assert.match(mid.message, /^Reading your notes: \d+ of 40 embedded\. Search already works and improves as this finishes\.$/);
    assert.deepEqual(Object.keys(c.controller.info()).sort(), ["detail", "model", "state"]);
    assert.equal(c.controller.info().state, "partial");
    assert.match(c.controller.info().detail, /of 40 notes are embedded so far/);
  }
  await c.controller.service.idle();
  assert.equal(c.controller.overview().phase, "ready");
  await c.controller.rebuild();
  await c.controller.service.idle();
  assert.equal(c.controller.overview().indexedNotes, 40);
  await c.controller.dispose();
});

/* ------------------------------------------------------------ source rules */

test("source: semantic search has one place that can reach the network, and it only fetches catalog files", () => {
  const dir = new URL("../src/semantic/", import.meta.url);
  const network = /\bfetch\s*\(|XMLHttpRequest|WebSocket|requestUrl|EventSource|sendBeacon|importScripts\s*\(/;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".ts")) continue;
    assert.doesNotMatch(readFileSync(new URL(name, dir), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), network, `src/semantic/${name} must not reach the network`);
  }
  const host = readFileSync(new URL("../src/plugin/semantic-host.ts", import.meta.url), "utf8");
  assert.equal(host.match(/\bfetch\s*\(/g).length, 1);
  assert.equal(host.match(/\brequestUrl\s*\(/g).length, 1);
  assert.match(host, /if \(!url\.startsWith\(MODEL_HOST\)\) throw/, "any other address is refused before a request is made");
  assert.match(host, /const MODEL_HOST = "https:\/\/huggingface\.co\/";/);
  assert.match(host, /credentials: "omit"/);
  const ui = readFileSync(new URL("../src/ui/semantic-settings.ts", import.meta.url), "utf8");
  assert.doesNotMatch(ui, network);
});

test("source: the worker is built with both WebAssembly runtimes inside it and is embedded in main.js", () => {
  const worker = readFileSync(new URL("../dist/kosmos-semantic-worker.txt", import.meta.url), "utf8");
  assert.ok(worker.length > 4_000_000, "ONNX Runtime and SQLite are inside the worker");
  assert.doesNotMatch(worker, /cdn\.jsdelivr\.net\/npm\/onnxruntime-web|unpkg\.com|sql\.js\.org\/dist/, "no runtime is fetched from a CDN");
  assert.doesNotMatch(worker, /^\s*import\s|^\s*export\s/m, "a classic worker script: no imports to resolve");
});
