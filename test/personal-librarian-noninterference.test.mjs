/**
 * Personal Notes (0.9.5) — the Librarian does not let notes a requester cannot
 * read change what that requester sees.
 *
 * Paired worlds: W0 = the readable notes only; W1 = W0 plus unreadable notes;
 * W2 = W1 with the unreadable notes edited, then deleted. The requester's whole
 * answer (hits, order, scores, corrections, expansion words, unmatched words,
 * missing phrases, confidence, counts) must be the same in every world. A
 * requester who can read the extra notes must get a different answer, so the
 * tests cannot pass by retrieving nothing.
 *
 * `corpusRevision` is left out of the comparison: it is the whole corpus's
 * revision (see search-worker.ts), not a per-requester value.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { LibrarianIndex, MemoryCorpus, PersonalSearchClient, indexDoc, prepareDoc, runLibrarian } from "../dist/kosmos-personal-notes.mjs";
import { nodeWorkerFactory } from "./helpers/node-search-worker.mjs";

const titleOf = (path, raw) => (raw.match(/^#\s+(.+)$/m)?.[1] ?? path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "")).trim();
const pad = (i) => String(i).padStart(3, "0");
const letters = "bcdefghijklmnopqrstu"; // twenty near-spellings of "aaaaa": abaaa .. auaaa

const LAPTOP = (name) => `# Laptop note ${name}\n\nlaptop ${["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"].map((w) => `${w} ${w} ${w}`).join(" ")}\n`;
const READABLE = {
  "R/laptop-a.md": LAPTOP("A"),
  "R/laptop-b.md": LAPTOP("B"),
  "R/spelling.md": "# Spelling\n\nThe word azaaa is written here.\n",
  "R/planning.md": "# Planning\n\nThe budget review happens monthly. The quarterly report is attached.\n",
};

/** Unreadable notes: one version per world. */
function hidden(version) {
  const out = {};
  if (version === 0) return out;
  // Near-spellings of "aaaaa" that sort before the readable "azaaa".
  for (const [i, c] of [...letters].entries()) out[`H/near-${pad(i)}.md`] = version === 1 ? `# Hidden\n\nword a${c}aaa\n` : `# Hidden\n\nword a${c}aab and a${c}aaa\n`;
  // Common words of the readable laptop notes, everywhere: a corpus-wide statistic would demote them.
  for (let i = 0; i < 30; i++) out[`H/df-${pad(i)}.md`] = version === 1 ? "alpha bravo charlie delta\n" : "alpha bravo charlie delta golf\n";
  out["H/zebra.md"] = version === 1 ? "zebrafish sighting\n" : "zebrafish sighting again\n";
  out["H/phrase.md"] = "purple monkey dishwasher report\n";
  // Matches every word of the questions, in the title too: a strong rival if it counted.
  out["H/budget.md"] = "# Budget review\n\nbudget review budget review laptop\n";
  for (let i = 0; i < 100; i++) out[`H/many-${pad(i)}.md`] = `# Many ${i}\n\nlaptop budget review aaaaa ${version === 2 ? "edited" : ""}\n`;
  return out;
}

const QUESTIONS = [
  "aaaaa",
  "laptop",
  "zebrafish",
  '"purple monkey dishwasher" report',
  "budget review",
  "laptop budget review",
  "how do I review the budgte",
];

/** What a requester sees from one worker answer. */
const visible = ({ corpusRevision: _revision, ...rest }) => rest;

/* ------------------------------------------------------------------ the pure function */

/** An index over `files`, the way the worker builds one: one shared vocabulary, every note added. */
function indexOf(files, index = new LibrarianIndex(), entries = new Map()) {
  for (const [path, raw] of Object.entries(files)) {
    const old = entries.get(path);
    if (old) index.remove(old.vector);
    const prepared = prepareDoc({ path, title: titleOf(path, raw), aliases: [], tags: [], raw });
    const vector = indexDoc(prepared, index.vocab);
    index.add(vector);
    entries.set(path, { prepared, vector });
  }
  return { index, entries };
}
function remove(world, paths) {
  for (const path of paths) { world.index.remove(world.entries.get(path).vector); world.entries.delete(path); }
}
const poolOf = (world, allowed) => [...world.entries.values()].filter((e) => !allowed || allowed.has(e.prepared.doc.path));
const READ = new Set(Object.keys(READABLE));

/** W0, W1 and W2 (edited, then deleted) over one shared index, as the worker keeps it. */
function worlds() {
  const w0 = indexOf(READABLE);
  const w1 = indexOf({ ...READABLE, ...hidden(1) });
  const w2edit = indexOf({ ...READABLE, ...hidden(1) });
  indexOf(hidden(2), w2edit.index, w2edit.entries);
  const w2gone = indexOf({ ...READABLE, ...hidden(1) });
  remove(w2gone, Object.keys(hidden(1)));
  return { w0, w1, w2edit, w2gone };
}

