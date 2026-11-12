/**
 * Personal Notes through the Agent API (0.9.0): settings, folder access rule,
 * full-text search, note paging, attachment references, overview block.
 *
 * Follows the fixture pattern of test/agent-api.test.mjs. It runs the real
 * engine graph, so it also proves that plain notes and Importer-style notes
 * are readable in Personal Notes mode.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { buildGraph, stripFrontmatter } from "../dist/kosmos-core.mjs";
import { FullTextIndex } from "../dist/kosmos-personal-notes.mjs";
import {
  AGENT_SETTINGS_SCHEMA,
  KosmosAgentServer,
  LATEST_MCP_PROTOCOL_VERSION,
  MAX_NOTE_CONTENT_CHARS,
  disablePersonalNotes,
  enablePersonalNotes,
  migrateAgentSettings,
} from "../dist/kosmos-agent-server.mjs";

const FILES = [
  // The generated Agent API guide at the vault root holds the access token.
  { relativePath: "AGENT-API.md", content: "Connection guide with a token in it." },
  // A plain note: no frontmatter at all.
  { relativePath: "Import/Keep/Shopping list.md", content: "- [ ] olive oil\n- [ ] bread\n\n![[receipt.png]]" },
  // The kind of frontmatter the Obsidian Importer writes. Not GKX.
  { relativePath: "Import/OneNote/Plumber.md", content: "---\nonenote-id: abc123\ntags:\n  - home\n---\nInvoice 1048 from the plumber. See [[Quote.pdf]]." },
  // Outside the folders the user shares.
  { relativePath: "Journal/Private.md", content: "Private thought about the plumber." },
  // Inside a shared folder but explicitly labeled secret.
  { relativePath: "Import/Sealed.md", content: "---\ngkx_version: 2.3\nsensitivity: secret\n---\nSealed plumber note." },
];
const FOLDERS = ["Import", "Import/Keep", "Import/OneNote", "Journal"];

function fixture(files = FILES, folders = FOLDERS) {
  const graph = buildGraph(files, folders, undefined, { defaultSensitivity: "internal" });
  const bodies = new Map(files.map((f) => [f.relativePath, stripFrontmatter(f.content)]));
  let index = null;
  return {
    getGraph: async () => graph,
    getNoteContent: async (p) => bodies.get(p) ?? null,
    getIndexedBody: (p, g) => (g === graph ? bodies.get(p) ?? null : null),
    getTextIndex: (g) => {
      if (g !== graph) return null;
      index ??= new FullTextIndex(graph.nodes.filter((n) => n.kind === "file").map((n) => ({
        path: n.path, title: n.label, aliases: n.aliases, tags: n.tags, body: bodies.get(n.path) ?? "",
      })));
      return index;
    },
    vaultName: () => "PersonalVault",
    lanAddresses: () => [],
  };
}

/** Governed defaults, then the same switch the UI uses. */
function personalSettings(overrides = {}) {
  const s = { ...migrateAgentSettings({}), agentEnabled: true, agentPort: 0, agentToken: "test-token-1234567890" };
  enablePersonalNotes(s);
  return Object.assign(s, { personalNotesFolders: ["Import"] }, overrides);
}
const paths = (result) => result.results.map((n) => n.path).sort();

test("settings: new fields default closed, migrate safely, and bump the schema", () => {
  assert.equal(AGENT_SETTINGS_SCHEMA, 10);
  const fresh = migrateAgentSettings({});
  assert.equal(fresh.personalNotesEnabled, false);
  assert.deepEqual(fresh.personalNotesFolders, []);
  assert.deepEqual(fresh.personalNotesExcludedFolders, []);
  assert.deepEqual(fresh.personalNotesImportFolders, ["Import"]);
  assert.equal(fresh.personalNotesPriorDefaultSensitivity, "");
  assert.equal(fresh.defaultSensitivity, "secret", "the governed default is untouched");
  assert.equal(fresh.personalNotesStampImports, false, "imported notes are not stamped unless the user opts in");
  assert.equal(fresh.agentLegacyMcp, true, "real installs answer legacy MCP clients by default");
  assert.equal(migrateAgentSettings({ agentLegacyMcp: false }).agentLegacyMcp, false);

  const dirty = migrateAgentSettings({
    personalNotesEnabled: "yes", personalNotesFolders: ["Import/", "../x", 7, "import"],
    personalNotesExcludedFolders: "Journal", personalNotesImportFolders: [], personalNotesPriorDefaultSensitivity: "bogus",
  });
  assert.equal(dirty.personalNotesEnabled, false, "only literal true turns the mode on");
  assert.deepEqual(dirty.personalNotesFolders, ["import"], "invalid entries are rejected, not repaired; case is not folded (0.9.0 scope rules)");
  assert.deepEqual(dirty.personalNotesExcludedFolders, []);
  assert.deepEqual(dirty.personalNotesImportFolders, ["Import"], "an empty list falls back to the default folder");
  assert.equal(dirty.personalNotesPriorDefaultSensitivity, "");
});

