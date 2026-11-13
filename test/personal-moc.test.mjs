// Personal Notes 0.9.5 — deterministic Map-of-Content generator and its hash-checked writer (pure layer).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildMocBlock,
  planMoc,
  applyMocPlan,
  readMocBlockLinks,
  mocSortKey,
  MocError,
  MOC_CONTRACT,
  MOC_BEGIN_MARKER,
  MOC_END_MARKER,
  MOC_NOTICE,
  MOC_EMPTY_LINE,
  MOC_INDEX_BASENAMES,
  MOC_SUMMARY_MAX_CHARS,
} from "../dist/kosmos-personal-notes.mjs";

const sha = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const BEGIN = "<!-- kosmos-moc:begin v1 -->";
const END = "<!-- kosmos-moc:end -->";
const n = (path, extra = {}) => ({ path, title: path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, ""), ...extra });
const bullets = (block) => block.split("\n").filter((line) => line.startsWith("- "));
const errorCode = (code) => (error) => error instanceof MocError && error.code === code;

/** Deterministic Fisher–Yates with a fixed LCG, so the "shuffle" itself is reproducible. */
function shuffled(list, seed) {
  const out = list.slice();
  let state = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const SAMPLE = [
  n("Proj/Zeta.md"),
  n("Proj/alpha.md"),
  n("Proj/Beta.md", { title: "Beta plan", summary: "The second plan" }),
  n("Proj/Old.md", { supersededBy: ["Proj/Zeta.md"] }),
  n("Proj/sub/Deep.md"),
  n("Proj/sub/inner/Deeper.md"),
  n("Proj/other/Alpha.md"),
  n("Proj/index.md"),
  n("Proj/sub/README.md"),
  n("Elsewhere/Note.md"),
  { path: "Proj/image.png", title: "image" },
];

/* ---------------------------------------------------------------- contract */

test("markers and contract are the documented exact strings", () => {
  assert.equal(MOC_BEGIN_MARKER, BEGIN);
  assert.equal(MOC_END_MARKER, END);
  assert.equal(MOC_CONTRACT, "kosmos-moc/1");
  assert.deepEqual([...MOC_INDEX_BASENAMES].sort(), ["_index", "contents", "index", "moc", "readme"]);
});

test("block layout: markers, notice, blank line, bullets; LF only, no trailing newline", () => {
  const { block, target, title, folder } = buildMocBlock({ folder: "Proj", notes: [n("Proj/B.md"), n("Proj/A.md")] });
  assert.equal(block, [BEGIN, MOC_NOTICE, "", "- [[A]]", "- [[B]]", END].join("\n"));
  assert.equal(target, "Proj/index.md");
  assert.equal(title, "Proj");
  assert.equal(folder, "Proj");
  assert.ok(!block.includes("\r"));
});

test("an empty folder yields a block with an explicit empty line", () => {
  const { block, entries } = buildMocBlock({ folder: "Proj", notes: [] });
  assert.equal(block, [BEGIN, MOC_NOTICE, "", MOC_EMPTY_LINE, END].join("\n"));
  assert.deepEqual(entries, []);
});

/* ------------------------------------------------------------- determinism */

test("determinism: shuffled input gives byte-identical block and plan", () => {
  for (const options of [{}, { recursive: true }, { recursive: true, includeSuperseded: true }]) {
    const reference = buildMocBlock({ folder: "Proj", notes: SAMPLE, options });
    const referencePlan = planMoc({ folder: "Proj", notes: SAMPLE, existingRaw: null, options });
    for (let seed = 1; seed <= 25; seed++) {
      const notes = shuffled(SAMPLE, seed);
      const again = buildMocBlock({ folder: "Proj", notes, options });
      assert.equal(again.block, reference.block);
      assert.deepEqual(again.entries, reference.entries);
      assert.equal(planMoc({ folder: "Proj", notes, existingRaw: null, options }).proposedRaw, referencePlan.proposedRaw);
    }
  }
});

test("determinism: repeated calls do not depend on time or call count", () => {
  const first = planMoc({ folder: "Proj", notes: SAMPLE, existingRaw: null, options: { recursive: true } });
  const second = planMoc({ folder: "Proj", notes: SAMPLE, existingRaw: null, options: { recursive: true } });
  assert.deepEqual(first, second);
  assert.equal(sha(first.proposedRaw), sha(second.proposedRaw));
});

test("input notes and options are not mutated", () => {
  const notes = SAMPLE.map((note) => Object.freeze({ ...note }));
  const options = Object.freeze({ recursive: true });
  const snapshot = JSON.stringify(notes);
  planMoc({ folder: "Proj", notes: Object.freeze(notes), existingRaw: null, options });
  assert.equal(JSON.stringify(notes), snapshot);
});

/* ------------------------------------------------------------------ sorting */

test("sorting: case-insensitive by code units after NFC + lower case, not by locale", () => {
  const notes = ["b", "A", "a2", "Z", "é", "z", "10", "9", "_x", "Ä"].map((name) => n(`F/${name}.md`));
  const { entries } = buildMocBlock({ folder: "F", notes });
  // Z and z share a sort key; the path breaks the tie ("F/Z.md" < "F/z.md").
  assert.deepEqual(entries.map((entry) => entry.title), ["10", "9", "_x", "A", "a2", "b", "Z", "z", "Ä", "é"]);
  assert.equal(mocSortKey("ÄB"), "äb");
});

test("sorting: NFC and NFD spellings of a title sort together; ties break on the exact path", () => {
  const nfc = "Caf\u00e9", nfd = "Cafe\u0301";
  const notes = [n("F/2.md", { title: nfd }), n("F/1.md", { title: nfc }), n("F/0.md", { title: "Cafz" }), n("F/3.md", { title: "Cafd" })];
  const { entries } = buildMocBlock({ folder: "F", notes });
  assert.deepEqual(entries.map((entry) => entry.path), ["F/3.md", "F/0.md", "F/1.md", "F/2.md"]);
  assert.equal(mocSortKey(nfc), mocSortKey(nfd));
});

test("sorting: identical titles are ordered by path code units", () => {
  const notes = [n("F/b.md", { title: "Same" }), n("F/B.md", { title: "Same" }), n("F/a.md", { title: "Same" })];
  assert.deepEqual(buildMocBlock({ folder: "F", notes }).entries.map((entry) => entry.path), ["F/B.md", "F/a.md", "F/b.md"]);
});

/* -------------------------------------------------------------------- links */

test("links: short form only when the base name is unique and equals the title", () => {
  const notes = [n("F/Plain.md"), n("F/Titled.md", { title: "A different title" }), n("F/NoTitle.md", { title: "" }), { path: "F/Missing.md" }];
  const { entries } = buildMocBlock({ folder: "F", notes });
  const byPath = Object.fromEntries(entries.map((entry) => [entry.path, entry]));
  assert.equal(byPath["F/Plain.md"].line, "- [[Plain]]");
  assert.equal(byPath["F/Plain.md"].form, "short");
  assert.equal(byPath["F/Plain.md"].target, "Plain");
  assert.equal(byPath["F/Titled.md"].line, "- [[F/Titled|A different title]]");
  assert.equal(byPath["F/Titled.md"].form, "path");
  assert.equal(byPath["F/Titled.md"].target, "F/Titled");
  assert.equal(byPath["F/NoTitle.md"].line, "- [[NoTitle]]");
  assert.equal(byPath["F/Missing.md"].line, "- [[Missing]]");
});

test("links: a base name shared by listed notes (any case) uses the path form", () => {
  const notes = [n("F/Note.md"), n("F/sub/note.md"), n("F/Solo.md")];
  const { entries } = buildMocBlock({ folder: "F", notes, options: { recursive: true } });
  assert.deepEqual(entries.map((entry) => entry.line), ["- [[F/Note|Note]]", "- [[Solo]]", "- [[F/sub/note|note]]"]);
});

test("links: a base name shared with a supplied but unlisted note also uses the path form", () => {
  const notes = [n("F/Note.md"), n("Other/Note.md")];
  assert.deepEqual(bullets(buildMocBlock({ folder: "F", notes }).block), ["- [[F/Note|Note]]"]);
  assert.deepEqual(bullets(buildMocBlock({ folder: "F", notes: [n("F/Note.md")] }).block), ["- [[Note]]"]);
});

test("links: titles are collapsed to one line", () => {
  const { entries } = buildMocBlock({ folder: "F", notes: [n("F/A.md", { title: "  Two\r\nlines\tand\u0000 more  " })] });
  assert.equal(entries[0].title, "Two lines and more");
  assert.equal(entries[0].line, "- [[F/A|Two lines and more]]");
});

test("links: characters that break a wikilink switch to an escaped Markdown link", () => {
  const cases = [
    [n("F/A.md", { title: "a | b" }), "- [a \\| b](F/A.md)"],
    [n("F/B.md", { title: "x ]] y" }), "- [x \\]\\] y](F/B.md)"],
    [n("F/C.md", { title: "[[nested]]" }), "- [\\[\\[nested\\]\\]](F/C.md)"],
    [n("F/D.md", { title: "back\\slash" }), "- [back\\\\slash](F/D.md)"],
    [n("F/E.md", { title: "<!-- kosmos-moc:end -->" }), "- [\\<!-- kosmos-moc:end --\\>](F/E.md)"],
    [n("F/C# notes.md"), "- [C\\# notes](F/C%23%20notes.md)"],
    [n("F/a^b.md"), "- [a\\^b](F/a%5Eb.md)"],
    [n("F/x[1].md"), "- [x\\[1\\]](F/x%5B1%5D.md)"],
    [n("F/p|q (1).md"), "- [p\\|q (1)](F/p%7Cq%20%281%29.md)"],
  ];
  for (const [note, expected] of cases) {
    const { entries, block } = buildMocBlock({ folder: "F", notes: [note] });
    assert.equal(entries[0].line, expected);
    assert.equal(entries[0].form, "markdown");
    assert.equal(entries[0].target, note.path.replace(/\.md$/, ""));
    // The link is recoverable from the block, and no extra marker line was created.
    assert.deepEqual(readMocBlockLinks(block), [entries[0].target]);
    assert.equal(block.split("\n").filter((line) => line === END).length, 1);
  }
});

test("links: # and ^ in a title are harmless in a wikilink alias and stay verbatim", () => {
  const { entries } = buildMocBlock({ folder: "F", notes: [n("F/A.md", { title: "Issue #12 ^top" })] });
  assert.equal(entries[0].line, "- [[F/A|Issue #12 ^top]]");
});

test("links: the .md extension is removed case-insensitively and dots in names survive", () => {
  const { entries } = buildMocBlock({ folder: "F", notes: [n("F/v1.2 notes.MD")] });
  assert.equal(entries[0].line, "- [[v1.2 notes]]");
});

test("summary: single line, escaped as plain text, capped by code points", () => {
  const long = "😀".repeat(MOC_SUMMARY_MAX_CHARS + 10);
  const { entries } = buildMocBlock({ folder: "F", notes: [
    n("F/A.md", { summary: " line one\nline *two* [[x]] <!-- c --> " }),
    n("F/B.md", { summary: long }),
    n("F/C.md", { summary: "   " }),
  ] });
  assert.equal(entries[0].line, "- [[A]] - line one line \\*two\\* \\[\\[x\\]\\] \\<!-- c --\\>");
  const capped = entries[1].line.slice("- [[B]] - ".length);
  assert.equal(Array.from(capped).length, MOC_SUMMARY_MAX_CHARS);
  assert.ok(capped.endsWith("…"));
  assert.equal(entries[2].line, "- [[C]]");
  // Only the entry link is read back, never a link-looking summary.
  assert.deepEqual(readMocBlockLinks(entries[0].line), ["A"]);
});

/* --------------------------------------------------------------- exclusions */

test("exclusion: index-like base names are never listed, in any case, at any depth", () => {
  const names = ["index", "_index", "README", "Readme", "MOC", "moc", "Contents", "INDEX"];
  const notes = [n("F/Real.md"), n("F/sub/Real2.md"), n("F/Indexes.md"), n("F/readme2.md")];
  for (const name of names) notes.push(n(`F/x-${name}/${name}.md`), n(`F/${name}.md`.replace("F/index.md", "F/index.md")));
  const unique = [...new Map(notes.map((note) => [note.path, note])).values()];
  const { entries } = buildMocBlock({ folder: "F", notes: unique, options: { recursive: true } });
  assert.deepEqual(entries.map((entry) => entry.path).sort(), ["F/Indexes.md", "F/readme2.md", "F/Real.md", "F/sub/Real2.md"].sort());
});

test("exclusion: the target itself is never listed, whatever its name", () => {
  const notes = [n("F/A.md"), n("F/Overview.md")];
  const built = buildMocBlock({ folder: "F", notes, options: { fileName: "Overview.md" } });
  assert.equal(built.target, "F/Overview.md");
  assert.deepEqual(built.entries.map((entry) => entry.path), ["F/A.md"]);
  // With the default file name the same note is an ordinary entry.
  assert.deepEqual(buildMocBlock({ folder: "F", notes }).entries.map((entry) => entry.path), ["F/A.md", "F/Overview.md"]);
});

test("scope: only direct children by default; other folders, prefixes and non-notes are ignored", () => {
  const notes = [n("F/A.md"), n("F/sub/B.md"), n("FF/C.md"), n("F2.md"), n("G/F/D.md"), { path: "F/pic.png" }, { path: "F/data.canvas" }, { path: "F" }];
  assert.deepEqual(buildMocBlock({ folder: "F", notes }).entries.map((entry) => entry.path), ["F/A.md"]);
  assert.deepEqual(buildMocBlock({ folder: "F", notes, options: { recursive: true } }).entries.map((entry) => entry.path), ["F/A.md", "F/sub/B.md"]);
});

test("scope: nested folders work and the default title is the folder base name", () => {
  const plan = planMoc({ folder: "Areas/Work", notes: [n("Areas/Work/A.md"), n("Areas/B.md")], existingRaw: null });
  assert.equal(plan.target, "Areas/Work/index.md");
  assert.equal(plan.proposedRaw, `# Work\n\n${BEGIN}\n${MOC_NOTICE}\n\n- [[A]]\n${END}\n`);
});

/* ---------------------------------------------------------------- recursive */

test("recursive: direct children first, then one sorted heading per subfolder", () => {
  const notes = [
    n("F/Top.md"), n("F/b/Two.md"), n("F/b/One.md"), n("F/a/x/Deep.md"), n("F/a/Mid.md"), n("F/a b/Space.md"), n("F/B2/Upper.md"),
  ];
  const { block, entries } = buildMocBlock({ folder: "F", notes, options: { recursive: true } });
  assert.equal(block, [
    BEGIN, MOC_NOTICE, "",
    "- [[Top]]", "",
    "## a", "", "- [[Mid]]", "",
    "## a/x", "", "- [[Deep]]", "",
    "## a b", "", "- [[Space]]", "",
    "## b", "", "- [[One]]", "- [[Two]]", "",
    "## B2", "", "- [[Upper]]",
    END,
  ].join("\n"));
  assert.deepEqual(entries.map((entry) => entry.group), ["", "a", "a/x", "a b", "b", "b", "B2"]);
});

test("recursive: with no direct children the first heading follows the notice; headings are escaped", () => {
  const { block } = buildMocBlock({ folder: "F", notes: [n("F/_drafts_/A.md"), n("F/#1/B.md")], options: { recursive: true } });
  assert.equal(block, [BEGIN, MOC_NOTICE, "", "## \\#1", "", "- [B](F/%231/B.md)", "", "## \\_drafts\\_", "", "- [[A]]", END].join("\n"));
});

/* --------------------------------------------------------------- superseded */

test("superseded: listed in a trailing section by default, in the main list when included", () => {
  const notes = [
    n("F/A.md", { supersededBy: ["F/B.md"] }), n("F/B.md"), n("F/C.md", { supersededBy: [] }),
    n("F/D.md", { supersededBy: ["", "  "] }), n("F/E.md", { supersededBy: null }), n("F/sub/G.md", { supersededBy: ["x"] }), n("F/sub/H.md"),
  ];
  const split = buildMocBlock({ folder: "F", notes, options: { recursive: true } });
  assert.equal(split.block, [
    BEGIN, MOC_NOTICE, "",
    "- [[B]]", "- [[C]]", "- [[D]]", "- [[E]]", "",
    "## sub", "", "- [[H]]", "",
    "## Superseded", "", "- [[A]]", "- [[G]]",
    END,
  ].join("\n"));
  assert.deepEqual(split.entries.filter((entry) => entry.superseded).map((entry) => entry.path), ["F/A.md", "F/sub/G.md"]);

  const merged = buildMocBlock({ folder: "F", notes, options: { recursive: true, includeSuperseded: true } });
  assert.ok(!merged.block.includes("## Superseded"));
  assert.deepEqual(bullets(merged.block), ["- [[A]]", "- [[B]]", "- [[C]]", "- [[D]]", "- [[E]]", "- [[G]]", "- [[H]]"]);
  assert.ok(merged.entries.every((entry) => entry.superseded === false));
});

test("superseded: a folder holding only superseded notes has just that section", () => {
  const { block } = buildMocBlock({ folder: "F", notes: [n("F/A.md", { supersededBy: ["F/B.md"] })] });
  assert.equal(block, [BEGIN, MOC_NOTICE, "", "## Superseded", "", "- [[A]]", END].join("\n"));
});

/* ------------------------------------------------------------------- errors */

test("maxNotes: over the limit is a typed error from buildMocBlock and a refusal from planMoc, never a truncation", () => {
  const notes = [n("F/A.md"), n("F/B.md"), n("F/C.md"), n("F/index.md"), n("G/Z.md")];
  assert.throws(() => buildMocBlock({ folder: "F", notes, options: { maxNotes: 2 } }), errorCode("too_many_notes"));
  assert.equal(buildMocBlock({ folder: "F", notes, options: { maxNotes: 3 } }).entries.length, 3);
  const existing = `intro\n${BEGIN}\n${END}\n`;
  const plan = planMoc({ folder: "F", notes, existingRaw: existing, options: { maxNotes: 2 } });
  assert.equal(plan.action, "refuse");
  assert.equal(plan.reason, "too_many_notes");
  assert.equal(plan.proposedRaw, null);
  assert.equal(plan.existingRaw, existing);
  assert.equal(plan.target, "F/index.md");
  assert.deepEqual(plan.entries, []);
});

test("maxNotes: the default limit is 2000", () => {
  const many = Array.from({ length: 2001 }, (_, i) => n(`F/N${i}.md`));
  assert.equal(buildMocBlock({ folder: "F", notes: many.slice(0, 2000) }).entries.length, 2000);
  assert.throws(() => buildMocBlock({ folder: "F", notes: many }), errorCode("too_many_notes"));
});

test("invalid folders are rejected, including the vault root", () => {
  for (const folder of ["", "/", "/abs", "a//b", "a/", "../x", "a/./b", "C:/x", "a\\b", "a\nb", null, undefined, 7]) {
    assert.throws(() => buildMocBlock({ folder, notes: [] }), errorCode("invalid_folder"), String(folder));
    assert.throws(() => planMoc({ folder, notes: [], existingRaw: null }), errorCode("invalid_folder"), String(folder));
  }
});

test("invalid options and notes are rejected", () => {
  for (const fileName of ["", "index", "sub/index.md", ".md", "../index.md", "a\\b.md", 5]) {
    assert.throws(() => buildMocBlock({ folder: "F", notes: [], options: { fileName } }), errorCode("invalid_option"), String(fileName));
  }
  for (const maxNotes of [0, -1, 1.5, "10", NaN, Infinity]) {
    assert.throws(() => buildMocBlock({ folder: "F", notes: [], options: { maxNotes } }), errorCode("invalid_option"), String(maxNotes));
  }
  assert.throws(() => buildMocBlock({ folder: "F", notes: [], options: { title: 3 } }), errorCode("invalid_option"));
  assert.throws(() => buildMocBlock({ folder: "F", notes: "nope" }), errorCode("invalid_note"));
  for (const path of ["", "/F/A.md", "F//A.md", "F/../A.md", "F\\A.md", "F/A\n.md", undefined]) {
    assert.throws(() => buildMocBlock({ folder: "F", notes: [{ path, title: "x" }] }), errorCode("invalid_note"), String(path));
  }
  assert.throws(() => buildMocBlock({ folder: "F", notes: [n("F/A.md"), n("F/A.md")] }), errorCode("invalid_note"));
  assert.throws(() => planMoc({ folder: "F", notes: [], existingRaw: 5 }), errorCode("invalid_option"));
});

/* --------------------------------------------------------------------- plan */

test("plan create: heading, blank line, block, LF, frozen", () => {
  const plan = planMoc({ folder: "Proj", notes: [n("Proj/B.md"), n("Proj/A.md")], existingRaw: null });
  assert.equal(plan.contract, "kosmos-moc/1");
  assert.equal(plan.folder, "Proj");
  assert.equal(plan.target, "Proj/index.md");
  assert.equal(plan.action, "create");
  assert.equal(plan.reason, undefined);
  assert.equal(plan.existingRaw, null);
  assert.equal(plan.proposedRaw, `# Proj\n\n${BEGIN}\n${MOC_NOTICE}\n\n- [[A]]\n- [[B]]\n${END}\n`);
  assert.deepEqual(plan.added, ["Proj/A.md", "Proj/B.md"]);
  assert.deepEqual(plan.removed, []);
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.entries) && Object.isFrozen(plan.entries[0]) && Object.isFrozen(plan.added));
  assert.throws(() => { "use strict"; plan.action = "update"; }, TypeError);
});

