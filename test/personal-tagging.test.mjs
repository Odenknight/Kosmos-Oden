// Personal Notes 0.9.0 — optional deterministic tagging (T01–T08, pure layer).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  patchFrontmatter,
  readFrontmatter,
  FrontmatterPatchError,
  planTagging,
  planAutoTimestamp,
  applyTaggingPlan,
  restoreTaggingBackup,
  autoTimestampDecision,
  importStarted,
  importCompleted,
  importReviewed,
  isValidTaggingUid,
} from "../dist/kosmos-personal-notes.mjs";
import { parseFrontmatter, formatTimestamp, makeGkxUuidV7, applyNoteTimestamps } from "../dist/kosmos-core.mjs";

const sha = (text) => createHash("sha256").update(text, "utf8").digest("hex");
// Engine parser wrapped as the injected parse. The plugin injects Obsidian parseYaml (strict).
const parse = (yaml) => parseFrontmatter(`---\n${yaml}\n---\n`).data;
const throwingParse = () => { throw new Error("bad indentation of a mapping entry"); };
const T0 = Date.UTC(2026, 10, 12, 10, 0, 0);
const CTIME = Date.UTC(2026, 0, 2, 3, 4, 5);
const MTIME = Date.UTC(2026, 5, 6, 7, 8, 9);
const BODY = "# Title\r\n\nBody line with --- and key: value\n\n- [ ] task\n";

function note(path, raw, extra = {}) { return { path, raw, hash: sha(raw), ctimeMs: CTIME, mtimeMs: MTIME, ...extra }; }
function uidGen(start = 1) {
  let n = start;
  const calls = [];
  const gen = (ms) => { calls.push(ms); return `019a72b0-0000-7000-8000-${String(n++).padStart(12, "0")}`; };
  gen.calls = calls;
  return gen;
}
function base(notes, options, extra = {}) {
  return { notes, options: { timestamps: false, uniqueIds: false, supersession: false, ...options }, proposalTimeMs: T0, newUid: uidGen(), formatTimestamp, parse, ...extra };
}
function bodyOf(raw) {
  const s = raw.replace(/^\uFEFF/, "");
  const m = /^---\r?\n(?:[\s\S]*?\r?\n)?---(\r?\n|$)/.exec(s);
  return m ? s.slice(m[0].length) : s;
}
function memoryHost(files) {
  const backups = new Map();
  const writes = [];
  const own = [];
  return {
    files, backups, writes, own,
    async readRaw(p) { if (!files.has(p)) throw new Error("missing"); return files.get(p); },
    async writeRaw(p, text, expected) { if (files.get(p) !== expected) return false; files.set(p, text); writes.push(p); return true; },
    async saveBackup(p, before) { const ref = `backup/${backups.size}/${p}`; backups.set(ref, before); return ref; },
    async readBackup(ref) { return backups.get(ref); },
    async sha256(t) { return sha(t); },
    recordOwnWrite(p, h) { own.push([p, h]); },
  };
}

/* ------------------------------------------------------------ patcher (T04) */

test("patcher adds one key and keeps every other byte (LF, comments, quoting, order)", () => {
  const raw = "---\n# keep this comment\ntitle: 'Quoted title'\n\"odd key\": \"x\"\ntags:\n  - a   # inline\n  - b\nsource: onenote\n---\n" + BODY;
  const out = patchFrontmatter(raw, [{ op: "setScalar", key: "uid", value: "019a72b0-0000-7000-8000-000000000001" }], parse);
  assert.equal(out.changed, true);
  assert.equal(out.raw, raw.replace("source: onenote\n", "source: onenote\nuid: \"019a72b0-0000-7000-8000-000000000001\"\n"));
  assert.equal(bodyOf(out.raw), BODY);
});

test("patcher keeps CRLF, BOM and a missing trailing newline", () => {
  const raw = "\uFEFF---\r\ntitle: A\r\nsupersedes:\r\n  - \"[[Old]]\"\r\n---\r\nbody\r\nlast line without newline";
  const out = patchFrontmatter(raw, [
    { op: "setScalar", key: "created_at", value: "2026-01-02T03:04:05.000Z" },
    { op: "addListItem", key: "supersedes", value: "[[Older]]" },
  ], parse);
  assert.equal(out.raw, "\uFEFF---\r\ntitle: A\r\nsupersedes:\r\n  - \"[[Old]]\"\r\n  - \"[[Older]]\"\r\ncreated_at: \"2026-01-02T03:04:05.000Z\"\r\n---\r\nbody\r\nlast line without newline");
  assert.ok(!/[^\r]\n/.test(out.raw), "no bare LF introduced");
});

