/** Personal Notes scope and read policy (0.9.0): acceptance rows S01, S02. */
import test from "node:test";
import assert from "node:assert/strict";
import { isKosmosOperationalPath } from "../dist/kosmos-operational-paths.mjs";
import {
  PERSONAL_WHOLE_VAULT,
  PersonalError,
  createPersonalReadPolicy,
  decidePersonalRead,
  decodeRestComponent,
  defaultPersonalNotesSettings,
  inPersonalScope,
  isUnderAnyFolder,
  isUnderFolder,
  normalizeFolder,
  parseFolderList,
  parseRestQuery,
  sanitizeFolderList,
  vaultPathProblem,
} from "../dist/kosmos-personal-notes.mjs";
import { RANK } from "./helpers/personal-fixture.mjs";

test("the three bad inputs reproduced in the review are rejected", () => {
  assert.equal(inPersonalScope("Notes/../Private/a.md", ["Notes"], []), false, "traversal under Notes");
  assert.equal(inPersonalScope("/etc/a.md", ["/"], []), false, "absolute path under the whole-vault sentinel");
  assert.equal(inPersonalScope("private/a.md", ["Private"], []), false, "case differs from the shared folder");
  assert.equal(inPersonalScope("Private/a.md", ["Private"], []), true, "the exact spelling is shared");
});

test("vault paths: absolute, drive, UNC, NUL, control, dot segments and malformed encoding are rejected", () => {
  const cases = {
    "/etc/passwd": "absolute",
    "C:/Users/x.md": "drive",
    "c:x.md": "drive",
    "//server/share/x.md": "unc",
    "\\\\server\\share\\x.md": "unc",
    "Notes\\x.md": "backslash",
    "Notes/\u0000x.md": "nul",
    "Notes/a\nb.md": "control_character",
    "Notes/./x.md": "dot_segment",
    "Notes/../x.md": "dot_segment",
    "..": "dot_segment",
    "Notes//x.md": "empty_segment",
    "Notes/": "empty_segment",
    "Notes/\uD800x.md": "malformed_encoding",
    "Notes/x\uDC00.md": "malformed_encoding",
    "": "empty",
  };
  for (const [path, problem] of Object.entries(cases)) assert.equal(vaultPathProblem(path), problem, JSON.stringify(path));
  assert.equal(vaultPathProblem(42), "not_string");
  for (const ok of ["Notes/x.md", "Notes/...md", "Notes/%2e%2e/x.md", "Émoji 😀/a b+c.md", ".obsidian/app.json"]) {
    assert.equal(vaultPathProblem(ok), null, ok);
  }
});

test("folder matching is at segment boundaries and case- and form-sensitive", () => {
  assert.equal(isUnderFolder("Notes/a.md", "Notes"), true);
  assert.equal(isUnderFolder("Notes", "Notes"), true);
  assert.equal(isUnderFolder("Notes-old/a.md", "Notes"), false, "sibling prefix");
  assert.equal(isUnderFolder("NotesX.md", "Notes"), false);
  assert.equal(isUnderFolder("notes/a.md", "Notes"), false, "case is not folded");
  assert.equal(isUnderFolder("Cafe\u0301/a.md", "Caf\u00e9"), false, "NFD and NFC folders stay distinct");
  assert.equal(isUnderFolder("Notes/a.md", "Notes/"), false, "an invalid folder never matches");
  assert.equal(isUnderFolder("Notes/a.md", PERSONAL_WHOLE_VAULT), true);
  assert.equal(isUnderFolder("/Notes/a.md", PERSONAL_WHOLE_VAULT), false);
  assert.equal(isUnderAnyFolder("B/x.md", ["A", "B"]), true);
  assert.equal(isUnderAnyFolder("B/x.md", undefined), false);
});

test("empty include, whole vault, exclusions win, and / in the exclusion list excludes everything", () => {
  assert.equal(inPersonalScope("A/x.md", [], []), false, "empty include list shares nothing");
  assert.equal(inPersonalScope("A/x.md", undefined, undefined), false);
  assert.equal(inPersonalScope("A/x.md", ["/"], []), true);
  assert.equal(inPersonalScope("A/Private/x.md", ["/"], ["A/Private"]), false);
  assert.equal(inPersonalScope("A/Private-not/x.md", ["/"], ["A/Private"]), true);
  assert.equal(inPersonalScope("A/x.md", ["/"], ["/"]), false, "exclude-all");
  assert.equal(inPersonalScope("A/x.md", ["A"], ["../A"]), false, "an invalid exclusion fails closed instead of being ignored");
});

test("folder lists are rejected, not repaired, and the rejections are reported", () => {
  const result = parseFolderList(["Import", "Import/", "/Import", "import", "Import", "../x", 7, "C:/x", "/"]);
  assert.deepEqual(result.folders, ["Import", "import", "/"], "distinct case is kept, exact duplicates collapse");
  assert.deepEqual(result.rejected.map((r) => [r.index, r.reason]), [
    [1, "empty_segment"], [2, "absolute"], [5, "dot_segment"], [6, "not_string"], [7, "drive"],
  ]);
  assert.deepEqual(parseFolderList("Import").rejected.map((r) => r.reason), ["not_a_list"]);
  assert.deepEqual(parseFolderList(undefined), { folders: [], rejected: [] });
  const many = parseFolderList(Array.from({ length: 205 }, (_, i) => `F${i}`));
  assert.equal(many.folders.length, 200);
  assert.equal(many.rejected.filter((r) => r.reason === "too_many").length, 5);
  assert.deepEqual(sanitizeFolderList(["A", "A/../B"]), ["A"]);
  assert.equal(normalizeFolder("  Import/Keep  "), "Import/Keep", "typed input is trimmed only");
  assert.equal(normalizeFolder("Import\\Keep"), "", "no separator repair");
  assert.equal(normalizeFolder("/Import"), "");
  assert.equal(normalizeFolder("/"), "/");
});

