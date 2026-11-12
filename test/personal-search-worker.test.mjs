/**
 * Personal Notes search worker (0.9.0), Q03: the real built worker text
 * (dist/kosmos-personal-search-worker.txt) on node:worker_threads behind the
 * client. Edit/delete/rename/rebuild, revision races, cancellation, stale
 * results after a policy change, worker failure + retry, dispose.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { MemoryCorpus, PersonalSearchClient, PersonalError } from "../dist/kosmos-personal-notes.mjs";
import { nodeWorkerFactory } from "./helpers/node-search-worker.mjs";

function memorySource(files) {
  const store = new Map(Object.entries(files));
  return {
    store,
    listMarkdown: () => [...store.keys()].map((p) => ({ path: p, mtimeMs: 1, sizeBytes: Buffer.byteLength(store.get(p)) })),
    stat: (p) => (store.has(p) ? { path: p, mtimeMs: 1, sizeBytes: Buffer.byteLength(store.get(p)) } : null),
    async readRaw(p) { if (!store.has(p)) throw new Error("ENOENT"); return store.get(p); },
    meta: (p, raw) => ({ title: p.replace(/^.*\//, "").replace(/\.md$/, ""), aliases: [], tags: /#(\w+)/.exec(raw) ? [/#(\w+)/.exec(raw)[1]] : [], supersedes: [], supersededBy: [], links: [], attachments: [] }),
    exists: (p) => store.has(p),
    resolveLink: () => null,
    physicallyContained: () => true,
  };
}

const manual = () => ({ setTimeout: () => 0, clearTimeout: () => {} }); // flushes are driven explicitly
const code = (c) => (e) => e instanceof PersonalError && e.code === c;
const paths = (r) => r.hits.map((h) => h.path);

async function setup(files, opts = {}) {
  const source = memorySource(files);
  const corpus = new MemoryCorpus(source, { timers: manual(), ...opts.corpus });
  const createWorker = opts.createWorker ?? nodeWorkerFactory();
  let released = 0;
  const client = new PersonalSearchClient({ corpus, createWorker, release: () => released++, chunkChars: opts.chunkChars });
  await corpus.build();
  await client.whenApplied();
  return { source, corpus, client, createWorker, released: () => released };
}

const search = (client, query, extra = {}) => client.search({ query, allowedPaths: null, ...extra });

test("Q03: edit, delete, rename and rebuild are reflected; unchanged records are not re-sent", async (t) => {
  const sent = [];
  const factory = nodeWorkerFactory();
  const createWorker = () => { const w = factory(); const post = w.postMessage.bind(w); w.postMessage = (m) => { sent.push(m); post(m); }; return w; };
  const { source, corpus, client } = await setup({ "a.md": "apple pie", "b.md": "banana bread", "c.md": "cherry tart" }, { chunkChars: 10, createWorker });
  t.after(() => { client.dispose(); corpus.dispose(); });
  assert.ok(sent.filter((m) => m.type === "mutate").length >= 3, "the snapshot went over in several chunks");
  assert.deepEqual(paths(await search(client, "apple")), ["a.md"]);

  sent.length = 0;
  source.store.set("a.md", "apricot jam");
  corpus.apply({ modified: ["a.md", "b.md"] }); // b.md is unchanged on disk
  await corpus.flush();
  await client.whenApplied();
  const upserted = sent.filter((m) => m.type === "mutate").flatMap((m) => m.upserts.map((d) => d.path));
  assert.deepEqual(upserted, ["a.md"], "only the changed record crosses to the worker");
  assert.equal((await search(client, "apple")).total, 0, "old text gone");
  assert.deepEqual(paths(await search(client, "apricot")), ["a.md"]);

  source.store.delete("b.md");
  corpus.apply({ deleted: ["b.md"] });
  // No flush, no wait: the query is re-issued behind the delete.
  assert.equal((await search(client, "banana")).total, 0);

  source.store.set("Moved/c.md", source.store.get("c.md"));
  source.store.delete("c.md");
  corpus.apply({ renamed: [{ from: "c.md", to: "Moved/c.md" }] });
  assert.equal((await search(client, "cherry")).total, 0, "renamed-away path invalidated immediately");
  await corpus.flush();
  const moved = await search(client, "cherry");
  assert.deepEqual(paths(moved), ["Moved/c.md"]);
  assert.equal(moved.corpusRevision, corpus.revision);

  // Restart: a fresh corpus + worker rebuilt from the vault gives the same answers.
  const corpus2 = new MemoryCorpus(source, { timers: manual() });
  const client2 = new PersonalSearchClient({ corpus: corpus2, createWorker: nodeWorkerFactory() });
  t.after(() => { client2.dispose(); corpus2.dispose(); });
  await corpus2.build();
  await client2.whenApplied();
  assert.deepEqual(paths(await search(client2, "cherry")), ["Moved/c.md"]);
  assert.equal((await search(client2, "banana")).total, 0);
});

test("Q03: results always match the active revision while edits race the query", async (t) => {
  const files = {};
  for (let i = 0; i < 400; i++) files[`n${String(i).padStart(3, "0")}.md`] = `common filler ${"x ".repeat(500)} version0`;
  const { source, corpus, client } = await setup(files);
  t.after(() => { client.dispose(); corpus.dispose(); });
  for (let round = 1; round <= 5; round++) {
    const inFlight = search(client, "common version" + round, { limit: 100 });
    for (const p of Object.keys(files)) source.store.set(p, `common filler ${"x ".repeat(500)} version${round}`);
    corpus.apply({ modified: Object.keys(files) });
    await corpus.flush();
    const r = await inFlight;
    assert.equal(r.corpusRevision, client.revision, "never resolves with an older revision");
    assert.equal(r.total, 400, `round ${round}: every note already has the new text`);
  }
});

test("Q03: AbortSignal cancels; a policy change rejects in-flight and older-generation queries", async (t) => {
  const files = {};
  for (let i = 0; i < 300; i++) files[`n${i}.md`] = "needle " + "hay ".repeat(2000);
  const { corpus, client } = await setup(files);
  t.after(() => { client.dispose(); corpus.dispose(); });
  const controller = new AbortController();
  const aborted = search(client, "needle", { signal: controller.signal });
  controller.abort();
  await assert.rejects(aborted, code("cancelled"));
  await assert.rejects(search(client, "needle", { signal: AbortSignal.abort() }), code("cancelled"));

  const allowed = new Set(["n1.md", "n2.md"]);
  const inFlight = client.search({ query: "needle", allowedPaths: allowed, policyGeneration: 0 });
  client.setPolicyGeneration(1);
  await assert.rejects(inFlight, code("policy_changed"));
  await assert.rejects(client.search({ query: "needle", allowedPaths: allowed, policyGeneration: 0 }), code("policy_changed"));
  const fresh = await client.search({ query: "needle", allowedPaths: new Set(["n1.md"]), policyGeneration: 1 });
  assert.deepEqual(paths(fresh), ["n1.md"]);
  assert.equal(fresh.coverage.searched, 1);
  await assert.rejects(search(client, '"unclosed'), code("invalid_query"));
  await assert.rejects(search(client, "x", { limit: 101 }), code("invalid_argument"));
});

test("Q03: scoped coverage through the worker counts only omissions inside the scope", async (t) => {
  const { corpus, client } = await setup(
    { "Shared/a.md": "plumber", "Shared/big.md": "y".repeat(50), "Private/big.md": "z".repeat(50), "Private/b.md": "plumber" },
    { corpus: { limits: { maxFileBytes: 20 } } },
  );
  t.after(() => { client.dispose(); corpus.dispose(); });
  const scoped = await client.search({ query: "plumber", allowedPaths: new Set(["Shared/a.md", "Shared/big.md"]) });
  assert.deepEqual(paths(scoped), ["Shared/a.md"]);
  assert.deepEqual(scoped.coverage, { state: "partial", searched: 1, omitted: 1 });
  const human = await search(client, "plumber");
  assert.deepEqual(human.coverage, { state: "partial", searched: 2, omitted: 2 });
});

test("Q03: a worker failure rejects with search_unavailable (no main-thread fallback) and retry recovers", async (t) => {
  const source = memorySource({ "a.md": "alpha" });
  const corpus = new MemoryCorpus(source, { timers: manual() });
  await corpus.build();
  let broken = true;
  const good = nodeWorkerFactory();
  const bad = nodeWorkerFactory("throw new Error('boom');");
  const client = new PersonalSearchClient({ corpus, createWorker: () => (broken ? bad() : good()) });
  t.after(() => { client.dispose(); corpus.dispose(); });
  await assert.rejects(client.whenApplied(), code("search_unavailable"));
  assert.equal(client.status, "failed");
  assert.match(client.error, /boom/);
  await assert.rejects(search(client, "alpha"), code("search_unavailable"));

  broken = false;
  await client.retry();
  assert.equal(client.status, "running");
  assert.deepEqual(paths(await search(client, "alpha")), ["a.md"]);

  // The worker dies mid-life: the pending query rejects, retry starts a fresh one.
  const pending = search(client, "alpha");
  void good.made[0].worker.terminate(); // abrupt exit, not via the client
  await assert.rejects(pending, code("search_unavailable"));
  assert.equal(client.status, "failed");
  await client.retry();
  assert.deepEqual(paths(await search(client, "alpha")), ["a.md"]);
  assert.equal(good.made.length, 2);
});

test("B03: dispose terminates the worker, releases the Blob URL once and detaches from the corpus", async () => {
  const { source, corpus, client, createWorker, released } = await setup({ "a.md": "alpha" });
  const pending = search(client, "alpha");
  client.dispose();
  client.dispose();
  await assert.rejects(pending, code("search_unavailable"));
  assert.equal(client.status, "disposed");
  assert.equal(released(), 1);
  assert.ok(createWorker.made.every((w) => w.terminated));
  await assert.rejects(search(client, "alpha"), code("search_unavailable"));
  await assert.rejects(client.retry(), code("search_unavailable"));
  source.store.set("a.md", "beta");
  corpus.apply({ modified: ["a.md"] });
  await corpus.flush(); // must not throw or post to a dead worker
  corpus.dispose();
});
