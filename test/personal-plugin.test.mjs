/**
 * Personal Notes plugin wiring (0.9.0): the real plugin over an in-memory
 * Obsidian vault. Acceptance rows S01, S03 (plugin side), T01, T03, T05, T08,
 * Q03 (worker lifecycle), R02 (attachment resolution), N01, N04, B01, B03.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { posix } from "node:path";
import { resolveObjectURL } from "node:buffer";
import { delay, indexed, loadPlugin, makeApp, mod, testYaml, unloadPlugin, workers } from "./helpers/plugin-harness.mjs";

const { buildNoteMeta, isPhysicallyContained, strictYaml, PersonalDeviceState, deviceNamespace, notices } = mod;
const parse = strictYaml(testYaml);

function freePort() {
  return new Promise((resolve) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
}

function get(port, path, token) {
  return new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port, path, agent: false, headers: token ? { Authorization: `Bearer ${token}` } : {} }, (res) => {
      let data = ""; res.setEncoding("utf8"); res.on("data", (c) => (data += c)); res.on("end", () => resolve({ status: res.statusCode, text: data, json: () => JSON.parse(data) }));
    });
    req.on("error", (e) => resolve({ status: 0, error: e.code }));
    req.end();
  });
}

const PLAIN = "# Garden plan\nPlant tomatoes near the fence.\n";
const IMPORTED = "---\ncreated: 2024-03-01T09:00:00Z\nsource: onenote\ntags: [kitchen]\n---\nRecipe for lemon cake.\r\n![[cake.png]]\r\n";
const FIXTURE = {
  "Notes/Garden.md": PLAIN,
  "Notes/Cake.md": IMPORTED,
  "Notes/cake.png": "PNG",
  "Private/Diary.md": "Private diary tomatoes entry\n",
  "Imports/Keep.md": "Keep import tomatoes\n",
  "AGENT-API.md": "guide with tomatoes\n",
};
const personalSettings = (overrides = {}) => ({
  activeProfile: "personal",
  personalNotes: {
    includeFolders: ["Notes"], excludeFolders: [], importFolders: ["Imports"], importReportPaths: [],
    tagging: { enabled: false, folders: [], timestamps: false, uniqueIds: false, supersession: false, automaticTimestamps: false },
    connection: { bindMode: "localhost", advertisedBaseUrl: "", autoStart: false, acceptOlderMcp: true },
    ...overrides,
  },
});

/* ---------------------------------------------------------- source / meta */

const resolveIn = (paths) => (linkpath) => {
  const hit = paths.find((p) => p === linkpath || p === `${linkpath}.md` || p.endsWith(`/${linkpath}`) || p.endsWith(`/${linkpath}.md`));
  return hit ? { path: hit, extension: hit.slice(hit.lastIndexOf(".") + 1) } : null;
};