test("librarian scope: notes outside the pool change nothing the requester sees (pure function)", () => {
  const { w0, w1, w2edit, w2gone } = worlds();
  for (const question of QUESTIONS) {
    const base = runLibrarian(question, poolOf(w0, READ), w0.index);
    for (const [name, w] of Object.entries({ w1, w2edit, w2gone })) {
      assert.deepEqual(runLibrarian(question, poolOf(w, READ), w.index), base, `${question}: ${name}`);
    }
    // Positive control: a requester who can read the extra notes is answered from them.
    assert.notDeepEqual(runLibrarian(question, poolOf(w1, null), w1.index), base, `${question}: whole corpus differs`);
  }
});

test("librarian scope: twenty unreadable near-spellings do not crowd out the readable correction", () => {
  const { w0, w1, w2gone } = worlds();
  for (const w of [w0, w1, w2gone]) {
    const r = runLibrarian("aaaaa", poolOf(w, READ), w.index);
    assert.deepEqual(r.corrections, [{ from: "aaaaa", to: "azaaa" }]);
    assert.deepEqual(r.unmatched, []);
    assert.deepEqual(r.hits.map((h) => h.path), ["R/spelling.md"]);
  }
  // Deleted near-spellings stay in the vocabulary with no notes: the owner's own
  // answer over every note (the index's own frequencies) ignores them too.
  const owner = runLibrarian("aaaaa", poolOf(w2gone, null), w2gone.index, { frequencies: w2gone.index.frequencies });
  assert.deepEqual(owner.corrections, [{ from: "aaaaa", to: "azaaa" }]);
  assert.deepEqual(owner, runLibrarian("aaaaa", poolOf(w0, null), w0.index));
});

test("librarian scope: expansion words are weighted by the pool's document frequencies", () => {
  const { w0, w1 } = worlds();
  const base = runLibrarian("laptop", poolOf(w0, READ), w0.index);
  assert.ok(base.expanded.length > 0, "the readable notes lend expansion words");
  assert.deepEqual(runLibrarian("laptop", poolOf(w1, READ), w1.index).expanded, base.expanded);
  // The index's own frequencies are the whole corpus's: right for the owner, wrong for a scope.
  const owner = runLibrarian("laptop", poolOf(w0, null), w0.index, { frequencies: w0.index.frequencies });
  assert.deepEqual(owner, runLibrarian("laptop", poolOf(w0, null), w0.index), "index frequencies equal the computed ones for the whole corpus");
});

test("librarian scope: words, phrases and rivals found only in unreadable notes", () => {
  const { w0, w1 } = worlds();
  const ask = (w, q, allowed = READ) => runLibrarian(q, poolOf(w, allowed), w.index);
  assert.deepEqual(ask(w1, "zebrafish").unmatched, ["zebrafish"]);
  assert.deepEqual(ask(w1, "zebrafish").hits, []);
  assert.deepEqual(ask(w1, "zebrafish", null).hits.map((h) => h.path), ["H/zebra.md"]);
  const phrase = '"purple monkey dishwasher" report';
  assert.deepEqual(ask(w1, phrase).phrasesMissing, ["purple monkey dishwasher"]);
  assert.deepEqual(ask(w1, phrase, null).phrasesMissing, []);
  // A hidden note carrying every question word (and the title) neither outranks nor weakens the readable answer.
  const r = ask(w1, "budget review");
  assert.equal(r.hits[0].path, "R/planning.md");
  assert.equal(r.confidence, ask(w0, "budget review").confidence);
  assert.equal(ask(w1, "budget review", null).hits[0].path, "H/budget.md");
  // A hundred hidden matches change no count.
  const many = ask(w1, "laptop budget review");
  assert.equal(many.total, ask(w0, "laptop budget review").total);
  assert.ok(ask(w1, "laptop budget review", null).total >= 100);
});

test("librarian scope: semantic candidates for unreadable notes are ignored", () => {
  const { w0, w1 } = worlds();
  const readable = [{ path: "R/planning.md", score: 0.5, offsetChars: 0 }];
  const withHidden = [{ path: "H/zebra.md", score: 0.99, offsetChars: 0 }, { path: "H/many-000.md", score: 0.9, offsetChars: 0 }, ...readable];
  const base = runLibrarian("zebrafish", poolOf(w0, READ), w0.index, { semantic: readable });
  assert.deepEqual(base.hits.map((h) => h.path), ["R/planning.md"]);
  assert.deepEqual(runLibrarian("zebrafish", poolOf(w1, READ), w1.index, { semantic: withHidden }), base);
  assert.equal(runLibrarian("zebrafish", poolOf(w1, null), w1.index, { semantic: withHidden }).hits[0].path, "H/zebra.md");
});

/* ------------------------------------------------------------------ through the worker */