test("REST input is decoded exactly once and malformed encoding is rejected", () => {
  assert.deepEqual({ ...parseRestQuery("?path=Notes%2Fa%2Bb.md&limit=5") }, { path: "Notes/a+b.md", limit: "5" });
  assert.equal(parseRestQuery("path=a+b.md").path, "a+b.md", "+ is not a space");
  assert.equal(parseRestQuery("path=%252e%252e%2Fx.md").path, "%2e%2e/x.md", "double encoding stays literal after one decode");
  assert.equal(vaultPathProblem(parseRestQuery("path=Notes%2F..%2FPrivate%2Fa.md").path), "dot_segment");
  assert.equal(vaultPathProblem(parseRestQuery("path=%00a.md").path), "nul");
  for (const bad of ["path=%E0%A4%A", "path=%ED%A0%80", "path=%zz"]) {
    assert.throws(() => parseRestQuery(bad), (e) => e instanceof PersonalError && e.code === "invalid_argument", bad);
  }
  assert.throws(() => parseRestQuery("path=a.md&path=b.md"), /duplicate/);
  assert.throws(() => decodeRestComponent("%"), PersonalError);
  assert.equal(Object.getPrototypeOf(parseRestQuery("__proto__=x")), null);
});

const policyFor = (overrides = {}, extra = {}) => createPersonalReadPolicy({
  settings: { ...defaultPersonalNotesSettings(), includeFolders: ["/"], ...overrides },
  generation: 3,
  configDir: ".obsidian",
  isOperationalPath: isKosmosOperationalPath,
  ...extra,
});

test("the policy always excludes config, .git, operational paths, credential guides and selected reports", () => {
  const policy = policyFor({ importReportPaths: ["Import/Keep report.md"] });
  assert.equal(policy.generation, 3);
  assert.equal(policy.allowsPath("Notes/a.md"), true);
  for (const hidden of [".obsidian/app.json", ".git/config", "sub/.git/HEAD", ".gkx/state.md", "_archive/moc-runs/r.md",
    "AGENT-API.md", "agent-api.md", "Sub/Agent-Api.md", "Import/Keep report.md"]) {
    assert.equal(policy.allowsPath(hidden), false, hidden);
  }
  assert.equal(policyFor({}, { configDir: "Config" }).allowsPath("Config/x.md"), false, "the actual config dir is used");
  assert.equal(policyFor({}, { extraDenied: ["Secrets"] }).allowsPath("Secrets/a.md"), false);
  assert.equal(policyFor({ importReportPaths: ["../x"] }).allowsPath("Notes/a.md"), false, "an invalid deny entry fails closed");
  assert.equal(policyFor({}, { configDir: "" }).allowsPath("Notes/a.md"), false, "an invalid config dir fails closed");
  assert.equal(policyFor({ includeFolders: [] }).allowsPath("Notes/a.md"), false);
});

test("the policy snapshots its settings", () => {
  const settings = { ...defaultPersonalNotesSettings(), includeFolders: ["A"] };
  const policy = createPersonalReadPolicy({ settings, generation: 1, configDir: ".obsidian", isOperationalPath: isKosmosOperationalPath });
  settings.includeFolders.push("B");
  assert.equal(policy.allowsPath("B/x.md"), false, "a change needs a new policy and a new generation");
  assert.ok(Object.isFrozen(policy));
});

test("read decision: scope, containment, absent / valid / invalid authored sensitivity", () => {
  const policy = policyFor({ includeFolders: ["Notes"] });
  const contained = { physicallyContained: (p) => p !== "Notes/link.md" };
  const ctx = { policy, source: contained, sensitivityRank: RANK, ceiling: "internal" };
  const plain = { aliases: [], tags: [] };
  assert.deepEqual(decidePersonalRead("Notes/a.md", plain, ctx), { allowed: true }, "no label: an ordinary note is readable");
  assert.equal(decidePersonalRead("Other/a.md", plain, ctx).reason, "out_of_scope");
  assert.equal(decidePersonalRead("Notes/link.md", plain, ctx).reason, "not_contained", "symlink/junction escape");
  assert.deepEqual(decidePersonalRead("Notes/a.md", { authoredSensitivity: "public" }, ctx), { allowed: true });
  assert.deepEqual(decidePersonalRead("Notes/a.md", { authoredSensitivity: "internal" }, ctx), { allowed: true });
  const secret = decidePersonalRead("Notes/a.md", { authoredSensitivity: "secret" }, ctx);
  assert.equal(secret.reason, "sensitivity");
  assert.match(secret.diagnostic, /above the agent ceiling/);
  for (const invalid of ["Secret", "", "toString", "constructor"]) {
    const d = decidePersonalRead("Notes/a.md", { authoredSensitivity: invalid }, ctx);
    assert.equal(d.reason, "invalid_sensitivity", JSON.stringify(invalid));
    assert.ok(d.diagnostic);
  }
  assert.equal(decidePersonalRead("Notes/a.md", { frontmatterError: true }, ctx).reason, "invalid_sensitivity", "unparseable frontmatter fails closed");
  assert.equal(decidePersonalRead("Notes/a.md", { authoredSensitivity: "public" }, { ...ctx, ceiling: "bogus" }).allowed, false);
});