test("S01: metadata cache entry → PersonalNoteMeta for plain, Importer, partial-GKX and broken notes", () => {
  const paths = ["Notes/B.md", "Notes/pic.png"];
  const meta = (path, raw, cache = null, p = parse) => buildNoteMeta({ path, raw, cache, parse: p, resolveLinkpath: resolveIn(paths) });

  const plain = meta("Notes/Plain note.md", "Just text #idea\n", { tags: [{ tag: "#idea" }], links: [{ link: "B" }, { link: "Nowhere" }], embeds: [{ link: "pic.png" }, { link: "gone.png" }] });
  assert.deepEqual(plain, {
    title: "Plain note", aliases: [], tags: ["idea"], supersedes: [], supersededBy: [], links: ["Notes/B.md"],
    attachments: [{ target: "pic.png", kind: "embed", path: "Notes/pic.png" }, { target: "gone.png", kind: "embed", path: null }],
  });
  assert.equal("authoredSensitivity" in plain, false, "absent sensitivity stays absent");

  const imported = meta("Notes/Cake.md", IMPORTED);
  assert.deepEqual(imported.tags, ["kitchen"]);
  assert.equal(imported.createdAt, undefined, "Importer's `created` is a source property, not created_at");
  assert.equal(imported.frontmatterError, undefined);

  const partial = meta("Notes/New.md", "---\nuid: 019a72b0-0000-7000-8000-000000000001\ncreated_at: 2026-11-12T10:00:00Z\nupdated_at: \"2026-11-12T10:05:00.000Z\"\nsupersedes:\n  - \"[[Plans/Old]]\"\nsuperseded_by: \"[[Plans/Newer]]\"\ntitle: Shown title\naliases: [Other name]\n---\nbody\n");
  assert.equal(partial.uid, "019a72b0-0000-7000-8000-000000000001");
  assert.equal(partial.createdAt, "2026-11-12T10:00:00Z", "authored text exactly as written, no Date coercion");
  assert.equal(partial.updatedAt, "2026-11-12T10:05:00.000Z");
  assert.deepEqual(partial.supersedes, ["[[Plans/Old]]"]);
  assert.deepEqual(partial.supersededBy, ["[[Plans/Newer]]"]);
  assert.equal(partial.title, "Shown title");
  assert.deepEqual(partial.aliases, ["Other name"]);

  const gkx22 = meta("Notes/G.md", "---\ngkx_version: \"2.2\"\ntimestamp: 2025-01-01T00:00:00Z\n---\nx");
  assert.equal(gkx22.createdAt, "2025-01-01T00:00:00Z");

  assert.equal(meta("Notes/S.md", "---\nsensitivity: secret\n---\nx").authoredSensitivity, "secret");
  assert.equal(meta("Notes/M.md", "---\nsensitivity:\n  level: internal\n---\nx", null, () => ({ sensitivity: { level: "internal" } })).authoredSensitivity, "internal");
  assert.equal(meta("Notes/N.md", "---\nsensitivity:\n  - a\n---\nx", null, () => ({ sensitivity: ["a"] })).authoredSensitivity, "[\"a\"]", "a malformed authored label is kept (and fails closed in policy)");

  const broken = meta("Notes/Broken.md", "---\ntitle: x\nsensitivity: !!broken\n---\nbody");
  assert.equal(broken.frontmatterError, true);
  assert.equal(meta("Notes/Dup.md", "---\nsensitivity: public\nsensitivity: secret\n---\nx").frontmatterError, true, "duplicate keys are a broken block");
  assert.equal(meta("Notes/Rule.md", "---\nnot closed\n").frontmatterError, undefined, "an unclosed --- is not frontmatter (as in Obsidian)");
});

test("physical containment: symlink, junction, outside root, traversal and normal files", () => {
  const links = new Set(["/vault/Linked", "/vault/Notes/junction"]);
  const real = new Map([["/vault/Notes/escape.md", "/etc/escape.md"], ["/vault/Notes/sibling.md", "/vault-other/sibling.md"]]);
  const fs = {
    lstatSync: (p) => {
      if (p.includes("missing")) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return { isSymbolicLink: () => links.has(p) };
    },
    realpathSync: (p) => real.get(p) ?? p,
  };
  const ok = (p) => isPhysicallyContained("/vault", p, fs, posix);
  assert.equal(ok("Notes/a.md"), true);
  assert.equal(ok("Linked/a.md"), false, "reached through a symlinked folder");
  assert.equal(ok("Notes/junction/a.md"), false, "junctions are reported as symbolic links by lstat");
  assert.equal(ok("Notes/escape.md"), false, "real path outside the root");
  assert.equal(ok("Notes/sibling.md"), false, "a sibling folder with the root as a string prefix is outside");
  assert.equal(ok("Notes/../Private/a.md"), false);
  assert.equal(ok("Notes/missing.md"), true, "a file that does not exist cannot escape");
});

/* ----------------------------------------------------------- device-local */