test("plan create: custom title and file name; the title is single-lined and escaped", () => {
  const plan = planMoc({ folder: "Proj", notes: [], existingRaw: null, options: { title: " My #1\n*map* ", fileName: "Map.md" } });
  assert.equal(plan.target, "Proj/Map.md");
  assert.ok(plan.proposedRaw.startsWith("# My \\#1 \\*map\\*\n\n" + BEGIN + "\n"));
});

test("plan update: only the managed block changes; bytes outside are preserved", () => {
  const before = "---\ntitle: Mine\n---\n\n#  My heading  \n\ttabbed   text  \n\n";
  const after = "\n\n## Notes by hand\n- [[Keep me]]\n  trailing spaces   \n\n\nno final newline";
  const existing = `${before}${BEGIN}\nstale content\n- [[Gone]]\n${END}${after}`;
  const plan = planMoc({ folder: "F", notes: [n("F/A.md")], existingRaw: existing });
  assert.equal(plan.action, "update");
  assert.equal(plan.existingRaw, existing);
  assert.equal(plan.proposedRaw, `${before}${BEGIN}\n${MOC_NOTICE}\n\n- [[A]]\n${END}${after}`);
  assert.ok(plan.proposedRaw.startsWith(before) && plan.proposedRaw.endsWith(after));
});