test("patcher adds a frontmatter block to a note without one, matching its line endings", () => {
  const lf = "Just text\nmore\n";
  assert.equal(patchFrontmatter(lf, [{ op: "setScalar", key: "uid", value: "u" }], parse).raw, "---\nuid: \"u\"\n---\n" + lf);
  const crlf = "\uFEFFJust text\r\nmore";
  assert.equal(patchFrontmatter(crlf, [{ op: "setScalar", key: "uid", value: "u" }], parse).raw, "\uFEFF---\r\nuid: \"u\"\r\n---\r\nJust text\r\nmore");
  const empty = "";
  assert.equal(patchFrontmatter(empty, [{ op: "setList", key: "supersedes", values: ["[[A]]"] }], parse).raw, "---\nsupersedes:\n  - \"[[A]]\"\n---\n");
});

test("patcher refuses malformed, duplicate, unterminated and unsafe shapes; nothing is returned", () => {
  const refuse = (raw, code, changes = [{ op: "setScalar", key: "uid", value: "u" }], p = parse) =>
    assert.throws(() => patchFrontmatter(raw, changes, p), (e) => e instanceof FrontmatterPatchError && e.code === code, `${code}: ${JSON.stringify(raw)}`);
  refuse("---\ntitle: a\ntitle: b\n---\nx", "duplicate_key");
  refuse("---\ntitle: a\n\tbad: tab\n---\nx", "malformed_yaml");
  refuse("---\n  orphan: indented\n---\nx", "malformed_yaml");
  refuse("---\ntitle: \"unclosed\n---\nx", "malformed_yaml");
  refuse("---\ntags: [a, b\n---\nx", "malformed_yaml");
  refuse("---\njust words\n---\nx", "malformed_yaml");
  refuse("---\ntitle: a\nno end", "unterminated_frontmatter");
  refuse("---", "unterminated_frontmatter");
  refuse("---\ntitle: a\n---\nx", "malformed_yaml", undefined, throwingParse);
  refuse("---\nuid: |\n  block\n---\nx", "unsupported_shape");
  refuse("---\nuid: {a: 1}\n---\nx", "unsupported_shape");
  refuse("---\nuid: &anchor value\n---\nx", "unsupported_shape");
  refuse("---\nsupersedes:\n  nested: map\n---\nx", "unsupported_shape", [{ op: "addListItem", key: "supersedes", value: "[[A]]" }]);
  refuse("---\nuid: a\n---\nx", "invalid_change", [{ op: "setScalar", key: "bad\nkey", value: "u" }]);
});

test("patcher verification refuses a patch whose unrelated values would read differently", () => {
  let calls = 0;
  // A parser that disagrees with itself after the edit simulates a lossy edit.
  const drifting = (yaml) => ({ ...parse(yaml), other: calls++ === 0 ? "a" : "b" });
  assert.throws(() => patchFrontmatter("---\nother: a\n---\nx", [{ op: "setScalar", key: "uid", value: "u" }], drifting),
    (e) => e.code === "verification_failed");
});