test("device-local token and autostart: namespaced, secret storage first, never in data.json; synced settings do not start sharing", async () => {
  assert.notEqual(deviceNamespace("kosmos-oden", "/a/Vault"), deviceNamespace("kosmos-oden", "/b/Vault"), "same display name, different vault");
  assert.notEqual(deviceNamespace("kosmos-oden", "/a/Vault"), deviceNamespace("other-plugin", "/a/Vault"));

  const local = new Map();
  const noSecrets = new PersonalDeviceState({ loadLocalStorage: (k) => local.get(k) ?? null, saveLocalStorage: (k, v) => (v == null ? local.delete(k) : local.set(k, v)) }, "ns1");
  assert.equal(noSecrets.token(), "");
  noSecrets.setToken("fallback-token");
  assert.equal(noSecrets.token(), "fallback-token");
  assert.deepEqual([...local.keys()], ["kosmos-oden:ns1:personal-token"]);

  // A device that received synced settings (Personal profile, autoStart: true) but has no device-local state.
  const port = await freePort();
  const app = makeApp(FIXTURE, { persisted: { ...personalSettings({ connection: { bindMode: "localhost", advertisedBaseUrl: "", autoStart: true, acceptOlderMcp: true } }), agentPort: port, agentEnabled: true } });
  const plugin = await loadPlugin(app);
  try {
    app.layoutReady();
    assert.equal(plugin.agentApi.server, null, "nothing listens on a fresh device");
    assert.equal(plugin.connection().hasToken, false);
    assert.equal(app.secrets.size, 0, "no token is minted by loading");
    const status = await plugin.connect();
    assert.equal(status.state, "running");
    const ids = [...app.secrets.keys()];
    assert.equal(ids.length, 1);
    assert.match(ids[0], /^kosmos-oden-personal-token-[0-9a-f]{16}$/);
    const token = app.secrets.get(ids[0]);
    assert.equal(app.localStorage.size, 0, "with secret storage the token is not also put in localStorage");
    await plugin.setAutoStart(true);
    assert.ok([...app.localStorage.keys()].every((k) => k.startsWith("kosmos-oden:") && k.endsWith(":personal-autostart")));
    await plugin.saveAgentSettings();
    for (const saved of app.saved) assert.ok(!JSON.stringify(saved).includes(token), "the Personal token never reaches data.json");
    await plugin.writeAgentGuide();
    assert.ok(!app.adapterFiles.get("AGENT-API.md").includes(token), "the guide is a token-free template in the Personal profile");
  } finally { unloadPlugin(plugin); }

  // Same device later: its own token and autostart choice do start the connection.
  const again = await loadPlugin(Object.assign(app, { persisted: app.saved.at(-1) }));
  try {
    for (let i = 0; i < 50 && again.connection().state !== "running"; i++) await delay(10);
    assert.equal(again.connection().state, "running");
  } finally { unloadPlugin(again); }
});

/* --------------------------------------------------------------- settings */

test("updatePersonalNotes: any rejected folder saves nothing; a valid change saves and bumps the policy generation", async () => {
  const app = makeApp(FIXTURE, { persisted: personalSettings() });
  const plugin = await loadPlugin(app);
  try {
    const before = plugin.settings();
    const generation = plugin.personal.generation.current;
    const savedCount = app.saved.length;
    const bad = await plugin.updatePersonalNotes((d) => { d.includeFolders = ["Notes", "../Private", "/etc"]; d.tagging.folders = ["ok", "a/./b"]; });
    assert.equal(bad.saved, false);
    assert.deepEqual(bad.rejected.map((r) => r.value).sort(), ["../Private", "/etc", "a/./b"]);
    assert.deepEqual(plugin.settings(), before, "nothing changed");
    assert.equal(app.saved.length, savedCount, "nothing saved");
    assert.equal(plugin.personal.generation.current, generation);

    const good = await plugin.updatePersonalNotes((d) => { d.includeFolders = ["Notes", "Imports"]; });
    assert.deepEqual(good, { saved: true, rejected: [] });
    assert.deepEqual(plugin.settings().personalNotes.includeFolders, ["Notes", "Imports"]);
    assert.ok(plugin.personal.generation.current > generation, "in-flight agent responses are invalidated");
    assert.equal(plugin.personal.policy().generation, plugin.personal.generation.current);
    assert.equal(app.saved.at(-1).personalNotes.includeFolders.length, 2);
    const view = plugin.settings();
    view.personalNotes.includeFolders.push("Private");
    assert.deepEqual(plugin.settings().personalNotes.includeFolders, ["Notes", "Imports"], "settings() is a snapshot");
  } finally { unloadPlugin(plugin); }
});

/* ------------------------------------------------------------- connection */