function memorySource(files) {
  const store = new Map(Object.entries(files));
  return {
    store,
    listMarkdown: () => [...store.keys()].map((p) => ({ path: p, mtimeMs: 1, sizeBytes: Buffer.byteLength(store.get(p)) })),
    stat: (p) => (store.has(p) ? { path: p, mtimeMs: 1, sizeBytes: Buffer.byteLength(store.get(p)) } : null),
    async readRaw(p) { if (!store.has(p)) throw new Error("ENOENT"); return store.get(p); },
    meta: (p, raw) => ({ title: titleOf(p, raw), aliases: [], tags: [], supersedes: [], supersededBy: [], links: [], attachments: [] }),
    exists: (p) => store.has(p),
    resolveLink: () => null,
    physicallyContained: () => true,
  };
}
const manual = () => ({ setTimeout: () => 0, clearTimeout: () => {} });

async function workerWorld(t, files) {
  const source = memorySource(files);
  const corpus = new MemoryCorpus(source, { timers: manual() });
  const client = new PersonalSearchClient({ corpus, createWorker: nodeWorkerFactory() });
  t.after(() => { client.dispose(); corpus.dispose(); });
  await corpus.build();
  await client.whenApplied();
  /** Replace or delete (null) notes and wait until the worker holds the change. */
  const change = async (edits) => {
    for (const [path, raw] of Object.entries(edits)) { if (raw === null) source.store.delete(path); else source.store.set(path, raw); }
    corpus.apply({ modified: Object.entries(edits).filter(([, raw]) => raw !== null).map(([p]) => p), deleted: Object.entries(edits).filter(([, raw]) => raw === null).map(([p]) => p) });
    await corpus.flush();
    await client.whenApplied();
  };
  // A new set per request, as the query service builds it.
  const ask = async (question, allowed, extra = {}) => visible(await client.librarian({ question, allowedPaths: allowed ? new Set(allowed) : null, ...extra }));
  return { ask, change, corpus };
}

const SEMANTIC = [{ path: "H/zebra.md", score: 0.99, offsetChars: 0 }, { path: "R/planning.md", score: 0.5, offsetChars: 0 }];
async function answers(world, allowed) {
  const out = [];
  for (const question of QUESTIONS) out.push(await world.ask(question, allowed));
  out.push(await world.ask("zebrafish", allowed, { semantic: SEMANTIC }));
  return out;
}

test("librarian scope (worker): same answers in W0, W1 and W2, cold and warm; the owner's differ", async (t) => {
  const w0 = await workerWorld(t, READABLE);
  const base = await answers(w0, READ);
  // The worker answers like the pure function over the same notes.
  const pure = worlds().w0;
  assert.deepEqual(base[0], { ...runLibrarian(QUESTIONS[0], poolOf(pure, READ), pure.index), coverage: { state: "ready", searched: 4, omitted: 0 } });

  const w = await workerWorld(t, { ...READABLE, ...hidden(1) });
  assert.deepEqual(await answers(w, READ), base, "W1, first answers after the build (cold)");
  assert.deepEqual(await answers(w, READ), base, "W1 again (warm: same scope, new set)");
  const owner = await answers(w, null);
  for (let k = 0; k < base.length; k++) assert.notDeepEqual(owner[k], base[k], `owner answer ${k} uses the extra notes`);

  await w.change(hidden(2));
  assert.deepEqual(await answers(w, READ), base, "W2: unreadable notes edited");
  await w.change(Object.fromEntries(Object.keys(hidden(1)).map((p) => [p, null])));
  assert.deepEqual(await answers(w, READ), base, "W2: unreadable notes deleted");
  assert.deepEqual(await answers(w, null), base.map((r) => r), "the owner, now with only the readable notes, gets W0's answers");
});

test("librarian scope (worker): cached statistics follow corpus changes and scope changes", async (t) => {
  const w = await workerWorld(t, { ...READABLE, ...hidden(1) });
  const before = await answers(w, READ);

  // A readable edit: the next answer is the answer for the new readable notes.
  const edited = { "R/spelling.md": "# Spelling\n\nThe word abaaa is written here.\n" };
  await w.change(edited);
  const fresh = await workerWorld(t, { ...READABLE, ...edited });
  assert.deepEqual(await answers(w, READ), await answers(fresh, READ));
  assert.deepEqual((await w.ask("aaaaa", READ)).corrections, [{ from: "aaaaa", to: "abaaa" }]);

  // Another scope (one unreadable note now readable), then back.
  const wider = [...READ, "H/zebra.md"];
  const widerFresh = await workerWorld(t, { ...READABLE, ...edited, "H/zebra.md": hidden(1)["H/zebra.md"] });
  assert.deepEqual(await answers(w, wider), await answers(widerFresh, null));
  await w.change({ "R/spelling.md": READABLE["R/spelling.md"] });
  assert.deepEqual(await answers(w, READ), before, "back to the first readable notes and scope");
});
