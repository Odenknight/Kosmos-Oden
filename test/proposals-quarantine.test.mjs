import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundled = await build({
  entryPoints: [new URL("../src/plugin/gkx-proposals.ts", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  target: "es2022",
});
const proposals = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);

const source = (overrides = {}) => ({
  proposalId: "gkxep-0123456789abcdef01234567",
  createdAt: "2026-08-26T12:00:00.000Z",
  targetUid: "12345678-1234-4123-8123-123456789abc",
  path: "Guides/Current.md",
  noteHash: "a".repeat(64),
  provider: "deterministic",
  evidence: [{ id: 1, fingerprint: `sha256:${"b".repeat(64)}`, startLine: 10, endLine: 12 }],
  suggestions: [{ field: "description", value: "A reviewed description", confidence: 0.82, reason: "Evidence", evidenceBlockIds: [1], source: "deterministic" }],
  ...overrides,
});

class MemoryAdapter {
  constructor(initial = {}) { this.files = new Map(Object.entries(initial)); this.directories = new Set(); this.calls = []; }
  async exists(path) { this.calls.push(["exists", path]); return this.files.has(path) || this.directories.has(path); }
  async read(path) { this.calls.push(["read", path]); if (!this.files.has(path)) throw new Error(`missing ${path}`); return this.files.get(path); }
  async write(path, contents) { this.calls.push(["write", path]); this.files.set(path, contents); }
  async rename(from, to) { this.calls.push(["rename", from, to]); if (this.files.has(to)) throw new Error(`destination exists: ${to}`); this.files.set(to, this.files.get(from)); this.files.delete(from); }
  async remove(path) { this.calls.push(["remove", path]); this.files.delete(path); }
  async mkdir(path) { this.calls.push(["mkdir", path]); this.directories.add(path); }
}

test("proposal records bind canonical identity, source, evidence, provenance, and content hash", async () => {
  const [proposal] = await proposals.buildImmutableProposals(source());
  assert.match(proposal.proposalId, /^gkxp-[0-9a-f]{24}$/);
  assert.equal(proposal.schema, "gkx-proposal/1");
  assert.equal(proposal.contractVersion, "GKOS-PROPOSAL-QUARANTINE-1.0.0-draft.1");
  assert.deepEqual(proposal.actor, { kind: "local-human", id: "local-obsidian-operator", credentialBound: false });
  assert.deepEqual(proposal.target, { uid: source().targetUid, path: source().path, sourceSha256: "a".repeat(64) });
  assert.equal(proposal.status, "pending");
  assert.equal(proposal.provenance.automaticApproval, false);
  assert.equal(await proposals.verifyProposalContentHash(proposal), true);
  const bytes = proposals.serializeProposalYaml(proposal);
  assert.deepEqual(JSON.parse(bytes), proposal, "canonical JSON is valid YAML 1.2 and round-trips exactly");
});

test("atomic quarantine persistence is idempotent and never touches a source note", async () => {
  const adapter = new MemoryAdapter({ "Guides/Current.md": "ORIGINAL SOURCE BYTES" });
  const docs = await proposals.buildImmutableProposals(source());
  const first = await proposals.persistImmutableProposals(adapter, docs);
  assert.equal(first.created.length, 1);
  assert.equal(adapter.files.get("Guides/Current.md"), "ORIGINAL SOURCE BYTES");
  assert.ok(adapter.calls.some(([operation, from, to]) => operation === "rename" && from.endsWith(".tmp") && to.endsWith(".yaml")));
  assert.ok(adapter.calls.filter(([operation]) => operation === "write").every(([, path]) => path.startsWith(".gkx/proposals/")));
  const before = adapter.files.get(first.created[0]);
  const second = await proposals.persistImmutableProposals(adapter, docs);
  assert.deepEqual(second, { directory: ".gkx/proposals", created: [], unchanged: first.created });
  assert.equal(adapter.files.get(first.created[0]), before, "an idempotent save leaves original proposal bytes unchanged");
});

test("a later equivalent submission preserves the first immutable creation bytes", async () => {
  const adapter = new MemoryAdapter();
  const firstDocuments = await proposals.buildImmutableProposals(source());
  const first = await proposals.persistImmutableProposals(adapter, firstDocuments);
  const originalBytes = adapter.files.get(first.created[0]);
  const laterDocuments = await proposals.buildImmutableProposals(source({ createdAt: "2026-08-26T12:30:00.000Z" }));
  assert.equal(laterDocuments[0].proposalId, firstDocuments[0].proposalId, "semantic duplicate keeps its idempotency identity");
  assert.notEqual(proposals.serializeProposalYaml(laterDocuments[0]), originalBytes, "creation time is not rewritten to fake byte equality");
  const later = await proposals.persistImmutableProposals(adapter, laterDocuments);
  assert.deepEqual(later, { directory: ".gkx/proposals", created: [], unchanged: first.created });
  assert.equal(adapter.files.get(first.created[0]), originalBytes, "the original record remains byte immutable");
});

test("a different immutable record at the same proposal path is rejected without overwrite", async () => {
  const [document] = await proposals.buildImmutableProposals(source());
  const path = `.gkx/proposals/${document.proposalId}.yaml`;
  const adapter = new MemoryAdapter({ [path]: "different existing bytes\n", "Guides/Current.md": "source" });
  await assert.rejects(() => proposals.persistImmutableProposals(adapter, [document]), /immutable proposal collision/);
  assert.equal(adapter.files.get(path), "different existing bytes\n");
  assert.equal(adapter.files.get("Guides/Current.md"), "source");
  assert.equal(adapter.calls.some(([operation]) => operation === "write" || operation === "rename"), false);
});

test("a failed replacement removes the verified temporary record and leaves no partial proposal", async () => {
  const [document] = await proposals.buildImmutableProposals(source());
  const adapter = new MemoryAdapter({ "Guides/Current.md": "source" });
  adapter.rename = async (from, to) => { adapter.calls.push(["rename", from, to]); throw new Error("simulated replacement failure"); };
  await assert.rejects(() => proposals.persistImmutableProposals(adapter, [document]), /simulated replacement failure/);
  assert.equal([...adapter.files.keys()].some((path) => path.startsWith(".gkx/proposals/")), false);
  assert.equal(adapter.files.get("Guides/Current.md"), "source");
});

test("unsafe target paths and invalid content hashes fail before disk access", async () => {
  const [unsafe] = await proposals.buildImmutableProposals(source({ path: "Guides/Current.md" }));
  unsafe.target.path = "../Secret.md";
  const adapter = new MemoryAdapter();
  await assert.rejects(() => proposals.persistImmutableProposals(adapter, [unsafe]), /traversal|hazard/);
  assert.deepEqual(adapter.calls, []);

  const [tampered] = await proposals.buildImmutableProposals(source());
  tampered.confidence = 0.1;
  await assert.rejects(() => proposals.persistImmutableProposals(adapter, [tampered]), /content hash/);
  assert.deepEqual(adapter.calls, []);
});

test("conflicts are deterministic projections and proposal bytes remain immutable", async () => {
  const [left] = await proposals.buildImmutableProposals(source());
  const [right] = await proposals.buildImmutableProposals(source({
    proposalId: "gkxep-fedcba9876543210fedcba98",
    createdAt: "2026-08-26T12:01:00.000Z",
    suggestions: [{ field: "description", value: "A different description", confidence: 0.91, reason: "Other evidence", evidenceBlockIds: [1], source: "deterministic" }],
  }));
  const before = [proposals.serializeProposalYaml(left), proposals.serializeProposalYaml(right)];
  const first = proposals.projectProposalConflicts([right, left]);
  const second = proposals.projectProposalConflicts([left, right]);
  assert.deepEqual(first, second);
  assert.equal(first.length, 1);
  assert.deepEqual(first[0].proposalIds, [left.proposalId, right.proposalId].sort());
  assert.deepEqual([proposals.serializeProposalYaml(left), proposals.serializeProposalYaml(right)], before);
});

test("confidence triage only sorts, filters, and selects; it never changes status", async () => {
  const docs = (await Promise.all([
    proposals.buildImmutableProposals(source()),
    proposals.buildImmutableProposals(source({
      proposalId: "gkxep-111111111111111111111111",
      suggestions: [{ field: "tags", value: ["zeta", "alpha"], confidence: 0.45, reason: "Tags", evidenceBlockIds: [1], source: "deterministic" }],
    })),
  ])).flat();
  const snapshot = docs.map(proposals.serializeProposalYaml);
  assert.deepEqual(proposals.triageProposals(docs, { direction: "descending" }).map((item) => item.confidence), [0.82, 0.45]);
  assert.deepEqual(proposals.triageProposals(docs, { direction: "ascending", field: "tags", minimumConfidence: 0.4 }).map((item) => item.change.field), ["tags"]);
  assert.deepEqual(proposals.selectTriageCandidates(docs, 0.8), [docs[0].proposalId]);
  assert.ok(docs.every((item) => item.status === "pending" && item.provenance.automaticApproval === false));
  assert.deepEqual(docs.map(proposals.serializeProposalYaml), snapshot);
});

test("credential-bound agent identity is explicit and false credential claims are rejected", async () => {
  const [document] = await proposals.buildImmutableProposals(source(), { kind: "credential-bound-agent", id: "agent-alpha", credentialBound: true });
  assert.equal(document.actor.id, "agent-alpha");
  await assert.rejects(() => proposals.buildImmutableProposals(source(), { kind: "credential-bound-agent", id: "agent-alpha", credentialBound: false }), /credential-bound identity/);
});
