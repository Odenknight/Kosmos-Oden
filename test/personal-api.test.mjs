/**
 * Personal Notes read service (0.9.0), service level, over an in-memory vault:
 * acceptance rows S01, S03 (service layer), S04, R01, R02.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  PERSONAL_CONTENT_RULE,
  PERSONAL_TOOL_NAMES,
  PersonalError,
  personalToolDefs,
  validatePersonalArgs,
} from "../dist/kosmos-personal-notes.mjs";
import { makeService, makeVault } from "./helpers/personal-fixture.mjs";

const code = (c) => (e) => e instanceof PersonalError && e.code === c;
const sha = (s) => createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");

const IMPORTER_NOTE = "---\r\nonenote-id: abc123\r\ncreated: 2024-03-01\r\ntags:\r\n  - home\r\n---\r\nInvoice 1048 from the plumber. ![[receipt.png]]\r\n";
const FILES = {
  "Import/Keep/Shopping.md": "- [ ] olive oil\n- [ ] bread for the plumber",
  "Import/OneNote/Plumber.md": { raw: IMPORTER_NOTE, meta: { tags: ["home"], attachments: [
    { target: "receipt.png", kind: "embed", path: "Import/OneNote/receipt.png" },
    { target: "quote.pdf", kind: "link", path: "Import/OneNote/quote.pdf" },
    { target: "../../Journal/scan.png", kind: "embed", path: "Journal/scan.png" },
    { target: "nowhere.pdf", kind: "link", path: null },
    { target: "https://example.com/x.pdf", kind: "link", path: null },
  ] } },
  "Import/Sealed.md": { raw: "---\nsensitivity: secret\n---\nSealed plumber note.", meta: { authoredSensitivity: "secret" } },
  "Import/Typo.md": { raw: "---\nsensitivity: Secret\n---\nTypo plumber note.", meta: { authoredSensitivity: "Secret" } },
  "Import/Open.md": { raw: "---\nsensitivity: public\n---\nOpen plumber note.", meta: { authoredSensitivity: "public" } },
  "Import/Link.md": { raw: "symlinked plumber", symlinked: true },
  "Journal/Private.md": "Private thought about the plumber.",
  "AGENT-API.md": "token guide plumber",
};
const OTHERS = ["Import/OneNote/receipt.png", "Journal/scan.png"];

const setup = (scope = { includeFolders: ["Import"] }, opts) => {
  const vault = makeVault(FILES, { others: OTHERS });
  return { vault, ...makeService(vault, scope, opts) };
};

test("tool definitions: five tools, legacy-minimal shape, schemas agree with validation", () => {
  const defs = personalToolDefs();
  assert.deepEqual(defs.map((d) => d.name), [...PERSONAL_TOOL_NAMES]);
  assert.deepEqual([...PERSONAL_TOOL_NAMES], ["search_notes", "get_note", "get_related", "get_lineage", "vault_overview"]);
  for (const def of defs) {
    assert.equal(typeof def.name, "string");
    assert.ok(def.description.length > 20);
    assert.equal(def.inputSchema.type, "object");
    assert.equal(def.inputSchema.additionalProperties, false);
    for (const [key, prop] of Object.entries(def.inputSchema.properties)) {
      // A value the schema allows at its bound is accepted; one past the bound is rejected.
      const base = def.name === "search_notes" ? { query: "x" } : key === "path" || key === "uid" ? {} : { path: "A/b.md" };
      if (prop.type === "integer") {
        const extra = key === "offset_chars" ? { expected_hash: "a".repeat(64) } : {};
        assert.doesNotThrow(() => validatePersonalArgs(def.name, { ...base, ...extra, [key]: prop.minimum }, "mcp"), `${def.name}.${key} min`);
        assert.doesNotThrow(() => validatePersonalArgs(def.name, { ...base, ...extra, [key]: prop.maximum }, "mcp"), `${def.name}.${key} max`);
        assert.throws(() => validatePersonalArgs(def.name, { ...base, ...extra, [key]: prop.maximum + 1 }, "mcp"), code("invalid_argument"));
        assert.throws(() => validatePersonalArgs(def.name, { ...base, ...extra, [key]: prop.minimum - 1 }, "mcp"), code("invalid_argument"));
      } else {
        assert.equal(prop.type, "string");
        assert.throws(() => validatePersonalArgs(def.name, { ...base, [key]: "x".repeat(prop.maxLength + 1) }, "mcp"), code("invalid_argument"));
      }
    }
    for (const req of def.inputSchema.required ?? []) assert.throws(() => validatePersonalArgs(def.name, {}, "mcp"), new RegExp(req));
    assert.throws(() => validatePersonalArgs(def.name, { unexpected: 1 }, "mcp"), /unknown argument/);
  }
});

test("validation: hidden tools, malformed numbers and selectors are rejected for REST and MCP alike", () => {
  for (const hidden of ["export_graph", "get_assessment", "__proto__", "toString", undefined]) {
    assert.throws(() => validatePersonalArgs(hidden, {}, "mcp"), /unknown tool/);
  }
  const mcpBad = [
    ["get_note", { path: "A.md", offset_chars: 1.5, expected_hash: "a".repeat(64) }],
    ["get_note", { path: "A.md", offset_chars: -1 }],
    ["get_note", { path: "A.md", offset_chars: "0" }],
    ["get_note", { path: "A.md", limit_chars: 1 }],
    ["get_note", { path: "A.md", offset_chars: 10 }],
    ["get_note", { path: "A.md", expected_hash: "ABC" }],
    ["get_note", { path: "A.md", expected_hash: "A".repeat(64) }],
    ["get_note", {}],
    ["get_note", { path: "/etc/passwd" }],
    ["get_note", { path: "Notes/../Private/a.md" }],
    ["get_note", { path: 5 }],
    ["search_notes", { query: "  " }],
    ["search_notes", { query: "x", limit: true }],
    ["search_notes", { query: "x", limit: Number.NaN }],
    ["search_notes", { query: "x", limit: 1e21 }],
    ["get_related", { uid: "" }],
  ];
  for (const [tool, args] of mcpBad) assert.throws(() => validatePersonalArgs(tool, args, "mcp"), code("invalid_argument"), `${tool} ${JSON.stringify(args)}`);
  for (const value of ["-1", "1.0", "1e3", " 1", "01", "0x10", "", "+1", "１"]) {
    assert.throws(() => validatePersonalArgs("get_note", { path: "A.md", limit_chars: value }, "rest"), code("invalid_argument"), `REST ${JSON.stringify(value)}`);
  }
  assert.throws(() => validatePersonalArgs("get_note", { path: "A.md", limit_chars: 100 }, "rest"), /decimal/, "REST numbers arrive as strings");
  assert.deepEqual(validatePersonalArgs("get_note", { path: "A.md", limit_chars: "100" }, "rest").args, { path: "A.md", limit_chars: 100 });
  assert.deepEqual(validatePersonalArgs("vault_overview", undefined, "mcp"), { tool: "vault_overview", args: {} });
  assert.throws(() => validatePersonalArgs("vault_overview", [], "mcp"), /object/);
});

test("S01: a plain note and an Importer-frontmatter note are searchable and readable", async () => {
  const { service } = setup();
  const found = await service.call("search_notes", { query: "plumber" }, "mcp");
  assert.deepEqual(found.results.map((r) => r.path).sort(), ["Import/Keep/Shopping.md", "Import/OneNote/Plumber.md", "Import/Open.md"]);
  assert.equal(found.total, 3, "sealed (secret), typo (invalid label), symlinked, out-of-folder and guide notes are not counted");
  assert.equal(found.contract, "kosmos-personal-notes/1");
  const plain = await service.call("get_note", { path: "Import/Keep/Shopping.md" }, "mcp");
  assert.equal(plain.content, FILES["Import/Keep/Shopping.md"]);
  const imported = await service.call("get_note", { path: "Import/OneNote/Plumber.md" }, "mcp");
  assert.equal(imported.content, IMPORTER_NOTE, "frontmatter and CRLF included, byte for byte");
  assert.equal(imported.content_hash, sha(IMPORTER_NOTE));
});

test("S01: absent, valid and invalid authored sensitivity behave separately", async () => {
  const { service, diagnostics } = setup();
  assert.ok(await service.getNote({ path: "Import/Keep/Shopping.md" }), "absent label: readable");
  assert.ok(await service.getNote({ path: "Import/Open.md" }), "valid label within the ceiling: readable");
  await assert.rejects(service.getNote({ path: "Import/Sealed.md" }), code("not_found"), "valid label above the ceiling");
  await assert.rejects(service.getNote({ path: "Import/Typo.md" }), code("not_found"), "invalid label fails closed");
  assert.ok(diagnostics.some((d) => /Sealed\.md: labelled "secret"/.test(d)), "local explanation for the labelled note");
  assert.ok(diagnostics.some((d) => /Typo\.md: sensitivity label "Secret" is not a recognised value/.test(d)));
});

test("S03: missing and excluded notes are indistinguishable, and nothing is read for hidden paths", async () => {
  const { service, vault } = setup({ includeFolders: ["/"], excludeFolders: ["Journal"] });
  const outcome = async (args) => {
    try { await service.call("get_note", args, "mcp"); return "ok"; } catch (e) { return { code: e.code, message: e.message }; }
  };
  const missing = await outcome({ path: "Import/Absent.md" });
  assert.deepEqual(missing, { code: "not_found", message: "note not found" });
  for (const path of ["Journal/Private.md", "AGENT-API.md", "Import/Link.md", "Import/Sealed.md", ".obsidian/app.json"]) {
    assert.deepEqual(await outcome({ path }), missing, path);
  }
  assert.ok(!vault.reads.includes("Journal/Private.md") && !vault.reads.includes("AGENT-API.md") && !vault.reads.includes("Import/Link.md"), "out-of-scope files are never read");
});

test("S03: search filters before matching and counting, and refuses a leaked hit", async () => {
  const { service, vault } = setup();
  await service.searchNotes({ query: "plumber" });
  assert.ok(!vault.examined.some((p) => p.startsWith("Journal/") || p === "AGENT-API.md" || p === "Import/Sealed.md"));
  const leaky = makeVault(FILES);
  leaky.search.search = async () => ({ contract: "kosmos-personal-notes/1", terms: ["x"], total: 1, hits: [{ path: "Journal/Private.md", title: "P", score: 1, matchedIn: ["body"], excerpt: "" }], coverage: { state: "ready", searched: 1, omitted: 0 }, corpusRevision: 1 });
  const { service: guarded } = makeService(leaky, { includeFolders: ["Import"] });
  await assert.rejects(guarded.searchNotes({ query: "x" }), code("search_unavailable"));
});

test("UID selection: unambiguous, ambiguous, mismatch, and hidden duplicates do not interfere", async () => {
  const vault = makeVault({
    "A/one.md": { raw: "one", meta: { uid: "u-1" } },
    "A/two.md": { raw: "two", meta: { uid: "u-2" } },
    "A/dup1.md": { raw: "d1", meta: { uid: "u-dup" } },
    "A/dup2.md": { raw: "d2", meta: { uid: "u-dup" } },
    "Hidden/twin.md": { raw: "hidden", meta: { uid: "u-1" } },
  });
  const { service } = makeService(vault, { includeFolders: ["A"] });
  assert.equal((await service.getNote({ uid: "u-1" })).path, "A/one.md", "a hidden note with the same uid does not make it ambiguous");
  assert.equal((await service.getNote({ uid: "u-1", path: "A/one.md" })).content, "one");
  await assert.rejects(service.getNote({ uid: "u-dup" }), code("ambiguous_uid"));
  await assert.rejects(service.getNote({ uid: "u-1", path: "A/two.md" }), code("selector_mismatch"));
  await assert.rejects(service.getNote({ uid: "u-missing" }), code("not_found"));
  await assert.rejects(service.getRelated({ uid: "u-dup" }), code("ambiguous_uid"));
});

test("R01: paging through the service reconstructs the note; an intervening edit is note_changed", async () => {
  const raw = "---\r\ntitle: Long\r\n---\r\n" + "😀abc\r\n".repeat(3000);
  const vault = makeVault({ "N/long.md": raw });
  const { service } = makeService(vault, { includeFolders: ["N"] });
  let page = await service.call("get_note", { path: "N/long.md", limit_chars: 1001 }, "mcp");
  const parts = [page.content];
  while (page.truncated) {
    page = await service.call("get_note", { path: "N/long.md", limit_chars: "1001", offset_chars: String(page.next_offset_chars), expected_hash: page.content_hash }, "rest");
    parts.push(page.content);
  }
  assert.equal(parts.join(""), raw);
  assert.deepEqual(Object.keys(page).sort(), ["attachments", "content", "content_hash", "contract", "modified_ms", "next_offset_chars", "offset_chars", "path", "returned_chars", "tags", "total_chars", "truncated"].sort(), "exactly the documented fields");

  const first = await service.getNote({ path: "N/long.md", limit_chars: 100 });
  vault.write("N/long.md", raw.replace("abc", "ABC"));
  await assert.rejects(service.getNote({ path: "N/long.md", offset_chars: first.next_offset_chars, expected_hash: first.content_hash }), code("note_changed"));
});

test("R01: per-file limit gives note_too_large, never a prefix; only for notes in scope", async () => {
  const big = "x".repeat(5 * 1024 * 1024 + 1);
  const vault = makeVault({ "N/big.md": { raw: big, omitted: "too_large" }, "Hidden/big.md": { raw: big, omitted: "too_large" } });
  const { service } = makeService(vault, { includeFolders: ["N"] });
  await assert.rejects(service.getNote({ path: "N/big.md" }), code("note_too_large"));
  await assert.rejects(service.getRelated({ path: "N/big.md" }), code("note_too_large"));
  await assert.rejects(service.getNote({ path: "Hidden/big.md" }), code("not_found"), "size of a hidden file is not revealed");
  assert.equal(vault.reads.length, 0, "an over-limit file is not read");
  const overview = await service.vaultOverview();
  assert.equal(overview.omitted, 1, "only omitted files inside the selection are counted");
});

test("R02: attachment references are host-resolved, scoped and honest; no contents", async () => {
  const { service, diagnostics } = setup();
  const note = await service.getNote({ path: "Import/OneNote/Plumber.md" });
  assert.deepEqual(note.attachments, [
    { target: "receipt.png", kind: "embed", status: "available", path: "Import/OneNote/receipt.png" },
    { target: "quote.pdf", kind: "link", status: "missing", path: "Import/OneNote/quote.pdf" },
    { target: "../../Journal/scan.png", kind: "embed", status: "not_shared" },
    { target: "nowhere.pdf", kind: "link", status: "unresolved" },
  ], "remote URLs are dropped; an attachment outside the shared folders is reported without its path");
  assert.ok(diagnostics.some((d) => /quote\.pdf/.test(d)) && diagnostics.some((d) => /nowhere\.pdf/.test(d)), "missing references get a local diagnostic");
  assert.ok(!diagnostics.some((d) => /Journal\/scan\.png/.test(d)), "no diagnostic names the hidden attachment either");
});

test("S04: a scope change between pages invalidates continuation", async () => {
  const raw = "abcdefghij".repeat(10);
  const vault = makeVault({ "A/n.md": raw });
  const ctl = makeService(vault, { includeFolders: ["A"] });
  const first = await ctl.service.getNote({ path: "A/n.md", limit_chars: 10 });
  ctl.setScope({ includeFolders: ["B"] });
  await assert.rejects(ctl.service.getNote({ path: "A/n.md", offset_chars: 10, expected_hash: first.content_hash }), code("not_found"));
});

test("S04: a generation bump during an awaited read prevents the stale response", async () => {
  const vault = makeVault({ "A/n.md": "content" });
  const ctl = makeService(vault, { includeFolders: ["A"] });
  vault.onRead = async () => { ctl.setScope({ includeFolders: ["A"] }); }; // same folders, new generation (e.g. token rotated)
  await assert.rejects(ctl.service.getNote({ path: "A/n.md" }), code("policy_changed"));
  vault.onRead = null;
  assert.equal((await ctl.service.getNote({ path: "A/n.md" })).content, "content", "a fresh request under the new generation works");

  const slowSearch = makeVault({ "A/n.md": "content" });
  const ctl2 = makeService(slowSearch, { includeFolders: ["A"] });
  const inner = slowSearch.search.search;
  slowSearch.search.search = async (req) => { const r = await inner(req); ctl2.setScope({ includeFolders: [] }); return r; };
  await assert.rejects(ctl2.service.searchNotes({ query: "content" }), code("policy_changed"));
});

test("related: links, backlinks and shared tags among shared notes only", async () => {
  const vault = makeVault({
    "A/hub.md": { raw: "hub", meta: { tags: ["Garden"], links: ["A/out.md", "Hidden/secret.md"] } },
    "A/out.md": { raw: "out", meta: { tags: [] } },
    "A/back.md": { raw: "back", meta: { links: ["A/hub.md"] } },
    "A/tagged.md": { raw: "tag", meta: { tags: ["garden"] } },
    "A/sealed.md": { raw: "s", meta: { links: ["A/hub.md"], authoredSensitivity: "secret" } },
    "Hidden/secret.md": { raw: "h", meta: { links: ["A/hub.md"], tags: ["Garden"] } },
  });
  const { service } = makeService(vault, { includeFolders: ["A"] });
  const related = await service.getRelated({ path: "A/hub.md" });
  assert.deepEqual(related.results, [
    { path: "A/back.md", title: "back", reasons: ["linked_from"] },
    { path: "A/out.md", title: "out", reasons: ["links_to"] },
    { path: "A/tagged.md", title: "tagged", reasons: ["shared_tags"], shared_tags: ["Garden"] },
  ]);
  assert.equal(related.total, 3, "hidden and over-ceiling notes are neither listed nor counted");
  assert.equal((await service.getRelated({ path: "A/hub.md", limit: 1 })).truncated, true);
  await assert.rejects(service.getRelated({ path: "Hidden/secret.md" }), code("not_found"));
});

test("lineage: hidden or missing targets appear only as the allowed note's own unresolved declaration", async () => {
  const vault = makeVault({
    "A/v3.md": { raw: "v3", meta: { supersedes: ["[[A/v2]]"] } },
    "A/v2.md": { raw: "v2", meta: { supersedes: ["[[Hidden/v1|first]]", "[[Gone]]"] } },
    "Hidden/v1.md": { raw: "v1", meta: { supersedes: ["[[A/v0]]"] } },
    "A/v0.md": { raw: "v0", meta: {} },
  });
  const { service } = makeService(vault, { includeFolders: ["A"] });
  const lineage = await service.call("get_lineage", { path: "A/v2.md" }, "mcp");
  assert.deepEqual(lineage.edges, [{ from: "A/v3.md", to: "A/v2.md", source: "declared" }]);
  assert.deepEqual(lineage.unresolved, [
    { from: "A/v2.md", declared: "[[Hidden/v1|first]]", reason: "unresolved" },
    { from: "A/v2.md", declared: "[[Gone]]", reason: "unresolved" },
  ]);
  const text = JSON.stringify(lineage);
  assert.ok(!text.includes("Hidden/v1.md") && !text.includes("A/v0.md"), "no hidden node and no edge reached through a hidden note");
  assert.deepEqual(lineage.heads, ["A/v3.md"]);
  await assert.rejects(service.getLineage({ path: "Hidden/v1.md" }), code("not_found"));

  const leaky = makeService(vault, { includeFolders: ["A"] }, { lineage: () => ({ nodes: [{ path: "Hidden/v1.md", supersedes: [], supersededBy: [] }], edges: [], heads: [], unresolved: [], cycles: [], contradictions: [], truncated: false, nextCursor: null }) });
  await assert.rejects(leaky.service.getLineage({ path: "A/v2.md" }), code("search_unavailable"), "a builder bug cannot leak a hidden node");
});

test("overview: scoped counts, tools, protocols and the content rule", async () => {
  const { service } = setup();
  const o = await service.call("vault_overview", {}, "rest");
  assert.equal(o.notes, 3, "Shopping, Plumber and Open; sealed, typo, symlinked, journal and guide are not counted");
  assert.equal(o.profile, "personal");
  assert.deepEqual(o.tools, [...PERSONAL_TOOL_NAMES]);
  assert.equal(o.content_rule, PERSONAL_CONTENT_RULE);
  assert.match(PERSONAL_CONTENT_RULE, /not instructions/);
  assert.ok(!JSON.stringify(o).includes("Journal"), "no hidden folder names");
  assert.deepEqual(o.protocols.mcp["streamable-http"], ["2026-07-28", "2025-11-25"]);
});