test("enable and disable are reversible and never raise exposure of labeled notes", () => {
  const s = migrateAgentSettings({});
  enablePersonalNotes(s);
  assert.equal(s.personalNotesEnabled, true);
  assert.equal(s.defaultSensitivity, "internal");
  assert.equal(s.personalNotesPriorDefaultSensitivity, "secret");
  enablePersonalNotes(s); // idempotent: must not overwrite the remembered value
  assert.equal(s.personalNotesPriorDefaultSensitivity, "secret");
  assert.deepEqual(s.personalNotesFolders, [], "turning the mode on shares nothing by itself");
  disablePersonalNotes(s);
  assert.equal(s.personalNotesEnabled, false);
  assert.equal(s.defaultSensitivity, "secret");
  assert.equal(s.personalNotesPriorDefaultSensitivity, "");

  const open = migrateAgentSettings({ defaultSensitivity: "public" });
  enablePersonalNotes(open);
  assert.equal(open.defaultSensitivity, "public", "a default already at or below internal is left alone");
});

test("access rule: only chosen folders are readable, exclusions win, labels still apply", async () => {
  const off = new KosmosAgentServer(http, { ...migrateAgentSettings({}), defaultSensitivity: "internal" }, fixture());
  assert.deepEqual(paths(await off.qSearch("")), ["AGENT-API.md", "Import/Keep/Shopping list.md", "Import/OneNote/Plumber.md", "Journal/Private.md"],
    "with the mode off, behavior is exactly the pre-0.9.0 sensitivity rule");

  const none = new KosmosAgentServer(http, personalSettings({ personalNotesFolders: [] }), fixture());
  assert.equal((await none.qSearch("")).total, 0, "an empty folder list reads nothing");

  const scoped = new KosmosAgentServer(http, personalSettings(), fixture());
  assert.deepEqual(paths(await scoped.qSearch("")), ["Import/Keep/Shopping list.md", "Import/OneNote/Plumber.md"],
    "a plain note and an Importer-style note are readable; the secret note and the out-of-folder note are not");
  assert.deepEqual(await scoped.qNote({ path: "Journal/Private.md" }), await scoped.qNote({ path: "Absent.md" }),
    "a note outside the folders is indistinguishable from a missing note");
  assert.deepEqual(await scoped.qNote({ path: "Import/Sealed.md" }), await scoped.qNote({ path: "Absent.md" }));

  const excluded = new KosmosAgentServer(http, personalSettings({ personalNotesFolders: ["/"], personalNotesExcludedFolders: ["Import/OneNote"] }), fixture());
  assert.deepEqual(paths(await excluded.qSearch("")), ["Import/Keep/Shopping list.md", "Journal/Private.md"],
    "the whole vault minus an excluded folder; the token guide at the root is never shared in this mode");
});

test("search: full text with snippets, never matching or counting unreadable notes", async () => {
  const server = new KosmosAgentServer(http, personalSettings(), {
    ...fixture(), getNoteContent: async () => { throw new Error("search must not read the vault"); },
  });
  const plumber = await server.qSearch("plumber");
  assert.deepEqual(paths(plumber), ["Import/OneNote/Plumber.md"]);
  assert.equal(plumber.total, 1, "the private and the sealed plumber notes are not counted");
  assert.match(plumber.method, /^full text/);
  assert.equal(plumber.bodySearch.coverage, "full");
  assert.match(plumber.results[0].snippet, /Invoice 1048 from the plumber/);
  assert.ok(plumber.results[0].matchedIn.includes("body"));

  const oil = await server.callTool("search_notes", { query: '"olive oil"' });
  assert.deepEqual(paths(oil), ["Import/Keep/Shopping list.md"]);
  assert.equal((await server.qSearch("olive tractor")).total, 0, "every term is required");

  const legacy = await server.qSearch("plumber", { body: false });
  assert.match(legacy.method, /^lexical/, "body:false keeps the pre-0.9.0 title/alias/tag/path search");
  assert.equal(legacy.results.some((n) => "snippet" in n), false);

  const offServer = new KosmosAgentServer(http, { ...migrateAgentSettings({}), defaultSensitivity: "internal" }, fixture());
  assert.match((await offServer.qSearch("plumber")).method, /^lexical/, "with the mode off, search is unchanged");
});

