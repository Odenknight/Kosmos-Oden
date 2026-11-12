/** Personal Notes search (0.9.0): matching, Unicode fidelity, excerpts, query limits, corpus (Q01/Q02). */
import test from "node:test";
import assert from "node:assert/strict";
import {
  PERSONAL_LIMITS,
  PersonalError,
  parseQuery,
  prepareDoc,
  SearchRun,
  toSearchable,
  toRawOffset,
  excerptAt,
  utf8Length,
  MemoryCorpus,
  EditScheduler,
  SearchWorkerEngine,
} from "../dist/kosmos-personal-notes.mjs";

const doc = (path, raw, extra = {}) => ({ path, title: extra.title ?? path.replace(/^.*\//, "").replace(/\.md$/, ""), aliases: extra.aliases ?? [], tags: extra.tags ?? [], raw });
function search(docs, query, opts = {}) {
  const run = new SearchRun(parseQuery(query), opts);
  for (const p of docs.map(prepareDoc)) run.consider(p);
  return { total: run.total, hits: run.hits() };
}
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const rejects = (fn, code) => assert.throws(fn, (e) => e instanceof PersonalError && e.code === code);

/* ------------------------------------------------------------------ matching */

const DOCS = [
  doc("Import/Keep/Shopping list.md", "- [ ] olive oil\n- [ ] bread\n- [x] invoice 1048 for the plumber", { tags: ["Keep/Pinned"] }),
  doc("Import/OneNote/Garden/Tomatoes.md", "Planted in May. Water every second day. Buy olive oil soap for aphids.", { tags: ["garden"], aliases: ["Tomato notes"] }),
  doc("Journal/2026-05-01.md", "Private thought about the plumber. Oil olive."),
];

test("every term must match; weights rank title over body; ties break by path", () => {
  assert.deepEqual(search(DOCS, "olive oil").hits.map((h) => h.path), ["Import/Keep/Shopping list.md", "Import/OneNote/Garden/Tomatoes.md", "Journal/2026-05-01.md"]);
  assert.equal(search(DOCS, "olive tractor").total, 0);
  const shopping = search(DOCS, "shopping").hits[0];
  assert.deepEqual(shopping.matchedIn, ["title", "path"]);
  assert.equal(shopping.score, 3 + 2, "title weight 3 plus whole-query title-prefix bonus 2");
  assert.equal(search(DOCS, "TOMATO NOTES").hits[0].matchedIn.includes("alias"), true);
  assert.equal(search(DOCS, "keep/pinned").hits[0].matchedIn.includes("tag"), true);
  assert.equal(search(DOCS, "").total, 0);
  const many = Array.from({ length: 300 }, (_, i) => doc(`N/${String(299 - i).padStart(3, "0")}.md`, "common word"));
  const r = search(many, "common", { limit: 100 });
  assert.equal(r.total, 300);
  assert.equal(r.hits.length, 100, "bounded top-k");
  assert.deepEqual(r.hits.map((h) => h.path), [...r.hits.map((h) => h.path)].sort(), "equal scores come back in path order");
  assert.equal(r.hits[0].path, "N/000.md");
});

test("quoted text is a contiguous phrase; an optional tag filter is exact", () => {
  assert.deepEqual(search(DOCS, '"olive oil"').hits.map((h) => h.path), ["Import/Keep/Shopping list.md", "Import/OneNote/Garden/Tomatoes.md"], "'Oil olive' is not the phrase");
  assert.equal(search(DOCS, '"every second day"').hits[0].path, "Import/OneNote/Garden/Tomatoes.md");
  assert.deepEqual(parseQuery('Shopping "Olive  Oil" shopping'), ["shopping", "olive oil"]);
  assert.deepEqual(parseQuery('ab"cd ef"'), ["ab", "cd ef"], "a quote ends the open term");
  assert.deepEqual(search(DOCS, "olive", { tag: "#GARDEN" }).hits.map((h) => h.path), ["Import/OneNote/Garden/Tomatoes.md"]);
  assert.equal(search(DOCS, "olive", { tag: "gard" }).total, 0, "tag filter is not a substring match");
});

test("query limits reject instead of truncating; unclosed quotes are an error", () => {
  rejects(() => parseQuery('"olive'), "invalid_query");
  rejects(() => parseQuery('olive "oil" "soap'), "invalid_query");
  rejects(() => parseQuery(undefined), "invalid_query");
  rejects(() => parseQuery("x".repeat(501)), "invalid_query");
  assert.deepEqual(parseQuery("x".repeat(500)), ["x".repeat(500)]);
  assert.equal(parseQuery("😀".repeat(300)).length, 1, "the limit counts code points, not UTF-16 units");
  rejects(() => parseQuery(Array.from({ length: 17 }, (_, i) => `t${i}`).join(" ")), "invalid_query");
  assert.equal(parseQuery(Array.from({ length: 16 }, (_, i) => `t${i}`).join(" ")).length, 16);
  assert.deepEqual(parseQuery("   "), []);
});

/* ------------------------------------------------------------------ fidelity */

test("Q01: a match beyond 200,000 characters of complete raw Markdown is found", () => {
  const raw = "---\ntitle: Long\n---\n" + "lorem ipsum ".repeat(25_000) + "The TailWord is here.";
  assert.ok(raw.length > 300_000);
  const r = search([doc("Long.md", raw)], "tailword");
  assert.equal(r.total, 1);
  assert.match(r.hits[0].excerpt, /The TailWord is here\.$/);
  assert.ok(r.hits[0].excerpt.startsWith("… "));
});

test("Q02: NFC and NFD spellings match each other and excerpts keep the source spelling", () => {
  const docs = [doc("Cafe.md", "Meet at the café on Tuesday."), doc("Composed.md", "Another café visit.")];
  assert.equal(search(docs, "café").total, 2, "NFC query finds NFD and NFC text");
  assert.equal(search(docs, "café").total, 2, "NFD query too");
  const hit = search(docs, "café").hits.find((h) => h.path === "Cafe.md");
  assert.ok(hit.excerpt.includes("café on Tuesday"), "excerpt keeps the decomposed source, not the NFC copy");
  assert.ok(!hit.excerpt.includes("café"));
});

test("Q02: excerpts keep original case, including length-changing İ", () => {
  const docs = [doc("Trip.md", "Trip notes: İSTANBUL MixedCASE itinerary")];
  assert.equal(search(docs, "mixedcase").hits[0].excerpt, "Trip notes: İSTANBUL MixedCASE itinerary");
  assert.equal(search(docs, "İstanbul").total, 1);
  assert.equal(search(docs, "İstanbul").hits[0].excerpt, "Trip notes: İSTANBUL MixedCASE itinerary");
});

test("Q02: offsets stay exact after many length-changing characters", () => {
  const raw = "İ".repeat(300) + " " + "é".repeat(100) + " " + "filler ".repeat(100) + "Needle In Original Case";
  const s = toSearchable(raw);
  assert.notEqual(s.text.length, raw.length, "the searchable copy really changed length");
  const at = s.text.indexOf("needle");
  assert.equal(raw.slice(toRawOffset(s.map, at), toRawOffset(s.map, at + 6, true)), "Needle");
  const ex = search([doc("N.md", raw)], "needle").hits[0].excerpt;
  assert.match(ex, /filler Needle In Original Case$/);
  assert.ok(!ex.includes("İ"), "excerpt is centred on the match, not drifted toward the start");
  assert.equal(toSearchable("plain ascii").map, null, "ASCII text needs no offset map");
  assert.equal(toSearchable("Привет МИР, ΟΔΟΣ").map, null, "length-preserving case mapping needs no offset map");
});

test("Q02: emoji, non-Latin scripts and surrogate-safe excerpts", () => {
  const docs = [
    doc("Party.md", "Party 🎉🎉 planning for the 👩‍👩‍👧 family"),
    doc("Ru.md", "Привет МИР и всем"),
    doc("Jp.md", "東京タワーに行きました"),
    doc("Gr.md", "Η ΟΔΟΣ είναι μακριά"),
    doc("Ar.md", "مرحبا بالعالم"),
  ];
  assert.deepEqual(search(docs, "🎉").hits.map((h) => h.path), ["Party.md"]);
  assert.equal(search(docs, "мир").hits[0].excerpt, "Привет МИР и всем");
  assert.equal(search(docs, "東京").hits[0].path, "Jp.md");
  assert.equal(search(docs, "οδος").hits[0].path, "Gr.md");
  assert.equal(search(docs, "بالعالم").hits[0].path, "Ar.md");
  for (let pad = 0; pad < 4; pad++) {
    const raw = "x".repeat(pad) + "😀".repeat(400) + " needle " + "😀".repeat(400);
    const ex = search([doc("E.md", raw)], "needle").hits[0].excerpt;
    assert.ok(ex.length <= PERSONAL_LIMITS.excerptChars, `length ${ex.length}`);
    assert.ok(!LONE_SURROGATE.test(ex), "no split surrogate pair");
    assert.ok(ex.includes("needle"));
  }
});

test("excerpts are at most 320 characters, collapse whitespace, and skip frontmatter when only metadata matched", () => {
  const raw = "---\ntags: [x]\n---\nFirst   line\r\n\r\nsecond line " + "word ".repeat(200);
  const titleOnly = search([doc("Notes/Alpha.md", raw)], "alpha").hits[0];
  assert.ok(titleOnly.excerpt.startsWith("First line second line"), titleOnly.excerpt);
  assert.ok(titleOnly.excerpt.length <= PERSONAL_LIMITS.excerptChars);
  assert.ok(titleOnly.excerpt.endsWith(" …"));
  assert.equal(excerptAt("short", 0), "short");
});

test("utf8Length matches TextEncoder", () => {
  for (const s of ["", "abc", "é", "東京", "😀x", "\ud800", "a\udc00b"]) assert.equal(utf8Length(s), new TextEncoder().encode(s).length, JSON.stringify(s));
});

/* -------------------------------------------------------------------- corpus */

function memorySource(files) {
  const store = new Map(Object.entries(files));
  const source = {
    store,
    unreadable: new Set(),
    reads: [],
    gate: null,
    listMarkdown: () => [...store.keys()].map((p) => source.stat(p)),
    stat: (p) => (store.has(p) ? { path: p, mtimeMs: 1, sizeBytes: Buffer.byteLength(store.get(p)) } : null),
    async readRaw(p) {
      source.reads.push(p);
      if (source.gate) await source.gate;
      if (source.unreadable.has(p)) throw new Error("EACCES");
      if (!store.has(p)) throw new Error("ENOENT");
      return store.get(p);
    },
    meta(p, raw) {
      const uid = /^uid: (\S+)$/m.exec(raw)?.[1];
      return { title: p.replace(/^.*\//, "").replace(/\.md$/, ""), aliases: [], tags: [], supersedes: [], supersededBy: [], links: [], attachments: [], ...(uid ? { uid } : {}) };
    },
    exists: (p) => store.has(p),
    resolveLink: () => null,
    physicallyContained: () => true,
  };
  return source;
}

function fakeTimers() {
  let now = 0;
  let next = 0;
  const queue = new Map();
  return {
    setTimeout(fn, ms) { queue.set(++next, { at: now + ms, fn }); return next; },
    clearTimeout(id) { queue.delete(id); },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...queue].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        queue.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = target;
    },
    get size() { return queue.size; },
  };
}

test("corpus: stable order, whole-file skip, budget and unreadable files give partial state; no prefix is stored", async () => {
  const source = memorySource({ "b.md": "bee", "a.md": "ay", "big.md": "x".repeat(2000), "c.md": "c".repeat(300), "d.md": "dee", "0locked.md": "secret" });
  source.unreadable.add("0locked.md");
  const corpus = new MemoryCorpus(source, { limits: { maxFileBytes: 1000, maxCorpusBytes: 311 } });
  assert.equal(corpus.state, "indexing");
  const deltas = [];
  corpus.subscribe((d) => deltas.push(d));
  await corpus.build();
  assert.equal(corpus.state, "partial");
  assert.deepEqual(corpus.paths(), ["a.md", "b.md", "c.md"], "accepted in stable path order until the budget is used");
  assert.deepEqual(corpus.omitted(), [
    { path: "0locked.md", reason: "unreadable" },
    { path: "big.md", reason: "too_large" },
    { path: "d.md", reason: "budget" },
  ]);
  assert.equal(corpus.get("big.md"), undefined, "an over-limit file is skipped whole, never cut to a prefix");
  assert.ok(!source.reads.includes("big.md"), "an over-limit file is not even read");
  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].reset, true);
  assert.equal(deltas[0].revision, corpus.revision);
  assert.ok(Object.isFrozen(corpus.get("a.md")) && Object.isFrozen(corpus.get("a.md").meta));
  const all = new MemoryCorpus(memorySource({ "a.md": "ay" }));
  await all.build();
  assert.equal(all.state, "ready");
});

test("corpus: edits are debounced 250 ms with a 2 s maximum wait; same content does not bump the revision", async () => {
  const timers = fakeTimers();
  const source = memorySource({ "a.md": "one", "b.md": "two" });
  const corpus = new MemoryCorpus(source, { timers });
  await corpus.build();
  const rev = corpus.revision;
  const b = corpus.get("b.md");
  source.reads.length = 0;
  source.store.set("a.md", "one edited");
  corpus.apply({ modified: ["a.md"] });
  timers.advance(249);
  assert.equal(source.reads.length, 0, "nothing read inside the debounce window");
  timers.advance(1);
  await corpus.whenIdle();
  assert.equal(corpus.get("a.md").raw, "one edited");
  assert.equal(corpus.revision, rev + 1);
  assert.equal(corpus.get("b.md"), b, "unrelated records are shared by reference, not rebuilt");

  // Continuous edits every 200 ms still flush at the 2 s maximum wait.
  source.reads.length = 0;
  for (let t = 0; t < 1900; t += 200) { corpus.apply({ modified: ["b.md"] }); timers.advance(200); }
  await corpus.whenIdle();
  assert.equal(source.reads.length, 1, "max wait forced one read");
  assert.equal(corpus.revision, rev + 1, "same raw content: no new revision");
  assert.equal(corpus.get("b.md"), b);
  timers.advance(5000);
  await corpus.whenIdle();
  assert.equal(timers.size, 0, "no timers left behind");
});

test("corpus: deletes and renames invalidate immediately; a read racing a delete is discarded", async () => {
  const timers = fakeTimers();
  const source = memorySource({ "a.md": "uid: U1\nalpha", "b.md": "uid: U1\nbeta", "c.md": "gamma" });
  const corpus = new MemoryCorpus(source, { timers });
  await corpus.build();
  assert.deepEqual(corpus.pathsByUid("U1"), ["a.md", "b.md"], "duplicate uids are visible");
  const rev = corpus.revision;
  source.store.delete("a.md");
  corpus.apply({ deleted: ["a.md"] });
  assert.equal(corpus.get("a.md"), undefined, "deleted synchronously, before any timer");
  assert.equal(corpus.revision, rev + 1);
  assert.deepEqual(corpus.pathsByUid("U1"), ["b.md"]);

  source.store.set("Moved/c.md", source.store.get("c.md"));
  source.store.delete("c.md");
  corpus.apply({ renamed: [{ from: "c.md", to: "Moved/c.md" }] });
  assert.equal(corpus.get("c.md"), undefined);
  await corpus.flush();
  assert.equal(corpus.get("Moved/c.md").raw, "gamma");

  // Modify b, hold the read, delete b meanwhile: the stale read must not resurrect it.
  let open;
  source.gate = new Promise((r) => { open = r; });
  source.store.set("b.md", "beta 2");
  corpus.apply({ modified: ["b.md"] });
  const pending = corpus.flush();
  await new Promise((r) => setImmediate(r));
  source.store.delete("b.md");
  corpus.apply({ deleted: ["b.md"] });
  source.gate = null;
  open();
  await pending;
  assert.equal(corpus.get("b.md"), undefined);
  assert.deepEqual(corpus.paths(), ["Moved/c.md"]);
});

test("corpus: an edit that crosses the per-file limit drops the old record and reports partial", async () => {
  const source = memorySource({ "a.md": "small" });
  const corpus = new MemoryCorpus(source, { limits: { maxFileBytes: 10 } });
  await corpus.build();
  source.store.set("a.md", "now far too large");
  corpus.apply({ modified: ["a.md"] });
  await corpus.flush();
  assert.equal(corpus.get("a.md"), undefined, "the stale smaller version is not kept");
  assert.equal(corpus.state, "partial");
  assert.deepEqual(corpus.omitted(), [{ path: "a.md", reason: "too_large" }]);
  corpus.dispose();
});

test("EditScheduler fires once per quiet period", () => {
  const timers = fakeTimers();
  let fired = 0;
  const s = new EditScheduler(() => fired++, timers, 250, 2000);
  s.poke(); timers.advance(100); s.poke(); timers.advance(249);
  assert.equal(fired, 0);
  timers.advance(1);
  assert.equal(fired, 1);
  s.poke(); s.cancel(); timers.advance(5000);
  assert.equal(fired, 1);
});

/* ------------------------------------------------- worker engine, in-process */

function engine() {
  const out = [];
  const e = new SearchWorkerEngine((m) => out.push(m));
  const next = (type) => new Promise((resolve) => {
    const poll = () => { const i = out.findIndex((m) => m.type === type); if (i >= 0) resolve(out.splice(i, 1)[0]); else setImmediate(poll); };
    poll();
  });
  return { e, out, next };
}

test("scoped coverage counts only omitted files inside the requester's scope; filtering precedes matching", async () => {
  const { e, next } = engine();
  e.receive({
    type: "mutate", revision: 1, reset: true, final: true, state: "partial", deletes: [],
    upserts: [doc("Shared/a.md", "plumber invoice"), doc("Private/b.md", "plumber diary")],
    omitted: [{ path: "Private/huge.md", reason: "too_large" }, { path: "Shared/huge.md", reason: "budget" }],
  });
  assert.equal((await next("applied")).revision, 1);
  e.receive({ type: "scope", scopeId: 1, paths: ["Shared/a.md", "Shared/huge.md"] });
  e.receive({ type: "search", id: 1, revision: 1, generation: 0, scopeId: 1, query: "plumber", limit: 20 });
  const scoped = await next("result");
  assert.deepEqual(scoped.response.hits.map((h) => h.path), ["Shared/a.md"]);
  assert.equal(scoped.response.total, 1, "hidden notes are not counted");
  assert.deepEqual(scoped.response.coverage, { state: "partial", searched: 1, omitted: 1 });
  e.receive({ type: "search", id: 2, revision: 1, generation: 0, scopeId: null, query: "plumber", limit: 20 });
  assert.deepEqual((await next("result")).response.coverage, { state: "partial", searched: 2, omitted: 2 });
  e.receive({ type: "search", id: 3, revision: 1, generation: 0, scopeId: null, query: '"open', limit: 20 });
  const err = await next("error");
  assert.equal(err.code, "invalid_query");
});

test("worker engine stops a long search between batches when cancelled", async () => {
  const { e, out, next } = engine();
  const upserts = Array.from({ length: 2000 }, (_, i) => doc(`n${String(i).padStart(4, "0")}.md`, "alpha ".repeat(50)));
  e.receive({ type: "mutate", revision: 1, reset: true, final: true, state: "ready", deletes: [], omitted: [], upserts });
  await next("applied");
  e.receive({ type: "search", id: 7, revision: 1, generation: 0, scopeId: null, query: "alpha", limit: 5 });
  await new Promise((r) => setImmediate(r)); // let it start and yield after its first batch
  e.receive({ type: "cancel", id: 7 });
  assert.equal((await next("cancelled")).id, 7);
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(!out.some((m) => m.type === "result"), "no result after cancellation");
});