test("patcher round-trip property: only target lines change; repeating the patch is a no-op", () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const pool = ["title: Plain", "alias: 'single'", "\"quoted key\": \"v\"", "# comment", "", "tags:\n  - x\n  - y", "list: [a, b]",
    "url: http://example.com/a#b", "source: \"OneNote\"  # note", "empty:", "nested:\n  child: 1"];
  for (let i = 0; i < 300; i++) {
    const keys = new Set();
    const lines = [];
    for (let j = 0, n = rnd(6); j < n; j++) {
      const line = pool[rnd(pool.length)];
      const key = /^("[^"]+"|[^:#\s][^:]*):/.exec(line)?.[1];
      if (key && keys.has(key)) continue;
      if (key) keys.add(key);
      lines.push(line);
    }
    const eol = rnd(2) ? "\r\n" : "\n";
    const fm = rnd(4) ? `---${eol}${lines.map((l) => l.replace(/\n/g, eol) + eol).join("")}---${eol}` : "";
    const raw = (rnd(3) ? "" : "\uFEFF") + fm + `Body ${i}${eol}--- not a fence${eol}` + (rnd(2) ? "end" : `end${eol}`);
    const changes = [{ op: "setScalar", key: "updated_at", value: "2026-11-12T10:00:00.000Z" }, { op: "addListItem", key: "supersedes", value: `[[N${i}]]` }];
    const out = patchFrontmatter(raw, changes, parse);
    assert.equal(bodyOf(out.raw), bodyOf(raw), `body ${i}`);
    assert.equal(out.raw.startsWith("\uFEFF"), raw.startsWith("\uFEFF"));
    const before = raw.replace(/^﻿/, "").split(eol);
    const after = out.raw.replace(/^﻿/, "").split(eol);
    const added = after.filter((l) => !before.includes(l));
    const expected = ["  - \"[[N" + i + "]]\"", "supersedes:", "updated_at: \"2026-11-12T10:00:00.000Z\""];
    if (!fm) expected.push("---", "---");
    assert.deepEqual(added.sort(), expected.sort(), `added lines ${i}`);
    const removedAll = before.filter((l) => !after.includes(l));
    assert.deepEqual(removedAll, [], `nothing removed ${i}`);
    const again = patchFrontmatter(out.raw, changes, parse);
    assert.equal(again.changed, false, `idempotent ${i}`);
    assert.equal(again.raw, out.raw);
  }
});

/* ------------------------------------------------- independent options (T02) */

test("T01/T02 all options off: no change to any note", () => {
  const plan = planTagging(base([note("a.md", "plain\n"), note("b.md", "---\ntitle: B\n---\nx")], {}));
  assert.ok(plan.notes.every((n) => n.changes.length === 0 && n.proposedRaw === null));
});

test("T02 timestamp-only adds created_at/updated_at from file times, nothing else, no gkx_version", () => {
  const raw = "Plain body\n";
  const gen = uidGen();
  const plan = planTagging(base([note("Notes/a.md", raw)], { timestamps: true }, { newUid: gen }));
  const [n] = plan.notes;
  assert.equal(n.proposedRaw, `---\ncreated_at: "${new Date(CTIME).toISOString()}"\nupdated_at: "${new Date(MTIME).toISOString()}"\n---\nPlain body\n`);
  assert.equal(gen.calls.length, 0);
  assert.ok(!/gkx_version|uid/.test(n.proposedRaw));
});

test("T02 UID-only adds a flat uid once via the injected generator", () => {
  const gen = uidGen();
  const plan = planTagging(base([note("a.md", "---\ntitle: A\n---\nbody")], { uniqueIds: true }, { newUid: gen }));
  assert.equal(plan.notes[0].proposedRaw, "---\ntitle: A\nuid: \"019a72b0-0000-7000-8000-000000000001\"\n---\nbody");
  assert.deepEqual(gen.calls, [T0]);
});

test("T02 lineage-only writes supersedes on the replacement only", () => {
  const resolve = (t) => ({ Old: "Old.md", New: "New.md" })[t] ?? null;
  const lineageNotes = [{ path: "New.md", supersedes: [], supersededBy: [] }, { path: "Old.md", supersedes: [], supersededBy: [] }];
  const plan = planTagging(base([note("New.md", "new body"), note("Old.md", "old body")], { supersession: true },
    { supersedes: { requests: [{ path: "New.md", target: "Old" }], notes: lineageNotes, resolve } }));
  const byPath = Object.fromEntries(plan.notes.map((n) => [n.path, n]));
  assert.equal(byPath["New.md"].proposedRaw, "---\nsupersedes:\n  - \"[[Old]]\"\n---\nnew body");
  assert.equal(byPath["Old.md"].proposedRaw, null, "older note untouched");
});