test("plan update: a block at the very start and very end of the file", () => {
  const plan = planMoc({ folder: "F", notes: [n("F/A.md")], existingRaw: `${BEGIN}\n${END}` });
  assert.equal(plan.action, "update");
  assert.equal(plan.proposedRaw, `${BEGIN}\n${MOC_NOTICE}\n\n- [[A]]\n${END}`);
});

test("plan unchanged and idempotence: planning again on proposedRaw changes nothing", () => {
  const variants = [
    { existingRaw: null, options: {} },
    { existingRaw: null, options: { recursive: true } },
    { existingRaw: `user text\r\n\r\n${BEGIN}\r\nold\r\n${END}\r\ntail\r\n`, options: { recursive: true, includeSuperseded: true } },
    { existingRaw: `\uFEFF${BEGIN}\n${END}\n`, options: {} },
  ];
  for (const { existingRaw, options } of variants) {
    const first = planMoc({ folder: "Proj", notes: SAMPLE, existingRaw, options });
    assert.notEqual(first.action, "unchanged");
    const second = planMoc({ folder: "Proj", notes: shuffled(SAMPLE, 7), existingRaw: first.proposedRaw, options });
    assert.equal(second.action, "unchanged");
    assert.equal(second.proposedRaw, first.proposedRaw);
    assert.deepEqual(second.added, []);
    assert.deepEqual(second.removed, []);
    assert.deepEqual(second.entries, first.entries);
  }
});