test("N01/N04: connect resolves on real listening; port in use reported; rotate invalidates; disconnect stops serving", async () => {
  const port = await freePort();
  const app = makeApp(FIXTURE, { persisted: { ...personalSettings(), agentPort: port } });
  const plugin = await loadPlugin(app);
  const other = await loadPlugin(makeApp(FIXTURE, { persisted: { ...personalSettings(), agentPort: port } }));
  try {
    app.layoutReady();
    const status = await plugin.connect();
    assert.equal(status.state, "running");
    assert.equal(plugin.agentApi.server.listening, true, "resolved only once the socket is listening");
    assert.equal(plugin.agentApi.bindHost, "127.0.0.1");
    const token = plugin.connectionToken();
    assert.equal((await get(port, "/overview", token)).status, 200);

    const busy = await other.connect();
    assert.equal(busy.state, "error");
    assert.match(busy.error, /busy/);

    await plugin.rotateToken();
    assert.equal((await get(port, "/overview", token)).status, 401, "the old token stops working at once");
    const rotated = plugin.connectionToken();
    assert.notEqual(rotated, token);
    assert.equal((await get(port, "/overview", rotated)).status, 200);

    await plugin.disconnect();
    assert.equal(plugin.connection().state, "stopped");
    assert.equal(plugin.connection().hasToken, true, "disconnect keeps the token");
    assert.equal((await get(port, "/overview", rotated)).error, "ECONNREFUSED");
    assert.deepEqual(plugin.reachableAddresses().filter((a) => a === "0.0.0.0" || a.startsWith("127.")), []);
  } finally { unloadPlugin(plugin); unloadPlugin(other); }
});

test("testConnection: a real Streamable HTTP exchange succeeds, and a wrong token fails at authentication", async () => {
  const port = await freePort();
  const app = makeApp(FIXTURE, { persisted: { ...personalSettings(), agentPort: port } });
  const plugin = await loadPlugin(app);
  const stranger = await loadPlugin(makeApp(FIXTURE, { persisted: personalSettings() }));
  try {
    app.layoutReady();
    await indexed(plugin);
    await plugin.connect();
    const highlighted = [];
    const forward = plugin.agentApi.onTraversal;
    plugin.agentApi.onTraversal = (paths, ...rest) => { highlighted.push(...paths); forward(paths, ...rest); };
    const ok = await plugin.testConnection(`http://127.0.0.1:${port}`);
    assert.equal(ok.ok, true, JSON.stringify(ok.steps));
    assert.ok(highlighted.length > 0 && highlighted.every((p) => p.startsWith("Notes/")), `agent highlights stay inside the shared folder: ${highlighted}`);
    assert.deepEqual(ok.steps.map((s) => s.name), ["authenticate", "open", "list_tools", "search", "read"]);
    assert.equal(ok.protocolVersion, "2026-07-28");
    assert.equal(ok.transport, "streamable-http");
    assert.match(ok.steps[3].detail, /Notes\/Cake\.md/, "default canary: the first shared note");
    assert.ok(!JSON.stringify(ok).includes(plugin.connectionToken()), "results never contain the token");

    const chosen = await plugin.testConnection(`http://localhost:${port}/`, "Notes/Garden.md");
    assert.equal(chosen.ok, true, JSON.stringify(chosen.steps));

    stranger.connectionToken(); // a different device-local token
    const wrong = await stranger.testConnection(`http://127.0.0.1:${port}`);
    assert.equal(wrong.ok, false);
    assert.deepEqual(wrong.steps, [{ name: "authenticate", ok: false, detail: "The server refused the token (HTTP 401)." }]);
  } finally { unloadPlugin(plugin); unloadPlugin(stranger); }
});

/* ----------------------------------------------------------- T01 no-write */

