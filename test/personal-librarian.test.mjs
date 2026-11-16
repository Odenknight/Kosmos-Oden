/**
 * Personal Notes (0.9.5) — the Librarian: hybrid deterministic retrieval.
 *
 * The pure module (stemming, correction, ranking, extraction, brief) and the
 * same work through the real built worker: scope filtering, updates, policy
 * generation, determinism. No model, no network, nothing on disk.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MemoryCorpus,
  PersonalError,
  PersonalSearchClient,
  LIBRARIAN_LIMITS,
  parseQuestion,
  renderLibrarianBrief,
  runLibrarian,
  scanWords,
  stem,
} from "../dist/kosmos-personal-notes.mjs";
import { nodeWorkerFactory } from "./helpers/node-search-worker.mjs";

const LAPTOP = `---
tags: [it, hardware]
---
# Requesting a new laptop

Replace a laptop that is older than four years or beyond repair.

## Steps

1. Ask your manager to approve the replacement.
2. Open the hardware request form and submit it.
3. Bring the old laptop to IT for wipe and return.

Submit the form at [Hardware request form](https://forms.office.com/r/abc123) before the quarter ends.
See also [[IT/Asset register]].
`;

const VPN = `---
tags: [networking, firewall]
---
# VPN tunnel keeps dropping

The WireGuard tunnel to the OPNsense firewall drops on hotel Wi-Fi.

## Fix

- Lower the MTU on the client to 1280.
- Check the keepalive setting on the peer.
- Restart the WireGuard service after the change.
`;

const PLAN_OLD = `---
uid: plan-2024
---
# Build plan 2024

Old plan: single server, manual deploys.
`;

const PLAN_NEW = `---
uid: plan-2025
supersedes: "[[Projects/Build plan 2024]]"
---
# Build plan 2025

This plan replaces the 2024 build plan: two servers and automated deploys.
`;

const SECRET = `---
sensitivity: secret
---
# Secret laptop budget

The confidential laptop refresh budget is in the restricted workbook.
`;

const FILES = {
  "IT/New laptop request.md": LAPTOP,
  "Networking/VPN tunnel.md": VPN,
  "Projects/Build plan 2024.md": PLAN_OLD,
  "Projects/Build plan 2025.md": PLAN_NEW,
  "Private/Secret laptop budget.md": SECRET,
};

function memorySource(files) {
  const store = new Map(Object.entries(files));
  const title = (path) => path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
  return {
    store,
    listMarkdown: () => [...store.keys()].map((p) => ({ path: p, mtimeMs: 1, sizeBytes: Buffer.byteLength(store.get(p)) })),
    stat: (p) => (store.has(p) ? { path: p, mtimeMs: 1, sizeBytes: Buffer.byteLength(store.get(p)) } : null),
    async readRaw(p) { if (!store.has(p)) throw new Error("ENOENT"); return store.get(p); },
    meta: (p, raw) => {
      const tags = [...raw.matchAll(/#([\w-]+)/g)].map((m) => m[1]);
      const uid = /^uid:\s*(.+)$/m.exec(raw)?.[1]?.trim();
      const supersedes = [...raw.matchAll(/^supersedes:\s*"(.+)"$/gm)].map((m) => m[1]);
      const sensitivity = /^sensitivity:\s*(.+)$/m.exec(raw)?.[1]?.trim();
      return {
        title: (raw.match(/^#\s+(.+)$/m)?.[1] ?? title(p)).trim(),
        aliases: [], tags, supersedes, supersededBy: [], links: [], attachments: [],
        ...(uid ? { uid } : {}), ...(sensitivity ? { authoredSensitivity: sensitivity } : {}),
      };
    },
    exists: (p) => store.has(p),
    resolveLink: (text) => (store.has(`${text}.md`) ? `${text}.md` : null),
    physicallyContained: () => true,
  };
}

const manual = () => ({ setTimeout: () => 0, clearTimeout: () => {} });
const paths = (r) => r.hits.map((h) => h.path);

async function setup(files = FILES) {
  const source = memorySource(files);
  const corpus = new MemoryCorpus(source, { timers: manual() });
  const client = new PersonalSearchClient({ corpus, createWorker: nodeWorkerFactory() });
  await corpus.build();
  await client.whenApplied();
  return { source, corpus, client };
}

const ask = (client, question, extra = {}) => client.librarian({ question, allowedPaths: null, ...extra });

/* ------------------------------------------------------------------ the pure module */

test("librarian: plural, tense and -ion forms meet on one stem; short words and digits stay", () => {
  assert.equal(stem("laptops"), stem("laptop"));
  assert.equal(stem("requesting"), stem("request"));
  assert.equal(stem("configured"), stem("configure"));
  assert.equal(stem("drops"), stem("drop"));
  assert.equal(stem("installation"), stem("install"));
  assert.equal(stem("is"), "is");
  assert.equal(stem("ipv6"), "ipv6");
});

