/**
 * Personal Notes search: memory held by the searchable copy of one note whose
 * lowercase/NFC form changes length (0.9.0 review item, docs/v0.9.0/PERFORMANCE.md).
 *
 *   node scripts/build.mjs --for-tests && node --expose-gc benchmarks/personal-search-offset-map.mjs
 *
 * Cases (each about 4.8 MiB of UTF-8, under the 5 MiB per-file limit):
 *  - uniform:   "İ" repeated (the reviewer's case; every character changes length)
 *  - aperiodic: seeded random mix of "İ" and decomposed "é": every
 *               character is a changed piece and neighbours rarely share a
 *               shape (the remaining worst case for run-length merging)
 * Reports the offset map's own size and the retained heap + ArrayBuffer growth
 * of prepareDoc() (raw text, searchable copy and map), measured after gc.
 */
import { prepareDoc } from "../dist/kosmos-personal-notes.mjs";

const gc = globalThis.gc;
if (!gc) { console.error("run with node --expose-gc"); process.exit(1); }
const MIB = 1048576;
const TARGET = 4.8 * MIB;

function uniform() { return "İ".repeat(Math.floor(TARGET / 2)); }
function aperiodic() {
  let seed = 0x5eed, bytes = 0;
  const rand = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
  const pieces = [["İ", 2], ["é", 3]];
  const chunk = [];
  while (bytes < TARGET) { const [s, b] = pieces[Math.floor(rand() * pieces.length)]; chunk.push(s); bytes += b; }
  return chunk.join("");
}

const mapBytes = (map) => (!map ? 0 : ArrayBuffer.isView(map) ? map.byteLength : Object.values(map).reduce((n, v) => n + (ArrayBuffer.isView(v) ? v.byteLength : 0), 0));
const held = () => { gc(); gc(); const m = process.memoryUsage(); return m.heapUsed + m.arrayBuffers; };

for (const [name, make] of [["uniform İ", uniform], ["aperiodic mix", aperiodic]]) {
  let raw = make();
  const utf8 = Buffer.byteLength(raw);
  const before = held();
  const t0 = performance.now();
  let p = prepareDoc({ path: "N.md", title: "N", aliases: [], tags: [], raw });
  const ms = performance.now() - t0;
  raw = null;
  const after = held();
  console.log(`${name}: ${(utf8 / MIB).toFixed(2)} MiB UTF-8, ${p.doc.raw.length} raw units, ${p.body.length} searchable units; ` +
    `offset map ${(mapBytes(p.map) / MIB).toFixed(2)} MiB; prepared doc retains ${((after - before) / MIB).toFixed(1)} MiB ` +
    `(raw text excluded: it was already held); prepareDoc ${ms.toFixed(0)} ms`);
  p = null;
}