test("plan refuse: a file without a managed block is never adopted", () => {
  for (const existingRaw of ["", "# My own index\n\n- [[A]]\n", "text mentioning <!-- kosmos-moc:begin v1 --> inline only\n", "<!-- another comment -->\n"]) {
    const plan = planMoc({ folder: "F", notes: [n("F/A.md")], existingRaw });
    assert.equal(plan.action, "refuse");
    assert.equal(plan.reason, "unmanaged_file");
    assert.equal(plan.proposedRaw, null);
    assert.equal(plan.existingRaw, existingRaw);
    assert.deepEqual(plan.added, []);
    assert.deepEqual(plan.removed, []);
    assert.equal(plan.entries.length, 1);
    assert.ok(plan.detail);
  }
});

test("plan refuse: every malformed-marker case has a specific reason", () => {
  const cases = [
    ["begin_without_end", `a\n${BEGIN}\n- [[A]]\n`],
    ["begin_without_end", `${BEGIN}\n${BEGIN}\n${END}\n`],
    ["begin_without_end", `${BEGIN}\n${END}\n${BEGIN}\n`],
    ["end_without_begin", `a\n${END}\n`],
    ["end_without_begin", `${BEGIN}\n${END}\n${END}\n`],
    ["end_before_begin", `${END}\n${BEGIN}\n`],
    ["end_before_begin", `${END}\ntext\n${BEGIN}\n${END}\n`],
    ["multiple_blocks", `${BEGIN}\n${END}\n\n${BEGIN}\n${END}\n`],
    ["multiple_blocks", `${BEGIN}\r\n${END}\r\ntext\r\n${BEGIN}\r\n${END}\r\n${BEGIN}\r\n${END}`],
    ["unknown_version", `<!-- kosmos-moc:begin v2 -->\n${END}\n`],
    ["unknown_version", `${BEGIN}\n${END}\n<!-- kosmos-moc:begin v10 -->\n${END}\n`],
    ["unknown_version", `<!-- kosmos-moc:begin V1 -->\n${END}\n`],
    ["malformed_marker", `<!-- kosmos-moc:begin -->\n${END}\n`],
    ["malformed_marker", `<!--kosmos-moc:begin v1-->\n${END}\n`],
    ["malformed_marker", ` ${BEGIN}\n${END}\n`],
    ["malformed_marker", `${BEGIN} \n${END}\n`],
    ["malformed_marker", `${BEGIN}\n${END} trailing\n`],
    ["malformed_marker", `${BEGIN}\n<!-- kosmos-moc:finish -->\n`],
    ["malformed_marker", `${BEGIN}\n<!-- KOSMOS-MOC:END -->\n`],
  ];
  for (const [reason, existingRaw] of cases) {
    const plan = planMoc({ folder: "F", notes: [n("F/A.md")], existingRaw });
    assert.equal(plan.action, "refuse", JSON.stringify(existingRaw));
    assert.equal(plan.reason, reason, JSON.stringify(existingRaw));
    assert.equal(plan.proposedRaw, null);
    assert.ok(plan.detail);
  }
});