test("librarian: question limits are rejected, never truncated", () => {
  assert.throws(() => parseQuestion("x".repeat(LIBRARIAN_LIMITS.questionCodePoints + 1)), (e) => e instanceof PersonalError && e.code === "invalid_query");
  assert.throws(() => parseQuestion("   "), (e) => e instanceof PersonalError && e.code === "invalid_query");
  assert.throws(() => parseQuestion(42), (e) => e instanceof PersonalError && e.code === "invalid_query");
  assert.throws(() => parseQuestion(Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ")), (e) => e instanceof PersonalError && e.code === "invalid_query");
});

test("librarian: quoted phrases are kept and lift notes that contain them", () => {
  const parsed = parseQuestion('How do I "request form" for a laptop?');
  assert.deepEqual(parsed.phrases, ["request form"]);
  assert.ok(!parsed.words.includes("the"));
});

test("librarian: the brief is deterministic markdown with forms before links", () => {
  assert.equal(renderLibrarianBrief({
    contract: "kosmos-librarian/1", intent: "howto", terms: ["laptop"], corrections: [], expanded: [], phrases: [],
    total: 1, confidence: "strong",
    hits: [{
      path: "IT/New laptop request.md", title: "New laptop request", score: 0.1, ranks: { lexical: 1 },
      matchedTerms: ["laptop"], termCoverage: 1,
      passages: [{ text: "Request a new laptop.", offsetChars: 0 }],
      links: [
        { url: "https://example.com/plain", label: "A page", kind: "link" },
        { url: "https://forms.office.com/r/abc123", label: "Hardware request form", kind: "form" },
      ],
      steps: [{ text: "Ask your manager.", done: true }],
      noteLinks: ["IT/Asset register"], fingerprint: "f",
    }],
  }), [
    "**1 of 1 matching notes** — confidence: strong.",
    "",
    "1. **New laptop request** — IT/New laptop request.md",
    "   > Request a new laptop.",
    "   1. [done] Ask your manager.",
    "   - Hardware request form: https://forms.office.com/r/abc123 (form)",
    "   - A page: https://example.com/plain",
    "   Related notes: [[IT/Asset register]]",
  ].join("\n"));
});

test("librarian: an empty answer says so without inventing one", () => {
  assert.equal(renderLibrarianBrief({
    contract: "kosmos-librarian/1", intent: "lookup", terms: ["zebra"], corrections: [], expanded: [], phrases: [],
    total: 0, hits: [], confidence: "none",
  }), "No shared note answers this. Searched for: zebra.");
});

/* -------------------------------------------------------------------- through the worker */

test("librarian: a how-to question finds the procedure, its steps, its form and its note link", async (t) => {
  const { corpus, client } = await setup();
  t.after(() => { client.dispose(); corpus.dispose(); });
  const r = await ask(client, "how do I request a new laptop");
  assert.equal(r.contract, "kosmos-librarian/1");
  assert.equal(r.intent, "howto");
  assert.equal(paths(r)[0], "IT/New laptop request.md");
  const hit = r.hits[0];
  assert.ok(hit.passages.length >= 1);
  assert.match(hit.passages.map((p) => p.text).join(" "), /laptop/i);
  assert.deepEqual(hit.steps.map((s) => s.text.slice(0, 5)), ["Ask y", "Open ", "Bring"]);
  assert.equal(hit.links[0].kind, "form");
  assert.equal(hit.links[0].url, "https://forms.office.com/r/abc123");
  assert.deepEqual(hit.noteLinks, ["IT/Asset register"]);
  assert.match(renderLibrarianBrief(r), /Hardware request form: https:\/\/forms\.office\.com\/r\/abc123 \(form\)/);
  assert.ok(r.coverage.searched >= 4);
});

test("librarian: word forms and a typo are bridged, and the correction is reported", async (t) => {
  const { corpus, client } = await setup();
  t.after(() => { client.dispose(); corpus.dispose(); });
  const r = await ask(client, "wireguard tunel keeps droping");
  assert.equal(paths(r)[0], "Networking/VPN tunnel.md");
  assert.ok(r.corrections.some((c) => c.to.startsWith("tunnel") || c.to.startsWith("drop")), JSON.stringify(r.corrections));
});

test("librarian: different wordings still meet (replaces → supersedes chain)", async (t) => {
  const { corpus, client } = await setup();
  t.after(() => { client.dispose(); corpus.dispose(); });
  const r = await ask(client, "which document replaces the older build plan");
  assert.equal(r.intent, "history");
  assert.deepEqual(paths(r).slice(0, 2), ["Projects/Build plan 2025.md", "Projects/Build plan 2024.md"]);
});

test("librarian: the same question over the same notes returns the same answer", async (t) => {
  const { corpus, client } = await setup();
  t.after(() => { client.dispose(); corpus.dispose(); });
  const first = await ask(client, "vpn tunnel dropping on hotel wifi");
  const second = await ask(client, "vpn tunnel dropping on hotel wifi");
  assert.deepEqual(second, first);
});

test("librarian: scope is applied before anything is examined", async (t) => {
  const { corpus, client } = await setup();
  t.after(() => { client.dispose(); corpus.dispose(); });
  const allowed = new Set(["Networking/VPN tunnel.md", "IT/New laptop request.md"]);
  const r = await ask(client, "confidential laptop budget", { allowedPaths: allowed });
  assert.ok(r.hits.every((hit) => allowed.has(hit.path)), JSON.stringify(paths(r)));
  assert.ok(!paths(r).includes("Private/Secret laptop budget.md"));
});

test("librarian: a note written after the build is found without a restart", async (t) => {
  const { source, corpus, client } = await setup();
  t.after(() => { client.dispose(); corpus.dispose(); });
  assert.equal((await ask(client, "printer queue stuck")).total, 0);
  source.store.set("IT/Printer queue.md", "# Printer queue\n\nClear the stuck print queue from the print server console.\n");
  corpus.apply({ modified: ["IT/Printer queue.md"] });
  await corpus.flush();
  await client.whenApplied();
  const r = await ask(client, "printer queue stuck");
  assert.equal(paths(r)[0], "IT/Printer queue.md");
});

test("librarian: an answer from an older policy generation is refused", async (t) => {
  const { corpus, client } = await setup();
  t.after(() => { client.dispose(); corpus.dispose(); });
  client.setPolicyGeneration(2);
  await assert.rejects(ask(client, "laptop", { policyGeneration: 1 }), (e) => e instanceof PersonalError && e.code === "policy_changed");
});

test("librarian: a question longer than the limit is refused by the client without a worker trip", async (t) => {
  const { corpus, client } = await setup();
  t.after(() => { client.dispose(); corpus.dispose(); });
  await assert.rejects(ask(client, "a ".repeat(LIBRARIAN_LIMITS.questionCodePoints)), (e) => e instanceof PersonalError && e.code === "invalid_query");
});
/* ------------------------------------------------------------------ words */

test("librarian: the word scanner finds the words the Unicode pattern finds", () => {
  const texts = [
    "",
    "   ",
    "plain ascii words, with: punctuation! and 42 numbers",
    "café Ünïcödé naïve — Straße, Ελληνικά; кириллица",
    "日本語のテキスト と 한국어 텍스트",
    "astral 𝒜𝒷𝒸 letters and 😀 emoji 𝟘𝟙𝟚 digits",
    "under_score kebab-case dotted.name path/to/file.md",
    "a\u0301 combining mark; zero\u200bwidth; nbsp\u00a0here",
    "trailing word",
    "x",
    "C plus plus is not C+ or C+++, and c is one letter",
  ];
  for (const text of texts) {
    assert.deepEqual(scanWords(text), text.match(/[\p{L}\p{N}]+/gu) ?? [], JSON.stringify(text));
  }
});

test("librarian: C++, G++, C# and F# are words, a link fragment is not", () => {
  assert.deepEqual(scanWords("Embed Node in a C++ application"), ["Embed", "Node", "in", "a", "C++", "application"]);
  assert.deepEqual(scanWords("c++, g++ and C#; F# too. End with c#"), ["c++", "g++", "and", "C#", "F#", "too", "End", "with", "c#"]);
  assert.deepEqual(scanWords("see c#heading and abc++ and b++"), ["see", "c", "heading", "and", "abc", "and", "b"]);
  assert.deepEqual(parseQuestion("embed node in a C++ application").words, ["embed", "node", "c++", "application"]);
});

test("librarian: a question about C++ finds the note about C++", async (t) => {
  const { corpus, client } = await setup({
    ...FILES,
    "Dev/Compiler notes.md": "# Compiler notes\n\nBuild the C++ addon with the bundled toolchain before linking.\n",
    "Dev/Scripting notes.md": "# Scripting notes\n\nBuild the addon with the bundled toolchain before linking.\n",
  });
  t.after(() => { client.dispose(); corpus.dispose(); });
  const r = await ask(client, "c++ addon toolchain");
  assert.equal(paths(r)[0], "Dev/Compiler notes.md");
  assert.deepEqual(r.unmatched, []);
});

/* ------------------------------------------------------------------ honest answers */

test("librarian: a word no note contains is reported, not silently dropped", async (t) => {
  const { corpus, client } = await setup();
  t.after(() => { client.dispose(); corpus.dispose(); });
  const r = await ask(client, "laptop zzzqqqxx");
  assert.deepEqual(r.unmatched, ["zzzqqqxx"]);
  assert.equal(r.confidence, "weak");
  assert.match(renderLibrarianBrief(r), /No shared note contains: zzzqqqxx\./);
  assert.deepEqual((await ask(client, "laptop replacement")).unmatched, []);
});

test("librarian: a quoted phrase found in no note is reported and the answer is not strong", async (t) => {
  const { corpus, client } = await setup();
  t.after(() => { client.dispose(); corpus.dispose(); });
  const missing = await ask(client, '"map of content" laptop');
  assert.deepEqual(missing.phrasesMissing, ["map of content"]);
  assert.notEqual(missing.confidence, "strong");
  assert.match(renderLibrarianBrief(missing), /No shared note contains the exact phrase: "map of content"\./);
  const present = await ask(client, '"hardware request form" laptop');
  assert.deepEqual(present.phrasesMissing, []);
  assert.equal(paths(present)[0], "IT/New laptop request.md");
  assert.equal(present.confidence, "strong");
});

test("librarian: a phrase outside the requester's scope counts as missing", async (t) => {
  const { corpus, client } = await setup();
  t.after(() => { client.dispose(); corpus.dispose(); });
  const allowed = new Set(["Networking/VPN tunnel.md", "IT/New laptop request.md"]);
  const r = await ask(client, '"restricted workbook" laptop', { allowedPaths: allowed });
  assert.deepEqual(r.phrasesMissing, ["restricted workbook"]);
  assert.ok(!paths(r).includes("Private/Secret laptop budget.md"));
});

test("librarian: a misspelt filler word is read as filler, not as a missing word", async (t) => {
  const { corpus, client } = await setup();
  t.after(() => { client.dispose(); corpus.dispose(); });
  const typo = await ask(client, "wher is the hardware request form");
  const clean = await ask(client, "where is the hardware request form");
  assert.deepEqual(typo.corrections, [{ from: "wher", to: "where" }]);
  assert.deepEqual(typo.terms, clean.terms);
  assert.deepEqual(typo.unmatched, []);
  assert.equal(typo.confidence, clean.confidence);
  assert.deepEqual(paths(typo), paths(clean));
});

test("librarian: a note's exact name returns that note first", async (t) => {
  const files = { ...FILES };
  for (let i = 0; i < 40; i++) files[`Log/Entry ${String(i).padStart(4, "0")}.md`] = `Entry text number ${i} about the weekly entry review.\n`;
  const { corpus, client } = await setup(files);
  t.after(() => { client.dispose(); corpus.dispose(); });
  for (const question of ["Entry 0017", "where is Entry 0017"]) {
    const r = await ask(client, question);
    assert.equal(paths(r)[0], "Log/Entry 0017.md", question);
    assert.equal(r.confidence, "strong", question);
  }
});

test("librarian: a name that only resembles the question is not a strong answer on its own", async (t) => {
  const { corpus, client } = await setup({
    "Models/Qwen embedding.md": "# Qwen embedding\n\nNotes on the model card.\n",
    "Kitchen/Bread.md": "# Bread\n\nPooling water on the dough means it is too wet.\n",
    "Kitchen/Soup.md": "# Soup\n\nSimmer the stock.\n",
  });
  t.after(() => { client.dispose(); corpus.dispose(); });
  const r = await ask(client, "qwen embedding pooling strategy comparison");
  assert.equal(paths(r)[0], "Models/Qwen embedding.md");
  assert.equal(r.confidence, "weak");
});

test("librarian: related words are learned only from notes that match the question", async (t) => {
  const files = {};
  for (let i = 0; i < 6; i++) files[`Kit/Laptop ${i}.md`] = `# Laptop ${i}\n\n## Warranty\n\nThe laptop warranty covers the battery for year ${i}.\n`;
  for (let i = 0; i < 6; i++) files[`Kit/Printer ${i}.md`] = `# Printer ${i}\n\n## Toner\n\nThe printer toner lasts ${i} months.\n`;
  const { corpus, client } = await setup(files);
  t.after(() => { client.dispose(); corpus.dispose(); });
  const grounded = await ask(client, "laptop");
  assert.ok(grounded.expanded.length > 0, JSON.stringify(grounded.expanded));
  // The best note carries one word in five: nothing to learn related words from.
  const adrift = await ask(client, "laptop kubernetes ingress annotations controller");
  assert.deepEqual(adrift.expanded, []);
  assert.equal(adrift.confidence, "weak");
  assert.deepEqual(adrift.unmatched, ["kubernetes", "ingress", "annotations", "controller"]);
});

test("librarian: a brief without the newer fields still renders", () => {
  const brief = renderLibrarianBrief({
    question: "x", intent: "lookup", confidence: "none", terms: ["x"], corrections: [], expanded: [], phrases: [],
    total: 0, hits: [], supersession: [], truncated: false,
  });
  assert.match(brief, /No shared note answers this/);
});
