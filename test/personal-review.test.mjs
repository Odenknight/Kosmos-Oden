/**
 * Personal Notes 0.9.0 independent review: regression tests for confirmed
 * defects. Each test reproduces the concrete input from the review.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { indexed, loadPlugin, makeApp, unloadPlugin } from "./helpers/plugin-harness.mjs";

test("review: an invalid saved exclusion never widens the shared selection after migration", async () => {
  const { migrateProfileSettings, createPersonalReadPolicy } = await import("../dist/kosmos-personal-notes.mjs");
  const { RANK } = await import("./helpers/personal-fixture.mjs");
  const policyFor = (personalNotes) => createPersonalReadPolicy({ settings: personalNotes, generation: 1, configDir: ".obsidian", isOperationalPath: () => false });
  const cases = [
    { activeProfile: "personal", personalNotes: { includeFolders: ["Import"], excludeFolders: ["Import\\Private"] } },
    { activeProfile: "personal", personalNotes: { includeFolders: ["/"], excludeFolders: ["Private/"] } },
    { personalNotesEnabled: true, personalNotesFolders: ["Import"], personalNotesExcludedFolders: ["Import/Private/"], personalNotesPriorDefaultSensitivity: "internal" },
  ];
  for (const raw of cases) {
    const before = policyFor({ includeFolders: raw.personalNotes?.includeFolders ?? raw.personalNotesFolders, excludeFolders: raw.personalNotes?.excludeFolders ?? raw.personalNotesExcludedFolders, importReportPaths: [] });
    assert.equal(before.allowsPath("Import/Private/diary.md"), false, "the saved (invalid) exclusion fails closed before migration");
    const r = migrateProfileSettings(raw, { sensitivityRank: RANK, failClosedSensitivity: "secret" });
    assert.equal(r.connectorMustStayStopped, true);
    const after = policyFor(r.personalNotes);
    for (const path of ["Import/Private/diary.md", "Private/diary.md"]) {
      assert.equal(after.allowsPath(path), false, `${JSON.stringify(raw)}: ${path} must stay unshared after migration`);
    }
  }
});

test("review: an omitted note outside the selection does not turn the agent's coverage state to partial", async () => {
  const { makeVault, makeService } = await import("./helpers/personal-fixture.mjs");
  const vault = makeVault({ "Public/a.md": "apple\n", "Private/huge.md": { raw: "apple\n", omitted: "too_large" } });
  vault.corpus.state = "partial"; // MemoryCorpus: any omission anywhere in the vault makes the corpus partial
  const { service } = makeService(vault, { includeFolders: ["Public"] });
  const overview = await service.call("vault_overview", {}, "mcp");
  assert.equal(overview.omitted, 0);
  assert.equal(overview.state, "ready", "the hidden omitted file is not observable through the state");
  const search = await service.call("search_notes", { query: "apple" }, "mcp");
  assert.deepEqual(search.coverage, { state: "ready", searched: 1, omitted: 0 });

  const { service: wide } = makeService(vault, { includeFolders: ["/"] });
  assert.equal((await wide.call("vault_overview", {}, "mcp")).state, "partial", "an omitted shared note still reports partial");
  vault.corpus.state = "indexing";
  assert.equal((await service.call("vault_overview", {}, "mcp")).state, "indexing");
});

test("review: a hidden note with the same name does not change a shared note's lineage", async () => {
  const { makeVault, makeService } = await import("./helpers/personal-fixture.mjs");
  const { lineageView } = await import("../dist/kosmos-personal-notes.mjs");
  const files = { "Public/New.md": { raw: "new\n", meta: { supersedes: ["[[Plan]]"] } }, "Public/Plan.md": "plan\n" };
  const view = async (extra) => {
    const { service } = makeService(makeVault({ ...files, ...extra }), { includeFolders: ["Public"] }, { lineage: lineageView });
    const r = await service.call("get_lineage", { path: "Public/New.md" }, "mcp");
    return { edges: r.edges, unresolved: r.unresolved, nodes: r.nodes.map((n) => n.path) };
  };
  const alone = await view({});
  assert.deepEqual(alone.edges, [{ from: "Public/New.md", to: "Public/Plan.md", source: "declared" }]);
  assert.deepEqual(await view({ "Private/Plan.md": "secret plan\n" }), alone, "the agent cannot tell that Private/Plan.md exists");
  const twoShared = await view({ "Public/Old/Plan.md": "other\n" });
  assert.deepEqual(twoShared.unresolved.map((u) => u.reason), ["ambiguous"], "two shared notes with the name stay ambiguous");
});

test("review: in network mode the configured connection hostname passes Host/Origin checks; others still fail", async () => {
  const { KosmosAgentServer, migrateAgentSettings } = await import("../dist/kosmos-agent-server.mjs");
  const make = (advertisedBaseUrl, bindMode = "lan") => {
    const s = migrateAgentSettings({ ...settings(["Notes"]), schemaVersion: 11 });
    s.personalNotes.connection = { ...s.personalNotes.connection, bindMode, advertisedBaseUrl };
    return new KosmosAgentServer(http, s, { getGraph: async () => ({}), getNoteContent: async () => null, vaultName: () => "V", lanAddresses: () => ["192.0.2.10"] });
  };
  const lan = make("https://obsidian-pc.example.net:8443/kosmos");
  assert.equal(lan.hostAllowed("192.0.2.10:4816"), true);
  assert.equal(lan.hostAllowed("obsidian-pc.example.net:8443"), true, "the address Quick Connect gave the client");
  assert.equal(lan.originAllowed("https://obsidian-pc.example.net:8443"), true);
  assert.equal(lan.hostAllowed("evil.example.com"), false);
  assert.equal(make("[2001:db8::5]").hostAllowed("[2001:db8::5]:4816"), true);
  assert.equal(make("obsidian-pc.example.net", "localhost").hostAllowed("obsidian-pc.example.net"), false, "localhost mode answers loopback names only");
  assert.equal(make("").hostAllowed("obsidian-pc.example.net"), false);
});

test("review: a synced timestamp-only change from another device does not trigger another automatic stamp", async () => {
  const persisted = settings(["Notes"]);
  persisted.personalNotes.tagging = { enabled: true, folders: ["Notes"], timestamps: true, uniqueIds: false, supersession: false, automaticTimestamps: true };
  const app = makeApp({ "Notes/Garden.md": "# Garden\n" }, { persisted });
  const plugin = await loadPlugin(app);
  try {
    app.layoutReady();
    await indexed(plugin);
    app.edit("Notes/Garden.md", "# Garden\nPlant tomatoes.\n"); // a real user edit on this device
    await delay(1100);
    const stamped = app.store.get("Notes/Garden.md");
    assert.match(stamped, /updated_at: "(.+)"/, "the user edit is stamped");
    const writes = app.writes.length;

    // The other device (same synced settings) stamps the synced edit with its own clock; sync brings it back here.
    const fromOtherDevice = stamped.replace(/updated_at: "[^"]+"/, 'updated_at: "2031-01-01T00:00:00.000Z"');
    app.edit("Notes/Garden.md", fromOtherDevice);
    await delay(1100);
    assert.equal(app.writes.length, writes, "a change to updated_at alone is not a content change: no new stamp, no cross-device loop");
    assert.equal(app.store.get("Notes/Garden.md"), fromOtherDevice);

    app.edit("Notes/Garden.md", fromOtherDevice + "More.\n"); // a real edit is still stamped
    await delay(1100);
    assert.equal(app.writes.length, writes + 1);
  } finally { unloadPlugin(plugin); }
});

const delay = (ms) => new Promise((done) => setTimeout(done, ms));

function freePort() {
  return new Promise((done) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => done(port)); }); });
}

function get(port, path, token) {
  return new Promise((done) => {
    const req = http.request({ host: "127.0.0.1", port, path, agent: false, headers: { Authorization: `Bearer ${token}` } }, (res) => {
      let data = ""; res.setEncoding("utf8"); res.on("data", (c) => (data += c)); res.on("end", () => done({ status: res.statusCode, text: data }));
    });
    req.on("error", (e) => done({ status: 0, text: e.code }));
    req.end();
  });
}

const settings = (includeFolders, excludeFolders = []) => ({
  activeProfile: "personal",
  personalNotes: {
    includeFolders, excludeFolders, importFolders: [], importReportPaths: [],
    tagging: { enabled: false, folders: [], timestamps: false, uniqueIds: false, supersession: false, automaticTimestamps: false },
    connection: { bindMode: "localhost", advertisedBaseUrl: "", autoStart: false, acceptOlderMcp: true },
  },
});

/**
 * Desktop Obsidian (1.15) resolves `vault.getAbstractFileByPath("file:<path>")`
 * outside the vault: a miss in the vault's file map falls through to the
 * external-file manager, which returns a TFile for any existing file on disk,
 * and the adapter reads it by stripping "file:". Emulate exactly that.
 */