test("fenced code: markers inside a fence do not count", () => {
  const fenced = (open, close = open) => `Docs:\n\n${open}\n${BEGIN}\n- [[Example]]\n${END}\n${close}\n`;
  for (const [open, close] of [["```", "```"], ["```md", "```"], ["~~~", "~~~"], ["````", "`````"], ["   ```", "  ```  "], ["~~~ `x`", "~~~"]]) {
    const only = planMoc({ folder: "F", notes: [n("F/A.md")], existingRaw: fenced(open, close) });
    assert.equal(only.reason, "unmanaged_file", open);
    const existing = `${fenced(open, close)}\n${BEGIN}\nold\n${END}\n`;
    const plan = planMoc({ folder: "F", notes: [n("F/A.md")], existingRaw: existing });
    assert.equal(plan.action, "update", open);
    assert.equal(plan.proposedRaw, `${fenced(open, close)}\n${BEGIN}\n${MOC_NOTICE}\n\n- [[A]]\n${END}\n`);
  }
});

test("fenced code: fence edge cases", () => {
  const plan = (existingRaw) => planMoc({ folder: "F", notes: [n("F/A.md")], existingRaw });
  // A shorter or different closing fence does not close; the fence runs on.
  assert.equal(plan(`\`\`\`\`\n\`\`\`\n${BEGIN}\n${END}\n\`\`\`\`\n`).reason, "unmanaged_file");
  assert.equal(plan(`\`\`\`\n~~~\n${BEGIN}\n${END}\n\`\`\`\n`).reason, "unmanaged_file");
  // An unclosed fence swallows the rest of the file.
  assert.equal(plan(`\`\`\`\n${BEGIN}\n${END}\n`).reason, "unmanaged_file");
  // Inline code that merely starts with backticks is not a fence.
  assert.equal(plan("```not a fence``` text\n" + `${BEGIN}\n${END}\n`).action, "update");
  // Four spaces of indentation is not a fence opener.
  assert.equal(plan(`    \`\`\`\n${BEGIN}\n${END}\n`).action, "update");
  // A fence opened after the block does not hide it; one in between hides only its content.
  assert.equal(plan(`${BEGIN}\n${END}\n\`\`\`\n${END}\n\`\`\`\n`).action, "update");
  assert.equal(plan(`${BEGIN}\n${END}\n\`\`\`\n${BEGIN}\n`).action, "update");
});

test("frontmatter: marker lines inside closed leading frontmatter do not count", () => {
  const plan = (existingRaw) => planMoc({ folder: "F", notes: [n("F/A.md")], existingRaw });
  assert.equal(plan(`---\nnote: |\n${BEGIN}\n${END}\n---\nbody\n`).reason, "unmanaged_file");
  assert.equal(plan(`---\nnote: |\n${BEGIN}\n---\n${BEGIN}\nx\n${END}\n`).action, "update");
  // An unclosed "---" is a rule, not frontmatter.
  assert.equal(plan(`---\n${BEGIN}\nx\n${END}\n`).action, "update");
});

/* --------------------------------------------------------- line endings/BOM */

test("line endings: a CRLF file gets a CRLF block and stays byte-identical outside it", () => {
  const existing = `# Title\r\n\r\nintro\r\n${BEGIN}\r\nold\r\n${END}\r\noutro\r\n`;
  const plan = planMoc({ folder: "F", notes: [n("F/A.md"), n("F/B.md")], existingRaw: existing });
  assert.equal(plan.action, "update");
  assert.equal(plan.proposedRaw, `# Title\r\n\r\nintro\r\n${BEGIN}\r\n${MOC_NOTICE}\r\n\r\n- [[A]]\r\n- [[B]]\r\n${END}\r\noutro\r\n`);
  assert.ok(!/[^\r]\n/.test(plan.proposedRaw));
});