test("T02 all-enabled on an Importer note keeps source properties and body", () => {
  const raw = "---\ncreated: 2024-03-01T09:00:00Z\nmodified: 2024-03-02T09:00:00Z\nsource: Google Keep\ntags:\n  - Keep/Pinned\n---\nbody\n";
  const resolve = (t) => (t === "Old" ? "Old.md" : null);
  const plan = planTagging(base([note("Keep/n.md", raw)], { timestamps: true, uniqueIds: true, supersession: true },
    { supersedes: { requests: [{ path: "Keep/n.md", target: "Old" }], notes: [{ path: "Keep/n.md", supersedes: [], supersededBy: [] }, { path: "Old.md", supersedes: [], supersededBy: [] }], resolve } }));
  const out = plan.notes[0].proposedRaw;
  assert.equal(out, raw.replace("---\nbody", "created_at: \"2024-03-01T09:00:00.000Z\"\nupdated_at: \"2024-03-02T09:00:00.000Z\"\nuid: \"019a72b0-0000-7000-8000-000000000001\"\nsupersedes:\n  - \"[[Old]]\"\n---\nbody"));
  assert.ok(!out.includes("gkx_version"));
});

/* ----------------------------------------------- identity & idempotence (T03/T05) */

async function applyAll(plan, files) {
  const host = memoryHost(files);
  const result = await applyTaggingPlan(plan, host);
  return { host, result };
}

test("T03/T05 reapply after apply: no diff, no new uid, no timestamp churn; uid survives edit and rename", async () => {
  const files = new Map([["a.md", "first body\n"]]);
  const opts = { timestamps: true, uniqueIds: true };
  const plan1 = planTagging(base([note("a.md", files.get("a.md"))], opts));
  const { result } = await applyAll(plan1, files);
  assert.equal(result.written.length, 1);
  const uid = readFrontmatter(files.get("a.md"), parse).scalars.get("uid");
  assert.ok(isValidTaggingUid(uid));

  const gen = uidGen(50);
  const plan2 = planTagging(base([note("a.md", files.get("a.md"), { mtimeMs: MTIME + 99999 })], opts, { newUid: gen, proposalTimeMs: T0 + 5000 }));
  assert.deepEqual(plan2.notes[0].changes, []);
  assert.equal(gen.calls.length, 0);
  const second = await applyTaggingPlan(plan2, memoryHost(files));
  assert.equal(second.written.length, 0);

  // Edit the body and move the note: identity is not derived from path or content.
  const moved = files.get("a.md").replace("first body", "edited body");
  const plan3 = planTagging(base([note("Archive/renamed.md", moved, { mtimeMs: MTIME + 1e6 })], opts, { newUid: gen }));
  assert.deepEqual(plan3.notes[0].changes, []);
  assert.equal(readFrontmatter(moved, parse).scalars.get("uid"), uid);
});

test("T05 frozen proposal: re-preview of an unchanged pending plan reuses uid and timestamps", () => {
  const n = note("a.md", "body", { ctimeMs: null, mtimeMs: null });
  const opts = { timestamps: true, uniqueIds: true };
  const first = planTagging(base([n], opts));
  const again = planTagging(base([n], opts, { pending: first, proposalTimeMs: T0 + 60_000, newUid: uidGen(900) }));
  assert.equal(again.notes[0].proposedRaw, first.notes[0].proposedRaw);
  assert.ok(first.notes[0].proposedRaw.includes(`created_at: "${new Date(T0).toISOString()}"`), "falls back to frozen proposal time");
  // A changed note gets a fresh proposal for its uid.
  const changed = planTagging(base([note("a.md", "edited", { ctimeMs: null, mtimeMs: null })], opts, { pending: first, newUid: uidGen(900) }));
  assert.ok(changed.notes[0].proposedRaw.includes("8000-000000000900"));
});

test("T03 duplicate uids across the selection and the vault index are surfaced; repair only on explicit choice", () => {
  const U = "019a72b0-0000-7000-8000-0000000000aa";
  const a = note("a.md", `---\nuid: ${U}\n---\nA`);
  const b = note("b.md", `---\nuid: "${U}"\n---\nB`);
  const c = note("c.md", "---\nuid: 0000-not-a-uuid\n---\nC");
  const plan = planTagging(base([a, b, c], { uniqueIds: true }, { existingUids: new Map([[U, ["elsewhere.md"]]]) }));
  const dup = plan.findings.find((f) => f.kind === "duplicate_uid");
  assert.deepEqual(dup.paths, ["a.md", "b.md", "elsewhere.md"]);
  assert.deepEqual(dup.repairing, []);
  assert.deepEqual(plan.findings.find((f) => f.kind === "invalid_uid"), { kind: "invalid_uid", path: "c.md", value: "0000-not-a-uuid" });
  assert.ok(plan.notes.every((n) => n.changes.length === 0), "never silently re-ID");

  const repaired = planTagging(base([a, b, c], { uniqueIds: true }, { existingUids: new Map([[U, ["elsewhere.md"]]]), uidRepairs: ["b.md"] }));
  const byPath = Object.fromEntries(repaired.notes.map((n) => [n.path, n]));
  assert.equal(byPath["a.md"].changes.length, 0);
  assert.deepEqual(byPath["b.md"].changes, [{ op: "setScalar", key: "uid", value: "019a72b0-0000-7000-8000-000000000001" }]);
  assert.equal(byPath["c.md"].changes.length, 0);
});

