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