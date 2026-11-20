/**
 * The Librarian core is imported from GKOS-Engine (inside `gkos-engine/notes`),
 * not kept here. These tests replay the Engine's frozen vectors, as shipped
 * in the pinned package, through this plugin's own build: the answers a user
 * gets are the answers the Engine froze, byte for byte.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  LibrarianIndex, PersonalError, classifyIntent, editDistance, indexDoc, parseQuestion, prepareDoc, runLibrarian,
  scanWords, stem, toSearchable,
} from "../dist/kosmos-personal-notes.mjs";

const stored = (path) => readFileSync(new URL(`../node_modules/gkos-engine/contracts/librarian/kosmos-librarian-1/${path}`, import.meta.url));
const sha256 = (bytes) => "sha256:" + createHash("sha256").update(bytes).digest("hex");
const plain = (value) => JSON.parse(JSON.stringify(value));
/** Index `notes` in order into one vocabulary and ask over those whose path is in `pool`. */
function ask(notes, pool, item) {
  const index = new LibrarianIndex();
  const allowed = new Set(pool);
  const entries = notes.map((note) => { const prepared = prepareDoc(note); return { prepared, vector: indexDoc(prepared, index.vocab) }; });
  const options = { ...(item.limit === undefined ? {} : { limit: item.limit }), ...(item.semantic ? { semantic: item.semantic } : {}) };
  return plain(runLibrarian(item.question, entries.filter((entry) => allowed.has(entry.prepared.doc.path)), index, options));
}

test("the vectors in the pinned Engine package are the files its manifest names", () => {
  const manifest = JSON.parse(stored("manifest.json"));
  assert.equal(manifest.contract, "kosmos-librarian/1");
  assert.deepEqual(manifest.files.map((file) => file.path), ["vectors/core.json", "vectors/noninterference.json"]);
  for (const file of manifest.files) {
    const bytes = stored(file.path);
    assert.deepEqual([file.bytes, file.sha256], [bytes.length, sha256(bytes)], file.path);
  }
});

test("this build gives the Engine's frozen answers: core.json", () => {
  const core = JSON.parse(stored("vectors/core.json"));
  assert.ok(core.cases.length >= 20 && core.rejected.length >= 4);
  for (const [word, expected] of core.primitives.stem) assert.equal(stem(word), expected, word);
  for (const item of core.primitives.searchable) assert.equal(toSearchable(item.raw).text, item.text, JSON.stringify(item.raw));
  for (const item of core.primitives.words) assert.deepEqual(scanWords(toSearchable(item.text).text), item.words, item.text);
  for (const item of core.primitives.edit_distance) assert.equal(editDistance(item.a, item.b, item.max), item.distance, JSON.stringify(item));
  for (const item of core.primitives.intent) assert.equal(classifyIntent(item.question), item.intent, item.question);
  for (const item of core.primitives.question) assert.deepEqual(plain(parseQuestion(item.question)), item.parsed, item.question);
  const paths = core.notes.map((note) => note.path);
  for (const item of core.cases) assert.deepEqual(ask(core.notes, paths, item), item.expected, item.id);
  // A rejected question is refused with the plugin's own error class: one class, not a second copy in the bundle.
  for (const item of core.rejected) {
    assert.throws(() => ask(core.notes, paths, item), (error) => error instanceof PersonalError && error.code === item.error, item.id);
  }
});

test("this build gives the Engine's frozen answers: noninterference.json, every reader in every world", () => {
  const vectors = JSON.parse(stored("vectors/noninterference.json"));
  let replayed = 0;
  for (const item of vectors.cases) for (const reader of vectors.readers) for (const id of reader.worlds) {
    const world = vectors.worlds.find((candidate) => candidate.id === id);
    assert.deepEqual(ask(world.notes.map((key) => vectors.notes[key]), reader.pool, item), item.expected[reader.id], `${item.id}: ${reader.id} in ${id}`);
    replayed++;
  }
  assert.equal(replayed, vectors.cases.length * 8);
});