test("get_note: attachment references and paging for long notes", async () => {
  const server = new KosmosAgentServer(http, personalSettings(), fixture());
  const note = await server.qNote({ path: "Import/Keep/Shopping list.md" });
  assert.deepEqual(note.attachments, [{ target: "receipt.png", kind: "embed" }]);
  assert.equal(note.truncated, false);
  assert.equal(note.nextOffset, null);
  assert.equal(note.contentOffset, 0);
  assert.equal(note.contentTotalChars, note.content.length);
  assert.match(note.contentHash, /^[0-9a-f]{64}$/);
  assert.equal((await server.qNote({ path: "Import/Keep/Shopping list.md", expected_hash: note.contentHash })).error, undefined);
  const changed = await server.qNote({ path: "Import/Keep/Shopping list.md", expected_hash: "0".repeat(64) });
  assert.equal(changed.error, "note_changed", "a stale hash is refused instead of mixing two versions");
  assert.equal(changed.contentHash, note.contentHash);
  assert.deepEqual((await server.qNote({ path: "Import/OneNote/Plumber.md" })).attachments, [{ target: "Quote.pdf", kind: "link" }]);

  const big = "a".repeat(MAX_NOTE_CONTENT_CHARS) + "b".repeat(5000);
  const files = [{ relativePath: "Import/Big.md", content: big }];
  const long = new KosmosAgentServer(http, personalSettings(), fixture(files, ["Import"]));
  const first = await long.qNote({ path: "Import/Big.md" });
  assert.equal(first.truncated, true);
  assert.equal(first.nextOffset, MAX_NOTE_CONTENT_CHARS);
  assert.equal(first.contentTotalChars, big.length);
  assert.match(first.content, /truncated/);
  const second = await long.callTool("get_note", { path: "Import/Big.md", offset: first.nextOffset, expected_hash: first.contentHash });
  assert.equal(second.content, "b".repeat(5000));
  assert.equal(second.contentOffset, MAX_NOTE_CONTENT_CHARS);
  assert.equal(second.truncated, false);
  assert.equal(second.nextOffset, null);
  await assert.rejects(long.callTool("get_note", { path: "Import/Big.md", offset: -1 }), /offset must be an integer/);
  await assert.rejects(long.callTool("get_note", { path: "Import/Big.md", offset: "0" }), /offset must be an integer/);
  await assert.rejects(long.callTool("get_note", { path: "Import/Big.md", expected_hash: 5 }), /expected_hash must be a string/);
});

test("overview and tool descriptions tell the assistant what it is connected to", async () => {
  const server = new KosmosAgentServer(http, personalSettings(), fixture());
  const overview = await server.qOverview();
  assert.equal(overview.personalNotes.enabled, true);
  assert.equal(overview.personalNotes.readableNotes, 2);
  assert.deepEqual(overview.personalNotes.folders, ["Import"]);
  assert.match(overview.personalNotes.hostedBy, /Obsidian/);
  assert.match(overview.personalNotes.guidance, /not .*instructions/i);

  const tools = server.toolDefs();
  const getNote = tools.find((t) => t.name === "get_note");
  assert.equal(getNote.inputSchema.properties.offset.type, "integer");
  assert.match(getNote.description, /nextOffset/);
  assert.match(tools.find((t) => t.name === "search_notes").description, /Full text search/);

  const off = new KosmosAgentServer(http, { ...migrateAgentSettings({}), defaultSensitivity: "internal" }, fixture());
  assert.deepEqual((await off.qOverview()).personalNotes, { enabled: false });
  assert.match(off.toolDefs().find((t) => t.name === "search_notes").description, /^Lexical search/, "governed tool text is unchanged");
});

test("plugin wiring is present in source", async () => {
  const read = (p) => readFile(new URL(p, import.meta.url), "utf8");
  const main = await read("../src/plugin/main.ts");
  for (const id of ["search-my-notes", "add-notes", "connect-my-ai", "note-supersedes"]) assert.ok(main.includes(`id: "${id}"`), `main.ts is missing the ${id} command`);
  assert.equal(main.split("personalNotesEnabled && !this.agentSettings.personalNotesStampImports && isUnderAnyFolder(").length - 1, 2,
    "both stamping paths must skip imported notes unless the user opted in");
  assert.match(await read("../src/plugin/gkx-migration.ts"), /onlyFolders\?: readonly string\[\]/, "the GKX workflow must accept a folder scope");
  const modal = await read("../src/ui/connect-ai-modal.ts");
  assert.ok(modal.includes(`CONNECT_MCP_PROTOCOL_VERSION = "${LATEST_MCP_PROTOCOL_VERSION}"`), "the Connect window must offer the protocol version the server speaks");
});
