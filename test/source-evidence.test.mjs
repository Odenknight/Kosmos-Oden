import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import { build } from "esbuild";
import { KosmosAgentServer, DEFAULT_AGENT_SETTINGS, MAX_SOURCE_EVIDENCE_BYTES } from "../dist/kosmos-agent-server.mjs";

const compiled = await build({ entryPoints: ["src/plugin/vault-provider.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { VaultDataProvider } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);

function fixture() {
  const raw = "---\r\ntype: semantic\r\nsensitivity: internal\r\n---\r\nExact café 🌌\r\n" + "tail ".repeat(3000);
  const settings = { ...DEFAULT_AGENT_SETTINGS, defaultSensitivity: "internal", agentSensitivityCeiling: "internal" };
  const file = { path: "note.md", name: "note.md", extension: "md", stat: { size: Buffer.byteLength(raw), mtime: 1, ctime: 1 } };
  const privateRaw = "---\ntype: semantic\nsensitivity: secret\n---\nPrivate";
  const privateFile = { ...file, path: "private.md", name: "private.md", stat: { ...file.stat, size: Buffer.byteLength(privateRaw) } };
  const reads = [];
  let binary = Buffer.from(raw), hook = () => {};
  const vault = {
    getMarkdownFiles: () => [file, privateFile], getFiles: () => [file, privateFile],
    getAbstractFileByPath: path => path === file.path ? file : path === privateFile.path ? privateFile : null,
    getName: () => "Synthetic evidence", adapter: {},
    cachedRead: async f => f === file ? raw : privateRaw,
    readBinary: async f => { reads.push(f.path); await hook(); return Uint8Array.from(binary).buffer; },
  };
  const provider = new VaultDataProvider({ vault }, settings);
  const server = new KosmosAgentServer(http, settings, provider);
  return { raw, settings, file, vault, provider, server, reads, setBinary: value => { binary = value; }, onRead: fn => { hook = fn; } };
}

test("opt-in export hashes full original bytes including CRLF/frontmatter beyond truncation; denied notes are never read", async () => {
  const f = fixture();
  const ordinary = await f.server.callTool("export_graphiti_episodes", { limit: 10 });
  assert.equal(f.reads.length, 0);
  assert.ok(ordinary.episodes.every(e => !JSON.parse(e.episode_body).source_evidence));
  const page = await f.server.callTool("export_graphiti_episodes", { limit: 10, include_source_evidence: true });
  const bodies = page.episodes.filter(e => e.source === "json").map(e => JSON.parse(e.episode_body));
  assert.equal(bodies.length, 1);
  assert.deepEqual(f.reads, ["note.md"]);
  const evidence = bodies[0].source_evidence;
  assert.equal(evidence.sha256, createHash("sha256").update(Buffer.from(f.raw)).digest("hex"));
  assert.equal(evidence.byte_length, Buffer.byteLength(f.raw));
  assert.equal(evidence.semantic_support, "unverified");
  assert.equal(evidence.revision, `sha256:${evidence.sha256}`);
  assert.ok(bodies[0].content.length < f.raw.length);
});

test("source evidence option rejects non-boolean values and unsupported providers", async () => {
  const f = fixture();
  await assert.rejects(f.server.callTool("export_graphiti_episodes", { include_source_evidence: "true" }), /must be a boolean/);
  f.provider.getIndexedSourceBytes = undefined;
  await assert.rejects(f.server.callTool("export_graphiti_episodes", { include_source_evidence: true }), /unavailable from this provider/);
  assert.equal(f.reads.length, 0);
});

for (const scenario of ["unannounced edit", "revision change", "revocation", "invalid UTF-8", "file replacement", "metadata change"]) {
  test(`evidence export refuses ${scenario} without returning stale evidence`, async () => {
    const f = fixture();
    await f.provider.getGraph();
    if (scenario === "unannounced edit") f.setBinary(Buffer.from(f.raw.replace("Exact", "Other")));
    if (scenario === "invalid UTF-8") { const bytes = Buffer.from(f.raw); bytes[bytes.length - 1] = 0xff; f.setBinary(bytes); }
    f.onRead(() => {
      if (scenario === "revision change") f.provider.markChanged(f.file.path);
      if (scenario === "revocation") f.settings.agentSensitivityCeiling = "public";
      if (scenario === "file replacement") f.vault.getAbstractFileByPath = () => ({ ...f.file });
      if (scenario === "metadata change") f.file.stat.mtime++;
    });
    await assert.rejects(f.server.callTool("export_graphiti_episodes", { include_source_evidence: true }), e => e.reason === "provider_unavailable");
  });
}

test("evidence budget rejects oversized metadata before I/O and oversized actual reads before hashing", async () => {
  const f = fixture();
  const graph = await f.provider.getGraph();
  f.file.stat.size = MAX_SOURCE_EVIDENCE_BYTES + 1;
  await assert.rejects(f.provider.getIndexedSourceBytes(f.file.path, graph, MAX_SOURCE_EVIDENCE_BYTES), e => e.reason === "provider_unavailable");
  assert.equal(f.reads.length, 0);
  f.file.stat.size = Buffer.byteLength(f.raw);
  f.setBinary(new Uint8Array(MAX_SOURCE_EVIDENCE_BYTES + 1));
  await assert.rejects(f.provider.getIndexedSourceBytes(f.file.path, graph, MAX_SOURCE_EVIDENCE_BYTES), e => e.reason === "provider_unavailable");
});

test("one export rejects a provider that exceeds its byte budget", async () => {
  const f = fixture();
  const budgets = [];
  f.provider.getIndexedSourceBytes = async (_path, _graph, budget) => { budgets.push(budget); return new Uint8Array(budget + 1); };
  await assert.rejects(f.server.callTool("export_graphiti_episodes", { include_source_evidence: true }), e => e.reason === "provider_unavailable");
  assert.deepEqual(budgets, [MAX_SOURCE_EVIDENCE_BYTES]);
});

test("the page budget declines across distinct files and page metadata refuses policy changes", async () => {
  const f = fixture();
  f.settings.agentSensitivityCeiling = "secret";
  const budgets = [];
  f.provider.getIndexedSourceBytes = async (_path, _graph, budget) => { budgets.push(budget); return new Uint8Array(8); };
  await f.server.callTool("export_graphiti_episodes", { limit: 10, include_source_evidence: true });
  assert.deepEqual(budgets, [MAX_SOURCE_EVIDENCE_BYTES, MAX_SOURCE_EVIDENCE_BYTES - 8]);
  const original = f.server.qEpisodes.bind(f.server);
  f.server.qEpisodes = async (...args) => {
    const episodes = await original(...args);
    f.settings.agentSensitivityCeiling = "public";
    return episodes;
  };
  await assert.rejects(f.server.qEpisodePage(), e => e.reason === "provider_unavailable");
});

test("evidence reads refuse an old graph and operational paths before I/O", async () => {
  const f = fixture();
  const old = await f.provider.getGraph();
  f.provider.markChanged(f.file.path);
  const current = await f.provider.getGraph();
  assert.equal(await f.provider.getIndexedSourceBytes(f.file.path, old, MAX_SOURCE_EVIDENCE_BYTES), null);
  assert.equal(await f.provider.getIndexedSourceBytes(".gkx/private.md", current, MAX_SOURCE_EVIDENCE_BYTES), null);
  assert.equal(f.reads.length, 0);
});