test("T04 malformed or duplicate-key YAML blocks writing for that note", async () => {
  const bad = note("bad.md", "---\ntitle: a\ntitle: b\n---\nx");
  const good = note("good.md", "y");
  const plan = planTagging(base([bad, good], { uniqueIds: true }));
  assert.equal(plan.notes.find((n) => n.path === "bad.md").proposedRaw, null);
  assert.equal(plan.findings[0].kind, "frontmatter_error");
  assert.equal(plan.findings[0].code, "duplicate_key");
  const strict = planTagging(base([note("m.md", "---\ntitle: a\n---\nx")], { uniqueIds: true }, { parse: throwingParse }));
  assert.equal(strict.notes[0].proposedRaw, null);
  assert.equal(strict.findings[0].code, "malformed_yaml");
});

/* -------------------------------------------------------------- time (T06) */

test("T06 UTC default, local-offset option, created stable, invalid timestamps surfaced", () => {
  const utc = planTagging(base([note("a.md", "x")], { timestamps: true }));
  assert.match(utc.notes[0].proposedRaw, /created_at: "\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z"/);
  const local = planTagging(base([note("a.md", "x")], { timestamps: true }, { timestamps: { useLocalTimezone: true, createdKey: "made", updatedKey: "changed" } }));
  const made = /made: "([^"]+)"/.exec(local.notes[0].proposedRaw)[1];
  assert.match(made, /[+-]\d\d:\d\d$/);
  assert.equal(Date.parse(made), CTIME);
  assert.match(local.notes[0].proposedRaw, /changed: "/);

  const authored = "---\ncreated_at: 2020-01-01T00:00:00Z\nupdated_at: yesterday\n---\nx";
  const keep = planTagging(base([note("a.md", authored)], { timestamps: true }));
  assert.deepEqual(keep.notes[0].changes, []);
  assert.deepEqual(keep.findings, [{ kind: "invalid_timestamp", path: "a.md", key: "updated_at", value: "yesterday" }]);
});

test("T06 GKX 2.2 keeps its stable timestamp exactly like Engine applyNoteTimestamps", () => {
  const without = "---\ngkx_version: \"2.2\"\nuid: 019a72b0-0000-7000-8000-000000000123\n---\nx";
  const plan = planTagging(base([note("g.md", without)], { timestamps: true }));
  const fm = { gkx_version: "2.2" };
  applyNoteTimestamps(fm, CTIME, MTIME, {});
  assert.deepEqual(plan.notes[0].changes, [{ op: "setScalar", key: "timestamp", value: fm.timestamp }]);
  assert.ok(!plan.notes[0].proposedRaw.includes("created_at"));
  const withTs = "---\ngkx_version: \"2.2\"\ntimestamp: 2025-01-01T00:00:00Z\n---\nx";
  assert.deepEqual(planTagging(base([note("g.md", withTs)], { timestamps: true })).notes[0].changes, []);
  const auto = planAutoTimestamp({ note: note("g.md", withTs), eventTimeMs: T0, formatTimestamp, parse });
  assert.deepEqual(auto.notes[0].changes, [], "automatic updates never refresh a GKX 2.2 timestamp");
});

test("source creation property wins; Importer date properties are never rewritten", () => {
  const raw = "---\ncreated: 2023-05-01T08:00:00+02:00\nmodified: not a date\n---\nx";
  const plan = planTagging(base([note("a.md", raw)], { timestamps: true }));
  const out = plan.notes[0].proposedRaw;
  assert.ok(out.includes(`created_at: "2023-05-01T06:00:00.000Z"`));
  assert.ok(out.includes(`updated_at: "${new Date(MTIME).toISOString()}"`), "invalid source value falls back to mtime");
  assert.ok(out.startsWith("---\ncreated: 2023-05-01T08:00:00+02:00\nmodified: not a date\n"));
});