test("T01: with tagging off, load + index + search + connect + agent reads + edits write nothing", async () => {
  const port = await freePort();
  const app = makeApp(FIXTURE, { persisted: { ...personalSettings(), agentPort: port } });
  const before = new Map(app.store);
  const plugin = await loadPlugin(app);
  try {
    app.layoutReady();
    await indexed(plugin);
    const local = await plugin.search("tomatoes");
    assert.deepEqual(local.hits.map((h) => h.path).sort(), ["AGENT-API.md", "Imports/Keep.md", "Notes/Garden.md", "Private/Diary.md"], "local-human search is vault-wide");
    assert.equal(plugin.sharedNoteCount(), 2);
    assert.equal(plugin.searchStatus().state, "ready");

    await plugin.connect();
    const token = plugin.connectionToken();
    const found = (await get(port, "/notes?query=tomatoes", token)).json();
    assert.deepEqual(found.results.map((r) => r.path), ["Notes/Garden.md"], "agents see only the shared folder");
    const cake = (await get(port, "/note?path=Notes/Cake.md", token)).json();
    assert.equal(cake.content, IMPORTED, "S01: Importer frontmatter note is read exactly");
    assert.deepEqual(cake.attachments, [{ target: "cake.png", kind: "embed", status: "available", path: "Notes/cake.png" }], "R02");
    assert.equal((await get(port, "/note?path=Private/Diary.md", token)).status, 404);

    app.edit("Notes/Garden.md", PLAIN + "More.\n"); // a user edit
    await delay(1100);
    await plugin.personal.corpus.whenIdle();
    assert.ok((await plugin.search("More")).hits.some((h) => h.path === "Notes/Garden.md"), "Q03: the edit is searchable");
    before.set("Notes/Garden.md", PLAIN + "More.\n");
    assert.deepEqual(app.writes, [], "no write API was called");
    assert.deepEqual(new Map(app.store), before, "every note is byte-identical");
    assert.deepEqual([...app.adapterFiles.keys()], []);
  } finally { unloadPlugin(plugin); }
});

/* ------------------------------------------------------------ tagging on */

test("T03/T05: frozen preview, only metadata writes with backups, stale preview skipped, no stamp loop", async () => {
  const app = makeApp(FIXTURE, { persisted: personalSettings({ tagging: { enabled: true, folders: ["Notes"], timestamps: true, uniqueIds: true, supersession: false, automaticTimestamps: true } }) });
  const plugin = await loadPlugin(app);
  try {
    app.layoutReady();
    await indexed(plugin);
    const first = await plugin.previewTagging();
    assert.deepEqual(first.notes.map((n) => n.path), ["Notes/Cake.md", "Notes/Garden.md"]);
    const again = await plugin.previewTagging();
    assert.equal(again.proposalTimeMs, first.proposalTimeMs, "re-preview keeps the frozen clock");
    assert.deepEqual(again.frozen, first.frozen, "and the allocated uids");
    assert.deepEqual(app.writes, [], "preview writes nothing");

    app.edit("Notes/Garden.md", PLAIN + "changed after preview\n");
    await delay(1100); // let the automatic stamper handle that user edit first
    const stampedGarden = app.store.get("Notes/Garden.md");
    assert.match(stampedGarden, /^---\ncreated_at: .+\nupdated_at: .+\n---\n/, "a real edit in a tagging folder gets timestamps");
    assert.ok(!/uid:/.test(stampedGarden), "automatic mode never writes a uid");
    app.writes.length = 0;

    const result = await plugin.applyTagging(again);
    assert.deepEqual(result.written.map((w) => w.path), ["Notes/Cake.md"]);
    assert.deepEqual(result.skipped.map((s) => [s.path, s.reason]), [["Notes/Garden.md", "changed"]], "stale preview is skipped, not overwritten");
    const cake = app.store.get("Notes/Cake.md");
    assert.ok(cake.endsWith("---\nRecipe for lemon cake.\r\n![[cake.png]]\r\n"), "body and line endings unchanged");
    assert.match(cake, /^---\ncreated: 2024-03-01T09:00:00Z\nsource: onenote\ntags: \[kitchen\]\n/, "Importer properties kept as written");
    assert.match(cake, new RegExp(`uid: "?${again.frozen["Notes/Cake.md"].uid}"?`));
    const backup = result.written[0].backupRef;
    assert.match(backup, /^\.gkx\/backup\/tagging-[^/]+\/files\/Notes\/Cake\.md\.bak$/);
    assert.equal(app.adapterFiles.get(backup), IMPORTED, "exact before-text");
    assert.ok([...app.adapterFiles.keys()].some((k) => /^\.gkx\/backup\/tagging-[^/]+\/manifest\.json$/.test(k)));

    const writesAfterApply = app.writes.filter((w) => w[0] === "vault.process").length;
    await delay(1100); // the apply's own modify event passes the automatic stamper
    assert.equal(app.writes.filter((w) => w[0] === "vault.process").length, writesAfterApply, "no stamp loop after the own write");
    assert.equal(app.store.get("Notes/Cake.md"), cake);
    assert.deepEqual(app.writes.filter((w) => !/^(Notes\/|\.gkx(\/|$))/.test(w[1])), [], "only tagging folders and backups are written");

    const rerun = await plugin.previewTagging();
    assert.ok(rerun.notes.find((n) => n.path === "Notes/Cake.md").changes.length === 0, "T05: unchanged content gives no new diff");
    await plugin.personal.corpus.whenIdle();
    assert.equal(plugin.personal.corpus.get("Notes/Cake.md").meta.uid, again.frozen["Notes/Cake.md"].uid, "T03: the uid is indexed");
  } finally { unloadPlugin(plugin); }
});

