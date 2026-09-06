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
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);

const source = (operationId, value = "A reviewed description") => ({
  proposalId: operationId,
  createdAt: "2026-08-26T12:00:00.000Z",
  targetUid: "12345678-1234-4123-8123-123456789abc",
  path: "Guides/Current.md",
  noteHash: "a".repeat(64),
  provider: "deterministic",
  evidence: [{ id: 1, fingerprint: `sha256:${"b".repeat(64)}`, startLine: 10, endLine: 12 }],
  suggestions: [{ field: "description", value, confidence: 0.82, reason: "Evidence", evidenceBlockIds: [1], source: "deterministic" }],
});

const actor = {
  kind: "credential-bound-human",
  id: "local-human-reviewer",
  credentialId: `sha256:${"c".repeat(64)}`,
  credentialBound: true,
};

class MemoryAdapter {
  constructor(initial = {}) { this.files = new Map(Object.entries(initial)); this.directories = new Set(); this.calls = []; }
  async exists(path) { this.calls.push(["exists", path]); return this.files.has(path) || this.directories.has(path); }
  async read(path) { this.calls.push(["read", path]); if (!this.files.has(path)) throw new Error(`missing ${path}`); return this.files.get(path); }
  async write(path, contents) { this.calls.push(["write", path]); this.files.set(path, contents); }
  async rename(from, to) { this.calls.push(["rename", from, to]); if (this.files.has(to)) throw new Error(`destination exists: ${to}`); this.files.set(to, this.files.get(from)); this.files.delete(from); }
  async remove(path) { this.calls.push(["remove", path]); this.files.delete(path); }
  async mkdir(path) { this.calls.push(["mkdir", path]); this.directories.add(path); }
}

async function proposal(operationId = "gkxep-0123456789abcdef01234567", proposalActor) {
  return (await api.buildImmutableProposals(source(operationId), proposalActor))[0];
}

const decisionInput = (document, disposition, overrides = {}) => ({
  proposal: document,
  actor,
  disposition,
  createdAt: "2026-08-26T13:00:00.000Z",
  operationId: "gkx-enrich-20260826T130000000Z-a1b2c3d4",
  planSha256: "d".repeat(64),
  ...(disposition === "accepted" ? { reviewedValue: { field: "description", value: "Human-approved value" } } : {}),
  ...overrides,
});

test("accepted, rejected, and deferred decisions bind immutable proposals and human authority", async () => {
  const documents = await Promise.all([
    proposal("gkxep-0123456789abcdef01234567"),
    proposal("gkxep-1123456789abcdef01234567"),
    proposal("gkxep-2123456789abcdef01234567"),
  ]);
  const decisions = await Promise.all([
    api.buildImmutableProposalDecision(decisionInput(documents[0], "accepted")),
    api.buildImmutableProposalDecision(decisionInput(documents[1], "rejected")),
    api.buildImmutableProposalDecision(decisionInput(documents[2], "deferred", { planSha256: undefined })),
  ]);
  assert.deepEqual(decisions.map((item) => item.disposition), ["accepted", "rejected", "deferred"]);
  assert.ok(decisions.every((item, index) => item.proposal.id === documents[index].proposalId && item.proposal.contentHash === documents[index].contentHash));
  assert.ok(decisions.every((item) => item.actor.kind === "credential-bound-human" && item.actor.credentialBound === true));
  assert.match(decisions[0].reviewedValueSha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal("reviewedValueSha256" in decisions[1], false);
  assert.equal("planSha256" in decisions[2], false);
  assert.ok(await api.verifyDecisionContentHash(decisions[0]));
  await assert.rejects(() => api.buildImmutableProposalDecision(decisionInput(documents[0], "accepted", { reviewedValue: undefined })), /reviewed value/);
});

test("decision persistence is atomic, idempotent, proposal-preserving, and source-inert", async () => {
  const document = await proposal();
  const proposalPath = `.gkx/proposals/${document.proposalId}.yaml`;
  const proposalBytes = api.serializeProposalYaml(document);
  const adapter = new MemoryAdapter({ [proposalPath]: proposalBytes, "Guides/Current.md": "ORIGINAL SOURCE BYTES" });
  const firstDecision = await api.buildImmutableProposalDecision(decisionInput(document, "accepted"));
  const first = await api.persistImmutableDecisions(adapter, [firstDecision]);
  assert.equal(first.created.length, 1);
  assert.ok(first.created[0].startsWith(".gkx/decisions/") && first.created[0].endsWith(".yaml"));
  assert.equal(adapter.files.get(proposalPath), proposalBytes);
  assert.equal(adapter.files.get("Guides/Current.md"), "ORIGINAL SOURCE BYTES");
  assert.ok(adapter.calls.filter(([operation]) => operation === "write").every(([, path]) => path.startsWith(".gkx/decisions/")));
  const originalDecisionBytes = adapter.files.get(first.created[0]);
  const laterEquivalent = await api.buildImmutableProposalDecision(decisionInput(document, "accepted", { createdAt: "2026-08-26T14:00:00.000Z" }));
  assert.equal(laterEquivalent.decisionId, firstDecision.decisionId);
  const second = await api.persistImmutableDecisions(adapter, [laterEquivalent]);
  assert.deepEqual(second, { directory: ".gkx/decisions", created: [], unchanged: first.created });
  assert.equal(adapter.files.get(first.created[0]), originalDecisionBytes, "the first decision creation bytes remain immutable");
});

test("decision collisions and tampering fail before any record or source write", async () => {
  const leftProposal = await proposal("gkxep-0123456789abcdef01234567");
  const rightProposal = await proposal("gkxep-1123456789abcdef01234567");
  const left = await api.buildImmutableProposalDecision(decisionInput(leftProposal, "rejected"));
  const right = await api.buildImmutableProposalDecision(decisionInput(rightProposal, "deferred", { planSha256: undefined }));
  const collisionPath = `.gkx/decisions/${right.decisionId}.yaml`;
  const adapter = new MemoryAdapter({ [collisionPath]: "tampered collision bytes\n", "Guides/Current.md": "SOURCE" });
  await assert.rejects(() => api.persistImmutableDecisions(adapter, [left, right]), /immutable decision collision/);
  assert.equal(adapter.files.has(`.gkx/decisions/${left.decisionId}.yaml`), false, "whole-batch preflight prevents partial decisions");
  assert.equal(adapter.files.get("Guides/Current.md"), "SOURCE");
  assert.equal(adapter.calls.some(([operation]) => operation === "write" || operation === "rename"), false);

  const tampered = structuredClone(left); tampered.disposition = "accepted";
  const untouched = new MemoryAdapter({ "Guides/Current.md": "SOURCE" });
  await assert.rejects(() => api.persistImmutableDecisions(untouched, [tampered]), /content hash|bindings are incomplete/);
  assert.deepEqual(untouched.calls, []);
});

test("agents cannot self-approve and unbound human identities fail closed", async () => {
  const agentProposal = await proposal("gkxep-3123456789abcdef01234567", { kind: "credential-bound-agent", id: "same-identity", credentialBound: true });
  await assert.rejects(() => api.buildImmutableProposalDecision(decisionInput(agentProposal, "accepted", { actor: { ...actor, id: "same-identity" } })), /cannot approve its own/);
  const humanProposal = await proposal();
  await assert.rejects(() => api.buildImmutableProposalDecision(decisionInput(humanProposal, "rejected", { actor: { ...actor, credentialBound: false } })), /credential-bound human/);
});