/* ---------------------------------------------------------- writer (T05) */

test("T05 writer: stale preview is skipped, exact before-bytes backed up, restore refuses later edits", async () => {
  const files = new Map([["a.md", "---\r\ntitle: A\r\n---\r\nalpha"], ["b.md", "beta"]]);
  const plan = planTagging(base([note("a.md", files.get("a.md")), note("b.md", files.get("b.md"))], { uniqueIds: true }));
  files.set("b.md", "beta edited after preview");
  const host = memoryHost(files);
  const result = await applyTaggingPlan(plan, host);
  assert.deepEqual(result.written.map((w) => w.path), ["a.md"]);
  assert.deepEqual(result.skipped.map((s) => [s.path, s.reason]), [["b.md", "changed"]]);
  assert.equal(files.get("b.md"), "beta edited after preview", "never overwritten");
  assert.equal(host.backups.get(result.written[0].backupRef), "---\r\ntitle: A\r\n---\r\nalpha");
  assert.deepEqual(result.manifest.entries.map((e) => e.path), ["a.md"]);
  assert.deepEqual(result.ownWrites, [{ path: "a.md", hash: sha(files.get("a.md")) }]);
  assert.deepEqual(host.own, [["a.md", sha(files.get("a.md"))]], "own write recorded before writing");

  const entry = result.manifest.entries[0];
  const edited = files.get("a.md") + "\r\nuser edit";
  files.set("a.md", edited);
  assert.deepEqual(await restoreTaggingBackup(entry, host), { restored: false, reason: "changed_since_apply" });
  assert.equal(files.get("a.md"), edited);
  files.set("a.md", plan.notes[0].proposedRaw);
  assert.deepEqual(await restoreTaggingBackup(entry, host), { restored: true });
  assert.equal(files.get("a.md"), "---\r\ntitle: A\r\n---\r\nalpha");
});

test("writer refuses to write without a working hash or backup", async () => {
  const files = new Map([["a.md", "x"]]);
  const plan = planTagging(base([note("a.md", "x")], { uniqueIds: true }));
  const noHash = { ...memoryHost(files), async sha256() { return ""; } };
  const r1 = await applyTaggingPlan(plan, noHash);
  assert.equal(r1.failed.length, 1);
  const noBackup = { ...memoryHost(files), async saveBackup() { return ""; } };
  const r2 = await applyTaggingPlan(plan, noBackup);
  assert.equal(r2.failed.length, 1);
  assert.equal(files.get("a.md"), "x");
});

/* ------------------------------------------- automatic timestamps (T05/T08) */

const tagging = { enabled: true, folders: ["Notes"], timestamps: true, uniqueIds: true, supersession: true, automaticTimestamps: true };
const under = (p, folders) => folders.some((f) => f === "/" || p === f || p.startsWith(f + "/"));
const state = (over = {}) => ({ tagging, eventsLive: true, isUnderAnyFolder: under, baselineHash: "h0", ownWriteHashes: new Set(), imports: { running: [], awaitingReview: [] }, ...over });
const ev = (over = {}) => ({ kind: "modify", path: "Notes/a.md", contentHash: "h1", eventTimeMs: T0, ...over });

test("automatic timestamps: only real content changes inside tagging folders, never reads/index/startup", () => {
  assert.deepEqual(autoTimestampDecision(ev(), state()), { action: "stamp", eventTimeMs: T0, recordHash: "h1" });
  for (const kind of ["read", "index", "open", "rename", "metadata", "delete"]) assert.equal(autoTimestampDecision(ev({ kind }), state()).action, "skip", kind);
  assert.equal(autoTimestampDecision(ev(), state({ eventsLive: false })).reason, "startup_discovery");
  assert.equal(autoTimestampDecision(ev({ contentHash: "h0" }), state()).reason, "unchanged");
  assert.equal(autoTimestampDecision(ev(), state({ baselineHash: undefined })).reason, "no_baseline");
  assert.equal(autoTimestampDecision(ev({ kind: "create" }), state({ baselineHash: undefined })).action, "stamp");
  assert.equal(autoTimestampDecision(ev({ path: "Other/a.md" }), state()).reason, "outside_tagging_folders");
  assert.equal(autoTimestampDecision(ev(), state({ tagging: { ...tagging, automaticTimestamps: false } })).reason, "disabled");
  assert.equal(autoTimestampDecision(ev(), state({ tagging: { ...tagging, enabled: false } })).reason, "disabled");
  assert.equal(autoTimestampDecision(ev(), state({ isExcludedPath: () => true })).reason, "excluded_path");
  assert.equal(autoTimestampDecision(ev({ contentHash: null }), state()).reason, "hash_unavailable");
});