test("T08: automatic tagging is deferred for an import folder until Import finished", async () => {
  const app = makeApp(FIXTURE, { persisted: personalSettings({ tagging: { enabled: true, folders: ["Imports"], timestamps: true, uniqueIds: false, supersession: false, automaticTimestamps: true } }) });
  const plugin = await loadPlugin(app);
  try {
    app.layoutReady();
    await indexed(plugin);
    assert.deepEqual(plugin.importer(), { state: "unknown", version: null, tested: false }, "no plugin registry: guarded, no throw");
    assert.equal(plugin.openImporter("Imports"), false, "Importer unavailable: use the command palette");
    assert.deepEqual(plugin.pendingImportFolders(), ["Imports"]);
    assert.deepEqual(app.saved.at(-1).personalNotes.importState, { running: [], awaitingReview: ["Imports"] }, "persisted in (synced) settings");

    app.edit("Imports/Keep.md", "Keep import tomatoes, edited\n");
    app.edit("Imports/New.md", "Arrived during import\n");
    await delay(1100);
    assert.deepEqual(app.writes, [], "nothing stamped while the import is pending");

    await plugin.importFinished("Imports");
    assert.deepEqual(plugin.pendingImportFolders(), []);
    app.edit("Imports/Keep.md", "Keep import tomatoes, edited again\n");
    await delay(1100);
    assert.deepEqual(app.writes.map((w) => w[1]), ["Imports/Keep.md"], "after review, a real edit is stamped");

    app.plugins ={ manifests: { "obsidian-importer": { version: "3.1.17" } }, enabledPlugins: new Set(["obsidian-importer"]) };
    let ran = null;
    app.commands = { executeCommandById: (id) => { ran = id; return true; } };
    assert.deepEqual(plugin.importer(), { state: "enabled", version: "3.1.17", tested: true });
    assert.equal(plugin.openImporter("Imports/OneNote"), true);
    assert.equal(ran, "obsidian-importer:open-modal");
    app.commands = { executeCommandById: () => { throw new Error("boom"); } };
    assert.equal(plugin.openImporter("Imports/OneNote"), false, "a throwing command is reported as unavailable");
  } finally { unloadPlugin(plugin); }
});

test("supersedes preview: explicit target, frozen uid, cycle rejected", async () => {
  const app = makeApp({ "Notes/Old.md": "old plan\n", "Notes/New.md": "new plan\n", "Notes/Newer.md": "---\nsupersedes:\n  - \"[[New]]\"\n---\nnewer\n" },
    { persisted: personalSettings({ tagging: { enabled: true, folders: ["Notes"], timestamps: false, uniqueIds: true, supersession: true, automaticTimestamps: false } }) });
  const plugin = await loadPlugin(app);
  try {
    app.layoutReady();
    await indexed(plugin);
    const file = app.vault.getAbstractFileByPath("Notes/New.md");
    const { check, plan } = await plugin.previewSupersedes(file, "Old");
    assert.equal(check.ok, true);
    assert.equal(check.target, "Notes/Old.md");
    const change = plan.notes[0].changes.map((c) => c.key).sort();
    assert.deepEqual(change, ["supersedes", "uid"]);
    const again = await plugin.previewSupersedes(file, "Old");
    assert.deepEqual(again.plan.frozen, plan.frozen);
    const cycle = await plugin.previewSupersedes(file, "Newer");
    assert.equal(cycle.check.ok, false);
    assert.equal(cycle.check.reason, "cycle");
    assert.equal(cycle.plan, null);
    assert.deepEqual(app.writes, []);
  } finally { unloadPlugin(plugin); }
});

