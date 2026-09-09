import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNextcloudDavRoot,
  effectiveSyncExcludes,
  isExcluded,
  migrateNextcloudSettings,
  migrateNextcloudState,
  planSync,
  safeRelativePath,
} from "../dist/kosmos-nextcloud-sync.mjs";

const L = (hash) => ({ hash, size: 1 });
const R = (etag) => ({ etag, mtime: 1, size: 1 });
const S = (hash, etag) => ({ localHash: hash, remoteEtag: etag, remoteMtime: 1, remoteSize: 1, syncedAt: 1 });

test("malformed saved sync state recovers without losing valid records", () => {
  const base = migrateNextcloudState(null, "scope");
  for (const files of [null, [], "invalid"]) {
    assert.deepEqual(migrateNextcloudState({ ...base, files }, "scope"), base);
  }
  const restored = migrateNextcloudState({ ...base, files: { "bad.md": null, "array.md": [], "good.md": S("a", "b") } }, "scope");
  assert.deepEqual(Object.keys(restored.files), ["good.md"]);
  assert.equal(restored.files["good.md"].localHash, "a");
});

test("first sync uploads one-sided files, downloads the other side, and compares collisions", () => {
  assert.deepEqual(planSync({ "local.md": L("a"), "both.md": L("b") }, { "remote.md": R("r"), "both.md": R("x") }, {}, false), [
    { kind: "compare", path: "both.md", reason: "exists on both sides without common state" },
    { kind: "upload", path: "local.md", reason: "new local file" },
    { kind: "download", path: "remote.md", reason: "new Nextcloud file" },
  ]);
});

test("three-way state distinguishes local, remote, and simultaneous edits", () => {
  const previous = { "local.md": S("a", "1"), "remote.md": S("a", "1"), "both.md": S("a", "1") };
  const actions = planSync(
    { "local.md": L("b"), "remote.md": L("a"), "both.md": L("b") },
    { "local.md": R("1"), "remote.md": R("2"), "both.md": R("2") }, previous, false,
  );
  assert.deepEqual(actions.map((a) => [a.path, a.kind]), [["both.md", "conflict"], ["local.md", "upload"], ["remote.md", "download"]]);
});

test("deletions restore by default and propagate only when explicitly enabled", () => {
  const previous = { "gone-remote.md": S("a", "1"), "gone-local.md": S("a", "1") };
  const local = { "gone-remote.md": L("a") };
  const remote = { "gone-local.md": R("1") };
  assert.deepEqual(planSync(local, remote, previous, false).map((a) => a.kind), ["download", "upload"]);
  assert.deepEqual(planSync(local, remote, previous, true).map((a) => a.kind), ["delete-remote", "delete-local"]);
});

test("changed-versus-deleted is always a conflict", () => {
  const previous = { "a.md": S("old", "1"), "b.md": S("old", "1") };
  const actions = planSync({ "a.md": L("new") }, { "b.md": R("2") }, previous, true);
  assert.deepEqual(actions.map((a) => a.kind), ["conflict", "conflict"]);
});

test("Nextcloud URL builder supports instance roots, DAV roots, subpaths, and safe encoding", () => {
  assert.equal(buildNextcloudDavRoot("https://cloud.example.com", "Ada Lovelace", "My Vault"), "https://cloud.example.com/remote.php/dav/files/Ada%20Lovelace/My%20Vault/");
  assert.equal(buildNextcloudDavRoot("https://example.com/nextcloud/", "ada", "Vault/Nested"), "https://example.com/nextcloud/remote.php/dav/files/ada/Vault/Nested/");
  assert.equal(buildNextcloudDavRoot("https://cloud.example.com/remote.php/dav/files/ada", "ada", "Vault"), "https://cloud.example.com/remote.php/dav/files/ada/Vault/");
  assert.throws(() => buildNextcloudDavRoot("http://cloud.example.com", "ada", "Vault"), /HTTPS/);
  assert.doesNotThrow(() => buildNextcloudDavRoot("http://192.168.1.20", "ada", "Vault"));
});

test("exclusions and path validation block plugin metadata and traversal", () => {
  assert.equal(isExcluded(".obsidian/plugins/kosmos-oden/data.json", [".obsidian/**"]), true);
  assert.equal(isExcluded("Notes/a.md", [".obsidian/**"]), false);
  assert.equal(isExcluded("private/a.md", ["private/**"]), true);
  assert.equal(safeRelativePath("Notes/a.md"), true);
  assert.equal(safeRelativePath("../outside.md"), false);
});

test(".obsidian sync is selectable while Kosmos credential state stays protected", () => {
  const disabled = migrateNextcloudSettings({ syncObsidianConfig: false, excludePatterns: [".obsidian/**", ".git/**"] });
  const disabledPatterns = effectiveSyncExcludes(disabled);
  assert.equal(isExcluded(".obsidian/hotkeys.json", disabledPatterns), true);

  const enabled = migrateNextcloudSettings({ syncObsidianConfig: true, excludePatterns: [".obsidian/**", ".git/**"] });
  const enabledPatterns = effectiveSyncExcludes(enabled);
  assert.equal(isExcluded(".obsidian/hotkeys.json", enabledPatterns), false);
  assert.equal(isExcluded(".obsidian/plugins/example/data.json", enabledPatterns), false);
  assert.equal(isExcluded(".obsidian/plugins/kosmos-oden/data.json", enabledPatterns), true);
  // Version-suffixed install folders are the common real-world case and a
  // literal path missed them entirely.
  assert.equal(isExcluded(".obsidian/plugins/kosmos-oden_v0.8.2/data.json", enabledPatterns), true);
  assert.equal(isExcluded(".obsidian/plugins/kosmos-oden_v0.7.0/data.json", enabledPatterns), true);
  // A folder renamed outside that pattern is still covered when the host
  // reports its actual install directory.
  const named = effectiveSyncExcludes(enabled, ".obsidian/plugins/my-kosmos-build");
  assert.equal(isExcluded(".obsidian/plugins/my-kosmos-build/data.json", named), true);
  assert.equal(isExcluded(".obsidian/plugins/my-kosmos-build/data.json", enabledPatterns), false);
  // Another plugin's data is still the user's choice to sync.
  assert.equal(isExcluded(".obsidian/plugins/example/data.json", named), false);
});

test("sync state resets when the remote scope changes", () => {
  const old = { schemaVersion: 2, scope: "one", files: { "a.md": S("a", "1") } };
  assert.equal(Object.keys(migrateNextcloudState(old, "one").files).length, 1);
  assert.equal(Object.keys(migrateNextcloudState(old, "two").files).length, 0);
});