test("T05 no stamp loop: the writer's own change is ignored, the next user edit stamps again", async () => {
  const files = new Map([["Notes/a.md", "---\ncreated_at: 2026-01-01T00:00:00Z\nuid: keep-me\n---\nbody"]]);
  const own = new Set();
  const host = { ...memoryHost(files), recordOwnWrite: (_p, h) => own.add(h) };
  const decision = autoTimestampDecision(ev({ contentHash: sha(files.get("Notes/a.md")) }), state({ ownWriteHashes: own }));
  assert.equal(decision.action, "stamp");
  const plan = planAutoTimestamp({ note: note("Notes/a.md", files.get("Notes/a.md")), eventTimeMs: decision.eventTimeMs, formatTimestamp, parse });
  assert.deepEqual(plan.notes[0].changes, [{ op: "setScalar", key: "updated_at", value: new Date(T0).toISOString() }], "created kept, uid/lineage untouched");
  const result = await applyTaggingPlan(plan, host, { backup: false });
  assert.equal(result.written[0].backupRef, null);
  const afterHash = sha(files.get("Notes/a.md"));
  const echo = autoTimestampDecision(ev({ contentHash: afterHash, eventTimeMs: T0 + 10 }), state({ baselineHash: decision.recordHash, ownWriteHashes: own }));
  assert.equal(echo.reason, "own_write");
  // Replanning the same content at a later time would be the only way to loop; the guard prevents it.
  const userEdit = autoTimestampDecision(ev({ contentHash: "user-edit", eventTimeMs: T0 + 5000 }), state({ baselineHash: afterHash, ownWriteHashes: own }));
  assert.deepEqual(userEdit, { action: "stamp", eventTimeMs: T0 + 5000, recordHash: "user-edit" });
});

test("T08 import boundary: deferred while Importer runs; outside imports wait for explicit review", () => {
  let imports = { running: [], awaitingReview: [] };
  imports = importStarted(imports, "Notes/Keep", true);
  assert.equal(autoTimestampDecision(ev({ path: "Notes/Keep/a.md" }), state({ imports })).reason, "import_running");
  assert.equal(autoTimestampDecision(ev({ path: "Notes/other.md" }), state({ imports })).action, "stamp", "other folders unaffected");
  imports = importCompleted(imports, "Notes/Keep");
  assert.equal(autoTimestampDecision(ev({ path: "Notes/Keep/a.md" }), state({ imports })).action, "stamp");

  imports = importStarted(imports, "Notes/OneNote", false);
  assert.deepEqual(imports, { running: [], awaitingReview: ["Notes/OneNote"] });
  assert.equal(autoTimestampDecision(ev({ path: "Notes/OneNote/p.md" }), state({ imports })).reason, "import_awaiting_review");
  assert.equal(autoTimestampDecision(ev({ path: "Notes/OneNote/p.md", eventTimeMs: T0 + 9e9 }), state({ imports })).reason, "import_awaiting_review", "no timeout");
  imports = importReviewed(imports, "Notes/OneNote");
  assert.equal(autoTimestampDecision(ev({ path: "Notes/OneNote/p.md" }), state({ imports })).action, "stamp");
});

test("planTagging uses the injected Engine UUIDv7 generator for real ids", () => {
  const plan = planTagging(base([note("a.md", "x")], { uniqueIds: true }, { newUid: makeGkxUuidV7 }));
  const uid = /uid: "([^"]+)"/.exec(plan.notes[0].proposedRaw)[1];
  assert.ok(isValidTaggingUid(uid) && uid[14] === "7");
});
