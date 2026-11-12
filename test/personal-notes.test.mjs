/**
 * Personal Notes pure helpers (0.9.0): full-text search, attachments, status.
 * Scope tests moved to personal-scope.test.mjs (case-sensitive, reject-not-repair semantics).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseQuery,
  FullTextIndex,
  MAX_INDEXED_BODY_CHARS,
  attachmentRefs,
  hasSearchableText,
  summarizePersonalNotes,
  asWikilink,
  mergeSupersedes,
} from "../dist/kosmos-personal-notes.mjs";

test("parseQuery lowercases, keeps quoted phrases whole, and removes duplicates", () => {
  assert.deepEqual(parseQuery('Shopping "Olive Oil" shopping'), ["shopping", "olive oil"]);
  assert.deepEqual(parseQuery("   "), []);
  assert.deepEqual(parseQuery(undefined), []);
  assert.equal(parseQuery(Array.from({ length: 40 }, (_, i) => `t${i}`).join(" ")).length, 16);
});

const DOCS = [
  { path: "Import/Keep/Shopping list.md", title: "Shopping list", tags: ["Keep/Pinned"], aliases: [], body: "- [ ] olive oil\n- [ ] bread\n- [x] invoice 1048 for the plumber" },
  { path: "Import/OneNote/Garden/Tomatoes.md", title: "Tomatoes", tags: ["garden"], aliases: ["Tomato notes"], body: "Planted in May. Water every second day. Buy olive oil soap for aphids." },
  { path: "Journal/2026-05-01.md", title: "2026-05-01", tags: [], aliases: [], body: "Private thought about the plumber." },
  { path: "Import/OneNote/Scan.md", title: "Scan", tags: [], aliases: [], body: "![[Scan - Ink.svg]]" },
];

test("FullTextIndex requires every term and ranks title matches first", () => {
  const index = new FullTextIndex(DOCS);
  assert.equal(index.notes, 4);
  assert.equal(index.truncatedNotes, 0);

  const oil = index.search("olive oil");
  assert.deepEqual(oil.hits.map((h) => h.path).sort(), ["Import/Keep/Shopping list.md", "Import/OneNote/Garden/Tomatoes.md"]);
  assert.equal(oil.total, 2);
  assert.ok(oil.hits.every((h) => h.matchedIn.includes("body")));

  const shopping = index.search("shopping");
  assert.equal(shopping.hits[0].path, "Import/Keep/Shopping list.md");
  assert.ok(shopping.hits[0].matchedIn.includes("title"));

  assert.equal(index.search("olive tractor").total, 0, "all terms are required");
  assert.equal(index.search('"every second day"').hits[0].path, "Import/OneNote/Garden/Tomatoes.md");
  assert.equal(index.search("TOMATO NOTES").hits[0].matchedIn.includes("alias"), true);
  assert.equal(index.search("keep/pinned").hits[0].matchedIn.includes("tag"), true);
  assert.equal(index.search("").total, 0);
});

test("FullTextIndex snippets surround the first body match", () => {
  const index = new FullTextIndex(DOCS);
  const hit = index.search("1048").hits[0];
  assert.equal(hit.path, "Import/Keep/Shopping list.md");
  assert.match(hit.snippet, /invoice 1048 for the plumber/);
  const long = new FullTextIndex([{ path: "L.md", title: "L", body: "a ".repeat(500) + "needle" + " b".repeat(500) }]);
  const s = long.search("needle").hits[0].snippet;
  assert.ok(s.startsWith("… ") && s.endsWith(" …"), s);
  assert.ok(s.length < 260);
  const titleOnly = index.search("tomatoes").hits[0];
  assert.match(titleOnly.snippet, /^Planted in May/);
});

test("FullTextIndex accept filter runs before matching and hides excluded notes", () => {
  const index = new FullTextIndex(DOCS);
  const seen = [];
  const result = index.search("plumber", { accept: (path) => { seen.push(path); return path.startsWith("Import/"); } });
  assert.deepEqual(result.hits.map((h) => h.path), ["Import/Keep/Shopping list.md"]);
  assert.equal(result.total, 1, "total never counts notes the caller may not read");
  assert.equal(seen.length, 4);
});

test("FullTextIndex bounds results, truncates huge bodies, and survives odd input", () => {
  const many = new FullTextIndex(Array.from({ length: 300 }, (_, i) => ({ path: `N/${String(i).padStart(3, "0")}.md`, title: `Note ${i}`, body: "common word" })));
  assert.equal(many.search("common").hits.length, 20);
  assert.equal(many.search("common", { limit: 1000 }).hits.length, 200);
  assert.equal(many.search("common").total, 300);
  assert.equal(many.search("common").hits[0].path, "N/000.md", "ties break by path for stable output");

  const huge = new FullTextIndex([{ path: "H.md", title: "H", body: "x".repeat(MAX_INDEXED_BODY_CHARS) + " tailword" }]);
  assert.equal(huge.truncatedNotes, 1);
  assert.equal(huge.search("tailword").total, 0);

  const odd = new FullTextIndex([null, { path: "" }, { path: "T.md", title: "", body: undefined }, { path: "I.md", title: "İstanbul", body: "İİİ büyük şehir" }]);
  assert.equal(odd.notes, 2);
  assert.equal(odd.search("t.md").hits[0].title, "T.md");
  assert.equal(odd.search("şehir").total, 1);
});

test("attachmentRefs lists embedded and linked files but not notes or web links", () => {
  const body = [
    "![[Scan - Ink.svg]] and ![[photo.PNG|300]]",
    "See [[Manual.pdf#page=2|the manual]] and [[Other note]] and [[Other note.md]]",
    "![alt](attachments/pic%20one.jpg) [doc](<files/My Report.docx>) [t](files/a.pdf \"title\")",
    "[web](https://example.com/file.pdf) [mail](mailto:a@b.c) [anchor](#top)",
    "[[Manual.pdf]]",
  ].join("\n");
  assert.deepEqual(attachmentRefs(body), [
    { target: "Scan - Ink.svg", kind: "embed" },
    { target: "photo.PNG", kind: "embed" },
    { target: "Manual.pdf", kind: "link" },
    { target: "attachments/pic one.jpg", kind: "embed" },
    { target: "files/My Report.docx", kind: "link" },
    { target: "files/a.pdf", kind: "link" },
  ]);
  assert.deepEqual(attachmentRefs(""), []);
  assert.deepEqual(attachmentRefs(undefined), []);
  assert.equal(attachmentRefs(Array.from({ length: 300 }, (_, i) => `![[f${i}.png]]`).join(" ")).length, 200);
  assert.deepEqual(attachmentRefs("[[a.pdf]] ![[a.pdf]]"), [{ target: "a.pdf", kind: "embed" }], "an embed outranks a link to the same file");
});

test("hasSearchableText ignores link syntax and needs a letter or digit", () => {
  assert.equal(hasSearchableText("![[Scan - Ink.svg]]"), false);
  assert.equal(hasSearchableText("![pic](a/b.png)\n\n---\n"), false);
  assert.equal(hasSearchableText("<img src=\"a.png\">"), false);
  assert.equal(hasSearchableText("![[Scan.svg]]\nmilk"), true);
  assert.equal(hasSearchableText("日本語"), true);
  assert.equal(hasSearchableText(""), false);
  assert.equal(hasSearchableText(undefined), false);
});

test("summarizePersonalNotes reports files present and only the reports the user selected", () => {
  const report = "Import/Rapport d'importation Keep.md"; // any language: chosen by the user, not guessed from its name
  const status = summarizePersonalNotes({
    importFolders: ["Import"],
    importReportPaths: [report, "Import/deleted report.md"],
    notes: [
      ...DOCS.map((d) => ({ path: d.path, body: d.body })),
      { path: report, body: "3 notes ignorées." },
      { path: "Import/2026-11-12 Google Keep import log.md", body: "An English-named note is an ordinary note now." },
    ],
    files: [
      ...DOCS.map((d) => d.path),
      report,
      "Import/2026-11-12 Google Keep import log.md",
      "Import/OneNote/Scan - Ink.svg",
      "Import/Keep/photo.png",
      "Import/.trash/old.png",
      "Elsewhere/file.pdf",
      "import/case-differs.png",
    ],
  });
  assert.deepEqual(status, {
    importFolders: ["Import"],
    notesPresent: 4,
    otherFilesPresent: 2,
    searchable: 3,
    needsAttentionTotal: 1,
    needsAttention: ["Import/OneNote/Scan.md"],
    reports: [{ path: report, present: true }, { path: "Import/deleted report.md", present: false }],
  });
  const none = summarizePersonalNotes({ importFolders: [], notes: DOCS, files: [] });
  assert.equal(none.notesPresent, 0);
  assert.deepEqual(none.reports, []);
  const capped = summarizePersonalNotes({ importFolders: ["/"], notes: Array.from({ length: 5 }, (_, i) => ({ path: `e${i}.md`, body: "" })), files: [], maxListed: 2 });
  assert.equal(capped.needsAttentionTotal, 5);
  assert.equal(capped.needsAttention.length, 2);
});

test("search matches composed and decomposed spellings and forgives a stray quote", () => {
  const index = new FullTextIndex([
    { path: "Cafe.md", title: "Cafe\u0301 list", body: "Meet at the cafe\u0301 on Tuesday." },
    { path: "Oil.md", title: "Oil", body: "olive oil" },
  ]);
  assert.equal(index.search("caf\u00e9").total, 1, "composed query finds decomposed text");
  assert.equal(index.search("cafe\u0301").total, 1, "decomposed query finds it too");
  assert.deepEqual(parseQuery('"olive'), ["olive"], "an unclosed quote is dropped");
  assert.equal(index.search('"olive').total, 1);
});

test("mergeSupersedes adds one wikilink and keeps what the user wrote", () => {
  assert.equal(asWikilink("Old note"), "[[Old note]]");
  assert.equal(asWikilink("[[Old note]]"), "[[Old note]]");
  assert.equal(asWikilink("  "), "");
  assert.deepEqual(mergeSupersedes(undefined, "Old note"), ["[[Old note]]"]);
  assert.deepEqual(mergeSupersedes("[[First]]", "Second"), ["[[First]]", "[[Second]]"]);
  assert.deepEqual(mergeSupersedes(["Engine v1"], "engine v1"), ["Engine v1"], "an existing entry is not duplicated or rewritten");
  assert.deepEqual(mergeSupersedes(["[[A]]", 7, ""], "B"), ["[[A]]", "[[B]]"]);
  assert.deepEqual(mergeSupersedes(["[[A]]"], ""), ["[[A]]"]);
});
