/**
 * The existing profile after the 0.9.0 Personal Notes work, plus plugin wiring.
 *
 * The revised patch's in-server Personal branches (folder rule in canRead,
 * enable/disable rewriting defaultSensitivity, full-text qSearch, paged qNote
 * with embedded truncation prose, regex attachment refs, overview block) were
 * retired: the Personal profile is served by its own query service (see
 * personal-server.test.mjs). These cases pin that the existing profile is back
 * to its 0.8.4 behavior. It runs the real engine graph.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { buildGraph, stripFrontmatter } from "../dist/kosmos-core.mjs";
import { KosmosAgentServer, LATEST_MCP_PROTOCOL_VERSION, MAX_NOTE_CONTENT_CHARS, migrateAgentSettings } from "../dist/kosmos-agent-server.mjs";
import * as serverModule from "../dist/kosmos-agent-server.mjs";

const FILES = [
  { relativePath: "AGENT-API.md", content: "Connection guide with a token in it." },
  { relativePath: "Import/Keep/Shopping list.md", content: "- [ ] olive oil\n- [ ] bread\n\n![[receipt.png]]" },
  { relativePath: "Import/OneNote/Plumber.md", content: "---\nonenote-id: abc123\ntags:\n  - home\n---\nInvoice 1048 from the plumber. See [[Quote.pdf]]." },
  { relativePath: "Journal/Private.md", content: "Private thought about the plumber." },
  { relativePath: "Import/Sealed.md", content: "---\ngkx_version: 2.3\nsensitivity: secret\n---\nSealed plumber note." },
];

function fixture(files = FILES, folders = ["Import", "Import/Keep", "Import/OneNote", "Journal"]) {
  const graph = buildGraph(files, folders, undefined, { defaultSensitivity: "internal" });
  const bodies = new Map(files.map((f) => [f.relativePath, stripFrontmatter(f.content)]));
  return {
    getGraph: async () => graph,
    getNoteContent: async (p) => bodies.get(p) ?? null,
    getIndexedBody: (p, g) => (g === graph ? bodies.get(p) ?? null : null),
    vaultName: () => "PersonalVault",
    lanAddresses: () => [],
  };
}
const existing = () => ({ ...migrateAgentSettings({}), defaultSensitivity: "internal" });
const paths = (result) => result.results.map((n) => n.path).sort();

test("the patch's sensitivity-rewriting switches are gone", () => {
  for (const name of ["enablePersonalNotes", "disablePersonalNotes", "PERSONAL_NOTES_UNLABELED_SENSITIVITY", "PERSONAL_NOTES_NEVER_SHARED", "PERSONAL_NOTES_CONTENT_RULE"]) {
    assert.equal(name in serverModule, false, `${name} must not be exported`);
  }
  const s = migrateAgentSettings({});
  for (const key of ["personalNotesEnabled", "personalNotesFolders", "personalNotesPriorDefaultSensitivity", "personalNotesStampImports"]) assert.equal(key in s, false, key);
});

test("existing profile: the 0.8.4 sensitivity rule alone decides what is readable", async () => {
  const server = new KosmosAgentServer(http, existing(), fixture());
  assert.deepEqual(paths(await server.qSearch("")), ["AGENT-API.md", "Import/Keep/Shopping list.md", "Import/OneNote/Plumber.md", "Journal/Private.md"]);
  assert.deepEqual(await server.qNote({ path: "Import/Sealed.md" }), await server.qNote({ path: "Absent.md" }));
  const plumber = await server.qSearch("plumber");
  assert.match(plumber.method, /^lexical/, "search is the governed title/alias/tag/path search");
  assert.equal(plumber.results.some((n) => "snippet" in n), false);
});

test("existing profile: get_note returns the 0.8.4 shape with the legacy truncation marker", async () => {
  const server = new KosmosAgentServer(http, existing(), fixture());
  const note = await server.qNote({ path: "Import/Keep/Shopping list.md" });
  assert.equal(note.content, "- [ ] olive oil\n- [ ] bread\n\n![[receipt.png]]");
  for (const key of ["contentHash", "attachments", "nextOffset", "contentOffset", "contentTotalChars", "truncated"]) assert.equal(key in note, false, key);

  const big = "a".repeat(MAX_NOTE_CONTENT_CHARS) + "b".repeat(50);
  const long = new KosmosAgentServer(http, existing(), fixture([{ relativePath: "Import/Big.md", content: big }], ["Import"]));
  const first = await long.qNote({ path: "Import/Big.md" });
  assert.equal(first.content, "a".repeat(MAX_NOTE_CONTENT_CHARS) + `\n\n…[truncated: note exceeds ${MAX_NOTE_CONTENT_CHARS} characters]`);
  await assert.rejects(long.callTool("get_note", { path: "Import/Big.md", offset: 5 }), /Unexpected argument: offset/, "the patch's offset argument is not part of the existing contract");
});

test("existing profile: tool text and overview carry no Personal additions", async () => {
  const server = new KosmosAgentServer(http, existing(), fixture());
  assert.equal("personalNotes" in await server.qOverview(), false);
  const tools = server.toolDefs();
  assert.match(tools.find((t) => t.name === "search_notes").description, /^Lexical search/);
  assert.deepEqual(Object.keys(tools.find((t) => t.name === "get_note").inputSchema.properties).sort(), ["agent_name", "path", "title", "uid"]);
});

test("plugin wiring is present in source", async () => {
  const read = (p) => readFile(new URL(p, import.meta.url), "utf8");
  const main = await read("../src/plugin/main.ts");
  for (const id of ["search-my-notes", "add-notes", "connect-my-ai", "note-supersedes"]) assert.ok(main.includes(`id: "${id}"`), `main.ts is missing the ${id} command`);
  assert.equal(main.split('if (this.agentSettings.activeProfile === "personal") return;').length - 1, 2,
    "both legacy timestamp paths must stand down while the Personal profile is active");
  assert.match(main, /async setActiveProfile\(profile: ActiveProfile\)/);
  assert.doesNotMatch(main, /defaultSensitivity\s*=/, "switching profiles never writes defaultSensitivity");
  assert.match(await read("../src/plugin/gkx-migration.ts"), /onlyFolders\?: readonly string\[\]/, "the GKX workflow must accept a folder scope");
  const modal = await read("../src/ui/connect-ai-modal.ts");
  assert.match(modal, /this\.host\.mcpProtocols\(\)/, "the Connect window must show the protocol revisions the server actually advertises");
  assert.doesNotMatch(modal, /"\d{4}-\d{2}-\d{2}"/, "no hard-coded protocol revision in the Connect window");
});