function withObsidianExternalFiles(app) {
  const inVault = app.vault.getAbstractFileByPath;
  const read = app.vault.cachedRead;
  app.vault.getAbstractFileByPath = (p) => {
    const hit = inVault(p);
    if (hit || !p.startsWith("file:")) return hit;
    const real = resolve(p.slice("file:".length));
    let size;
    try { size = readFileSync(real).length; } catch { return null; }
    const name = real.slice(Math.max(real.lastIndexOf("/"), real.lastIndexOf("\\")) + 1);
    return { path: `file:${real}`, name, basename: name.replace(/\.md$/, ""), extension: name.slice(name.lastIndexOf(".") + 1), stat: { ctime: 1, mtime: 1, size } };
  };
  app.vault.cachedRead = async (f) => (f.path.startsWith("file:") ? readFileSync(f.path.slice("file:".length), "utf8") : read(f));
  return app;
}

test("review: a `file:` path cannot read a Markdown file outside the vault or inside an excluded folder", async () => {
  const outside = mkdtempSync(join(tmpdir(), "kosmos-outside-"));
  const secretFile = join(outside, "secret.md");
  writeFileSync(secretFile, "OUTSIDE-THE-VAULT secret\n");
  const port = await freePort();
  const app = withObsidianExternalFiles(makeApp(
    { "Notes/Garden.md": "garden\n", "Private/Diary.md": "PRIVATE diary\n" },
    { persisted: { ...settings(["/"], ["Private"]), agentPort: port } },
  ));
  const base = app.vault.adapter.getBasePath();
  mkdirSync(join(base, "Private"), { recursive: true });
  writeFileSync(join(base, "Private", "Diary.md"), "PRIVATE diary\n"); // the excluded note on disk
  const plugin = await loadPlugin(app);
  try {
    app.layoutReady();
    await indexed(plugin);
    await plugin.connect();
    const token = plugin.connectionToken();
    assert.equal((await get(port, "/note?path=Notes/Garden.md", token)).status, 200, "an ordinary shared note is readable");
    for (const target of [secretFile, join(base, "Private", "Diary.md")]) {
      const probe = `file:${target.replace(/\\/g, "/")}`;
      assert.ok(app.vault.getAbstractFileByPath(probe), "the emulated host resolves the probe");
      const r = await get(port, `/note?path=${encodeURIComponent(probe)}`, token);
      assert.notEqual(r.status, 200, `${probe} must not be readable`);
      assert.ok(!r.text.includes("OUTSIDE-THE-VAULT") && !r.text.includes("PRIVATE diary"), r.text);
    }
  } finally { unloadPlugin(plugin); }
});