test("line endings: the dominant ending wins in a mixed file; ties and LF files use LF", () => {
  const block = (eol) => [BEGIN, MOC_NOTICE, "", "- [[A]]", END].join(eol);
  const notes = [n("F/A.md")];
  const mostlyCrlf = `a\r\nb\r\nc\n${BEGIN}\r\n${END}\r\nlone\n`;
  assert.equal(planMoc({ folder: "F", notes, existingRaw: mostlyCrlf }).proposedRaw, `a\r\nb\r\nc\n${block("\r\n")}\r\nlone\n`);
  const mostlyLf = `a\nb\nc\r\n${BEGIN}\n${END}\nlone\r\n`;
  assert.equal(planMoc({ folder: "F", notes, existingRaw: mostlyLf }).proposedRaw, `a\nb\nc\r\n${block("\n")}\nlone\r\n`);
  const tie = `a\r\n${BEGIN}\n${END}`;
  assert.equal(planMoc({ folder: "F", notes, existingRaw: tie }).proposedRaw, `a\r\n${block("\n")}`);
});

test("line endings: a new file uses LF and has no BOM", () => {
  const plan = planMoc({ folder: "Proj", notes: SAMPLE, existingRaw: null, options: { recursive: true } });
  assert.ok(!plan.proposedRaw.includes("\r"));
  assert.notEqual(plan.proposedRaw.charCodeAt(0), 0xfeff);
  assert.ok(plan.proposedRaw.endsWith(`${END}\n`));
});

test("BOM: preserved on update, also when the begin marker is the first line", () => {
  const first = planMoc({ folder: "F", notes: [n("F/A.md")], existingRaw: `\uFEFF${BEGIN}\r\n${END}\r\n` });
  assert.equal(first.action, "update");
  assert.equal(first.proposedRaw, `\uFEFF${BEGIN}\r\n${MOC_NOTICE}\r\n\r\n- [[A]]\r\n${END}\r\n`);
  const later = planMoc({ folder: "F", notes: [n("F/A.md")], existingRaw: `\uFEFF# T\n\n${BEGIN}\n${END}\n` });
  assert.equal(later.proposedRaw, `\uFEFF# T\n\n${BEGIN}\n${MOC_NOTICE}\n\n- [[A]]\n${END}\n`);
  assert.equal(planMoc({ folder: "F", notes: [n("F/A.md")], existingRaw: later.proposedRaw }).action, "unchanged");
});

/* --------------------------------------------------------------------- diff */

test("diff: added and removed compare entries with the links of the existing block", () => {
  const v1 = planMoc({ folder: "F", notes: [n("F/A.md"), n("F/B.md"), n("F/C.md", { title: "See" })], existingRaw: null });
  const notes = [n("F/B.md"), n("F/C.md", { title: "See" }), n("F/D.md"), n("F/E x.md", { title: "E | x" })];
  const v2 = planMoc({ folder: "F", notes, existingRaw: `preface [[Outside]]\n${v1.proposedRaw}- [[AlsoOutside]]\n` });
  assert.equal(v2.action, "update");
  assert.deepEqual(v2.added, ["F/D.md", "F/E x.md"]);
  assert.deepEqual(v2.removed, ["A"]);
  const v3 = planMoc({ folder: "F", notes: [n("F/D.md")], existingRaw: v2.proposedRaw });
  assert.deepEqual(v3.added, []);
  assert.deepEqual(v3.removed, ["B", "F/C", "F/E x"]);
});

test("diff: a link that only changes form is neither added nor removed", () => {
  const v1 = planMoc({ folder: "F", notes: [n("F/Note.md")], existingRaw: null });
  assert.ok(v1.proposedRaw.includes("- [[Note]]"));
  const renamed = planMoc({ folder: "F", notes: [n("F/Note.md", { title: "A better title" })], existingRaw: v1.proposedRaw });
  assert.equal(renamed.action, "update");
  assert.ok(renamed.proposedRaw.includes("- [[F/Note|A better title]]"));
  assert.deepEqual([renamed.added, renamed.removed], [[], []]);
  const back = planMoc({ folder: "F", notes: [n("F/Note.md")], existingRaw: renamed.proposedRaw });
  assert.deepEqual([back.added, back.removed], [[], []]);
  const markdown = planMoc({ folder: "F", notes: [n("F/Note.md", { title: "a | b" })], existingRaw: v1.proposedRaw });
  assert.deepEqual([markdown.added, markdown.removed], [[], []]);
});

test("diff: an old short link that became ambiguous is reported, not guessed", () => {
  const v1 = planMoc({ folder: "F", notes: [n("F/Note.md")], existingRaw: null, options: { recursive: true } });
  const v2 = planMoc({ folder: "F", notes: [n("F/Note.md"), n("F/sub/Note.md")], existingRaw: v1.proposedRaw, options: { recursive: true } });
  assert.deepEqual(v2.added, ["F/Note.md", "F/sub/Note.md"]);
  assert.deepEqual(v2.removed, ["Note"]);
});

test("readMocBlockLinks reads each bullet's own link once, in order", () => {
  const block = [BEGIN, MOC_NOTICE, "", "- [[B]] - see \\[\\[Z\\]\\]", "- [[F/A|Title]]", "- [x \\] y](F/C%23%20d.md)", "- [[B]]", "plain [[NotABullet]]", "  - [[Indented]]", END].join("\r\n");
  assert.deepEqual(readMocBlockLinks(block), ["B", "F/A", "F/C# d"]);
});

/* ------------------------------------------------------------------- writer */