test("S04: switching profile stops the listener and drops the Personal runtime; switching back starts only by device rules", async () => {
  const port = await freePort();
  const app = makeApp(FIXTURE, { persisted: { ...personalSettings(), agentPort: port } });
  const plugin = await loadPlugin(app);
  try {
    app.layoutReady();
    await plugin.connect();
    const token = plugin.connectionToken();
    const runtime = plugin.personal;
    await plugin.setActiveProfile("existing");
    assert.equal(plugin.agentApi.server, null, "the Personal listener does not keep serving");
    assert.equal(plugin.agentApi.personal, null);
    assert.equal(runtime.search.status, "disposed");
    assert.equal((await get(port, "/overview", token)).error, "ECONNREFUSED");
    assert.equal(plugin.connection().state, "stopped");
    await plugin.setActiveProfile("personal");
    assert.equal(plugin.agentApi.server, null, "no autostart chosen on this device: stays stopped");
    assert.notEqual(plugin.personal, runtime, "a fresh runtime");
    assert.equal(plugin.agentApi.personal, plugin.personal.agentRuntime(() => ""));
  } finally { unloadPlugin(plugin); }
});

test("corpus: a metadata-only change (a link target appears) refreshes the record without a text change", async () => {
  const app = makeApp({ "Notes/A.md": "See [[Later]]\n" }, { persisted: personalSettings() });
  const plugin = await loadPlugin(app);
  try {
    app.layoutReady();
    await indexed(plugin);
    assert.deepEqual(plugin.personal.corpus.get("Notes/A.md").meta.links, []);
    app.edit("Notes/Later.md", "now exists\n");
    const resolved = app.handlers.metadata.find((h) => h.event === "resolve").callback;
    resolved(app.vault.getAbstractFileByPath("Notes/A.md"));
    await plugin.personal.corpus.flush();
    assert.deepEqual(plugin.personal.corpus.get("Notes/A.md").meta.links, ["Notes/Later.md"]);
    assert.deepEqual(app.writes, []);
  } finally { unloadPlugin(plugin); }
});

/* ---------------------------------------------------------------- lifecycle */

test("B01/B03: existing profile builds no Personal runtime; unload leaves no worker, Blob URL, timer, listener or server", async () => {
  const existing = await loadPlugin(makeApp(FIXTURE, { persisted: {} }));
  assert.equal(existing.personal, null, "the existing profile starts no corpus or worker");
  assert.equal(existing.agentApi.personal, null);
  unloadPlugin(existing);

  const port = await freePort();
  const app = makeApp(FIXTURE, { persisted: { ...personalSettings({ tagging: { enabled: true, folders: ["Notes"], timestamps: true, uniqueIds: false, supersession: false, automaticTimestamps: true } }), agentPort: port } });
  const plugin = await loadPlugin(app);
  app.layoutReady();
  await indexed(plugin);
  await plugin.connect();
  const runtime = plugin.personal;
  const worker = workers.at(-1);
  assert.ok(resolveObjectURL(worker.url), "the worker runs from a live Blob URL");
  let calls = 0;
  plugin.onSearchStatus(() => calls++);
  app.edit("Notes/Garden.md", "pending stamp\n"); // leaves an automatic-stamp timer pending
  assert.equal(plugin.autoStamps.size, 1);

  unloadPlugin(plugin);
  assert.equal(plugin.agentApi.server, null, "server stopped");
  assert.equal(plugin.agentApi.personal, null, "runtime removed from the server");
  assert.equal(plugin.personal, null);
  assert.equal(worker.terminated, true, "worker terminated");
  assert.equal(resolveObjectURL(worker.url), undefined, "Blob URL revoked");
  assert.equal(runtime.search.status, "disposed");
  assert.equal(plugin.autoStamps.size, 0, "automatic-stamp timers cleared");
  assert.equal(plugin.searchStatusListeners.size, 0);
  await delay(1000);
  assert.deepEqual(app.writes, [], "no write fires after unload");
  assert.equal(calls, 1, "one final status notification on detach, none after");
  assert.equal((await get(port, "/overview", "x")).error, "ECONNREFUSED");
  assert.ok(Array.isArray(notices));
});