function makeHost(files = {}, overrides = {}) {
  const state = { files: { ...files }, backups: [], writes: [], creates: [], reads: [], own: [], log: [] };
  const host = {
    readRaw: async (path) => { state.reads.push(path); state.log.push(`read:${path}`); return Object.prototype.hasOwnProperty.call(state.files, path) ? state.files[path] : null; },
    writeRaw: async (path, text, expectedRaw) => {
      state.log.push(`write:${path}`);
      if (state.files[path] !== expectedRaw) return false;
      state.files[path] = text; state.writes.push({ path, text, expectedRaw });
      return true;
    },
    createFile: async (path, text) => {
      state.log.push(`create:${path}`);
      if (Object.prototype.hasOwnProperty.call(state.files, path)) return false;
      state.files[path] = text; state.creates.push({ path, text });
      return true;
    },
    saveBackup: async (path, beforeText) => { state.log.push(`backup:${path}`); state.backups.push({ path, beforeText }); return `backup-${state.backups.length}`; },
    sha256: async (text) => sha(text),
    recordOwnWrite: (path, hash) => { state.own.push({ path, hash }); },
    ...overrides,
  };
  return { state, host };
}
const NOTES = [n("F/A.md"), n("F/B.md")];
const MANAGED = `# Mine\n\n${BEGIN}\nold\n${END}\n\nfooter\n`;

test("writer create: writes the new file once, without a backup", async () => {
  const plan = planMoc({ folder: "F", notes: NOTES, existingRaw: null });
  const { state, host } = makeHost({ "F/A.md": "a" });
  const result = await applyMocPlan(plan, host);
  assert.deepEqual(result.written, [{ path: "F/index.md", action: "create", backupRef: null, beforeHash: null, afterHash: sha(plan.proposedRaw) }]);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.ownWrites, [{ path: "F/index.md", hash: sha(plan.proposedRaw) }]);
  assert.equal(state.files["F/index.md"], plan.proposedRaw);
  assert.equal(state.files["F/A.md"], "a");
  assert.deepEqual(state.backups, []);
  assert.deepEqual(state.writes, []);
  assert.deepEqual(state.own, [{ path: "F/index.md", hash: sha(plan.proposedRaw) }]);
  assert.deepEqual(state.log, ["read:F/index.md", "create:F/index.md"]);
});

test("writer create: a readRaw that throws for a missing file is treated as missing", async () => {
  const plan = planMoc({ folder: "F", notes: NOTES, existingRaw: null });
  const { state, host } = makeHost({}, { readRaw: async () => { throw new Error("ENOENT"); } });
  const result = await applyMocPlan(plan, host);
  assert.equal(result.written.length, 1);
  assert.equal(state.files["F/index.md"], plan.proposedRaw);
});

test("writer create: skipped 'exists' when a file appeared after the preview", async () => {
  const plan = planMoc({ folder: "F", notes: NOTES, existingRaw: null });
  const { state, host } = makeHost({ "F/index.md": "hand-written" });
  const result = await applyMocPlan(plan, host);
  assert.deepEqual(result.written, []);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].reason, "exists");
  assert.equal(result.skipped[0].path, "F/index.md");
  assert.equal(state.files["F/index.md"], "hand-written");
  assert.deepEqual([state.creates, state.writes, state.backups, state.own], [[], [], [], []]);
});

test("writer create: skipped 'exists' when the host refuses at create time; a rejecting host is 'failed'", async () => {
  const plan = planMoc({ folder: "F", notes: NOTES, existingRaw: null });
  const raced = makeHost({}, { createFile: async () => false });
  const result = await applyMocPlan(plan, raced.host);
  assert.deepEqual(result.written, []);
  assert.equal(result.skipped[0].reason, "exists");
  assert.deepEqual(result.ownWrites, []);
  const throwing = makeHost({}, { createFile: async () => { throw new Error("File already exists."); } });
  const failed = await applyMocPlan(plan, throwing.host);
  assert.deepEqual(failed.written, []);
  assert.deepEqual(failed.failed, [{ path: "F/index.md", error: "File already exists." }]);
});

test("writer update: backs up the exact before-text, then writes with expectedRaw", async () => {
  const plan = planMoc({ folder: "F", notes: NOTES, existingRaw: MANAGED });
  assert.equal(plan.action, "update");
  const { state, host } = makeHost({ "F/index.md": MANAGED });
  const result = await applyMocPlan(plan, host);
  assert.deepEqual(result.written, [{ path: "F/index.md", action: "update", backupRef: "backup-1", beforeHash: sha(MANAGED), afterHash: sha(plan.proposedRaw) }]);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(state.backups, [{ path: "F/index.md", beforeText: MANAGED }]);
  assert.deepEqual(state.writes, [{ path: "F/index.md", text: plan.proposedRaw, expectedRaw: MANAGED }]);
  assert.deepEqual(state.creates, []);
  assert.deepEqual(state.log, ["read:F/index.md", "backup:F/index.md", "write:F/index.md"]);
  assert.equal(state.files["F/index.md"], plan.proposedRaw);
});

test("writer update: a stale file is skipped 'changed' and never overwritten or backed up", async () => {
  const plan = planMoc({ folder: "F", notes: NOTES, existingRaw: MANAGED });
  const edited = MANAGED + "one more line\n";
  const { state, host } = makeHost({ "F/index.md": edited });
  const result = await applyMocPlan(plan, host);
  assert.deepEqual(result.written, []);
  assert.equal(result.skipped[0].reason, "changed");
  assert.equal(state.files["F/index.md"], edited);
  assert.deepEqual([state.writes, state.backups, state.own], [[], [], []]);
});

test("writer update: a change between the check and the write is skipped 'changed'", async () => {
  const plan = planMoc({ folder: "F", notes: NOTES, existingRaw: MANAGED });
  const { state, host } = makeHost({ "F/index.md": MANAGED }, { writeRaw: async () => false });
  const result = await applyMocPlan(plan, host);
  assert.deepEqual(result.written, []);
  assert.equal(result.skipped[0].reason, "changed");
  assert.deepEqual(result.ownWrites, []);
  assert.equal(state.files["F/index.md"], MANAGED);
});

test("writer update: a deleted index is skipped 'missing'", async () => {
  const plan = planMoc({ folder: "F", notes: NOTES, existingRaw: MANAGED });
  for (const overrides of [{}, { readRaw: async () => { throw new Error("gone"); } }]) {
    const { state, host } = makeHost({}, overrides);
    const result = await applyMocPlan(plan, host);
    assert.deepEqual(result.written, []);
    assert.equal(result.skipped[0].reason, "missing");
    assert.deepEqual([state.writes, state.creates, state.backups], [[], [], []]);
  }
});

test("writer update: no write when the backup or the hash is unavailable", async () => {
  const plan = planMoc({ folder: "F", notes: NOTES, existingRaw: MANAGED });
  const cases = [
    { saveBackup: async () => "" },
    { saveBackup: async () => { throw new Error("disk full"); } },
    { sha256: async () => "" },
    { sha256: async () => { throw new Error("no crypto"); } },
  ];
  for (const overrides of cases) {
    const { state, host } = makeHost({ "F/index.md": MANAGED }, overrides);
    const result = await applyMocPlan(plan, host);
    assert.deepEqual(result.written, []);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].path, "F/index.md");
    assert.equal(state.files["F/index.md"], MANAGED);
    assert.deepEqual(state.writes, []);
  }
});

test("writer: nothing is read or written for 'refuse' and 'unchanged' plans", async () => {
  const refuse = planMoc({ folder: "F", notes: NOTES, existingRaw: "# hand-written\n" });
  const tooMany = planMoc({ folder: "F", notes: NOTES, existingRaw: MANAGED, options: { maxNotes: 1 } });
  const current = planMoc({ folder: "F", notes: NOTES, existingRaw: MANAGED }).proposedRaw;
  const unchanged = planMoc({ folder: "F", notes: NOTES, existingRaw: current });
  assert.deepEqual([refuse.action, tooMany.action, unchanged.action], ["refuse", "refuse", "unchanged"]);
  for (const [plan, reason] of [[refuse, "refused"], [tooMany, "refused"], [unchanged, "unchanged"]]) {
    const { state, host } = makeHost({ "F/index.md": plan.existingRaw });
    const result = await applyMocPlan(plan, host);
    assert.deepEqual(result.written, []);
    assert.deepEqual(result.failed, []);
    assert.deepEqual(result.ownWrites, []);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].reason, reason);
    assert.deepEqual(state.log, []);
    assert.equal(state.files["F/index.md"], plan.existingRaw);
  }
});

test("writer: foreign or inconsistent plans fail without touching the host", async () => {
  const good = planMoc({ folder: "F", notes: NOTES, existingRaw: MANAGED });
  const bad = [
    null,
    {},
    { ...good, contract: "kosmos-moc/2" },
    { ...good, target: "../F/index.md" },
    { ...good, target: "F/index.txt" },
    { ...good, proposedRaw: null },
    { ...good, existingRaw: null },
    { ...good, action: "create" },
    { ...good, action: "delete" },
  ];
  for (const plan of bad) {
    const { state, host } = makeHost({ "F/index.md": MANAGED });
    const result = await applyMocPlan(plan, host);
    assert.deepEqual(result.written, []);
    assert.equal(result.failed.length, 1, JSON.stringify(plan)?.slice(0, 80));
    assert.deepEqual(state.log, []);
  }
});

test("writer: operations on one file are serialized; the second apply sees the first one's result", async () => {
  const plan = planMoc({ folder: "F", notes: NOTES, existingRaw: MANAGED });
  let active = 0, maxActive = 0;
  const slow = async () => { active++; maxActive = Math.max(maxActive, active); await new Promise((resolve) => setTimeout(resolve, 15)); active--; };
  const { state, host } = makeHost({ "F/index.md": MANAGED });
  const { readRaw, writeRaw } = host;
  host.readRaw = async (path) => { await slow(); return readRaw(path); };
  host.writeRaw = async (...args) => { await slow(); return writeRaw(...args); };
  const [first, second] = await Promise.all([applyMocPlan(plan, host), applyMocPlan(plan, host)]);
  assert.equal(maxActive, 1);
  assert.equal(first.written.length, 1);
  assert.deepEqual(second.written, []);
  assert.equal(second.skipped[0].reason, "changed");
  assert.equal(state.writes.length, 1);
  assert.equal(state.backups.length, 1);
  assert.deepEqual(state.log, ["read:F/index.md", "backup:F/index.md", "write:F/index.md", "read:F/index.md"]);
  assert.equal(state.files["F/index.md"], plan.proposedRaw);
});

test("writer: two concurrent creates produce exactly one file", async () => {
  const plan = planMoc({ folder: "F", notes: NOTES, existingRaw: null });
  const { state, host } = makeHost({});
  const results = await Promise.all([applyMocPlan(plan, host), applyMocPlan(plan, host)]);
  assert.deepEqual(results.map((result) => result.written.length), [1, 0]);
  assert.equal(results[1].skipped[0].reason, "exists");
  assert.equal(state.creates.length, 1);
});

test("writer: different files do not block each other", async () => {
  const planF = planMoc({ folder: "F", notes: NOTES, existingRaw: null });
  const planG = planMoc({ folder: "G", notes: [n("G/X.md")], existingRaw: null });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { state, host } = makeHost({});
  const { createFile } = host;
  host.createFile = async (path, text) => { if (path === "F/index.md") await gate; return createFile(path, text); };
  const pendingF = applyMocPlan(planF, host);
  const doneG = await applyMocPlan(planG, host);
  assert.equal(doneG.written.length, 1);
  assert.equal(state.files["F/index.md"], undefined);
  release();
  assert.equal((await pendingF).written.length, 1);
});

test("end to end: create, hand-edit outside the block, regenerate, and the edits survive", async () => {
  const { state, host } = makeHost({});
  const created = planMoc({ folder: "F", notes: NOTES, existingRaw: null });
  await applyMocPlan(created, host);
  const edited = state.files["F/index.md"].replace("# F\n", "# F\n\nMy own intro.\n") + "\n## My section\n\n- [[Somewhere else]]\n";
  state.files["F/index.md"] = edited;
  const next = planMoc({ folder: "F", notes: [...NOTES, n("F/C.md")], existingRaw: edited });
  assert.equal(next.action, "update");
  assert.deepEqual(next.added, ["F/C.md"]);
  const result = await applyMocPlan(next, host);
  assert.equal(result.written.length, 1);
  const final = state.files["F/index.md"];
  assert.ok(final.startsWith("# F\n\nMy own intro.\n\n" + BEGIN));
  assert.ok(final.endsWith(END + "\n\n## My section\n\n- [[Somewhere else]]\n"));
  assert.ok(final.includes("- [[C]]"));
  assert.equal(planMoc({ folder: "F", notes: [...NOTES, n("F/C.md")], existingRaw: final }).action, "unchanged");
});
