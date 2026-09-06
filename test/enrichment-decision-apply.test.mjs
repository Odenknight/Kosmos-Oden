import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createGkxEnrichmentApplyPlan, sha256Text } from "gkos-engine";

const obsidianStub = {
  name: "obsidian-test-stub",
  setup(builder) {
    builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "test-stub" }));
    builder.onLoad({ filter: /.*/, namespace: "test-stub" }, () => ({
      loader: "js",
      contents: `
        export class App {}
        export class Modal { constructor(app){ this.app=app; this.contentEl={}; } close(){} }
        export class Notice { constructor(){} hide(){} }
        export class Setting { constructor(){} addButton(){ return this; } }
        export class TFile { constructor(path){ this.path=path; } }
        globalThis.__KosmosDecisionTestTFile = TFile;
        export const normalizePath = (path) => String(path).replace(/\\\\/g, "/").replace(/^\\/+|\\/+$/g, "");
      `,
    }));
  },
};

async function bundle(entry) {
  const result = await build({
    entryPoints: [new URL(entry, import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "es2022",
    plugins: entry.includes("enrichment-apply") ? [obsidianStub] : [],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

const [applyApi, proposalApi] = await Promise.all([
  bundle("../src/plugin/gkx-enrichment-apply.ts"),
  bundle("../src/plugin/gkx-proposals.ts"),
]);

const note = `---
gkx_version: "2.2"
uid: "12345678-1234-4123-8123-123456789abc"
type: "semantic"
title: "Current Guide"
description: "Old description"
timestamp: "2026-07-15T12:00:00.000Z"
epistemic_state: "hypothesis"
scope: "node"
scope_id: "12345678-1234-4123-8123-123456789abc"
sensitivity: "internal"
tags: []
supersedes: []
superseded_by: []
forked_from: []
forked_to: []
---
# Current Guide

Human body.
`;

const suggestion = {
  field: "description", value: "Reviewed description", confidence: 0.82,
  reason: "Bounded evidence", evidenceBlockIds: [1], source: "deterministic",
};
const operationId = "gkxep-0123456789abcdef01234567";

async function fixture() {
  const noteHash = await sha256Text(note);
  const plan = await createGkxEnrichmentApplyPlan([{
    path: "Guides/Current.md",
    proposalId: operationId,
    expectedNoteHash: noteHash,
    content: note,
    decisions: [{ suggestionIndex: 0, decision: "accepted", edited: false, originalSuggestion: suggestion, finalSuggestion: suggestion }],
  }], { now: () => new Date("2026-08-26T13:00:00.000Z"), uuid: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  const [proposal] = await proposalApi.buildImmutableProposals({
    proposalId: operationId,
    createdAt: "2026-08-26T12:00:00.000Z",
    targetUid: "12345678-1234-4123-8123-123456789abc",
    path: "Guides/Current.md",
    noteHash,
    provider: "deterministic",
    evidence: [{ id: 1, fingerprint: `sha256:${"b".repeat(64)}`, startLine: 10, endLine: 12 }],
    suggestions: [suggestion],
  });
  return { plan, proposal };
}

class MemoryApp {
  constructor(proposal, options = {}) {
    const proposalPath = `.gkx/proposals/${proposal.proposalId}.yaml`;
    this.files = new Map([[proposalPath, proposalApi.serializeProposalYaml(proposal)], ["Guides/Current.md", note]]);
    this.directories = new Set([".gkx", ".gkx/proposals"]);
    this.calls = [];
    this.secrets = new Map();
    const adapter = {
      exists: async (path) => this.files.has(path) || this.directories.has(path),
      read: async (path) => { if (!this.files.has(path)) throw new Error(`missing ${path}`); return this.files.get(path); },
      write: async (path, contents) => { this.calls.push(["write", path]); this.files.set(path, contents); },
      rename: async (from, to) => { this.calls.push(["rename", from, to]); if (this.files.has(to)) throw new Error(`destination exists: ${to}`); this.files.set(to, this.files.get(from)); this.files.delete(from); },
      remove: async (path) => { this.calls.push(["remove", path]); this.files.delete(path); },
      list: async (root) => ({ files: [...this.files.keys()].filter((path) => path.startsWith(`${root}/`)), folders: [] }),
      readBinary: async (path) => new TextEncoder().encode(this.files.get(path)).buffer,
      writeBinary: async (path, bytes) => { this.calls.push(["writeBinary", path]); this.files.set(path, new TextDecoder().decode(bytes)); },
    };
    this.vault = {
      adapter,
      createFolder: async (path) => { this.calls.push(["mkdir", path]); this.directories.add(path); },
      getAbstractFileByPath: (path) => this.files.has(path) ? new globalThis.__KosmosDecisionTestTFile(path) : null,
      read: async (file) => this.files.get(file.path),
      process: async (file, transform) => {
        this.calls.push(["process", file.path]);
        if (![...this.files.keys()].some((path) => path.startsWith(".gkx/decisions/") && path.endsWith(".yaml"))) throw new Error("source process ran before decision commit");
        const next = transform(this.files.get(file.path)); this.files.set(file.path, next); return next;
      },
    };
    if (!options.noSecretStorage) this.secretStorage = {
      getSecret: (id) => this.secrets.get(id) || "",
      setSecret: (id, value) => { this.calls.push(["setSecret", id]); this.secrets.set(id, value); },
    };
  }
}

const acknowledgements = { backupReady: true, valuesReviewed: true, relationshipsReviewed: true };

test("accepted apply commits its immutable decision before guarded source processing", async () => {
  const { plan, proposal } = await fixture();
  const app = new MemoryApp(proposal);
  const proposalPath = `.gkx/proposals/${proposal.proposalId}.yaml`;
  const proposalBytes = app.files.get(proposalPath);
  const result = await applyApi.applyGkxEnrichmentPlan(app, plan, acknowledgements);
  assert.deepEqual(result.applied, ["Guides/Current.md"]);
  const decisionPaths = [...app.files.keys()].filter((path) => path.startsWith(".gkx/decisions/") && path.endsWith(".yaml"));
  assert.equal(decisionPaths.length, 1);
  assert.ok(app.calls.findIndex(([operation, from, to]) => operation === "rename" && from.startsWith(".gkx/decisions/") && to === decisionPaths[0]) < app.calls.findIndex(([operation]) => operation === "process"));
  assert.equal(app.files.get(proposalPath), proposalBytes, "proposal bytes remain immutable");
  assert.equal(app.files.get(decisionPaths[0]).includes([...app.secrets.values()][0]), false, "reviewer secret never enters the decision");
  assert.ok([...app.files.keys()].some((path) => path.endsWith("/result.json")), "guarded apply receipt remains separate");
});

test("missing acknowledgement or Secret Storage blocks decisions and source writes", async () => {
  const { plan, proposal } = await fixture();
  const noAck = new MemoryApp(proposal);
  await assert.rejects(() => applyApi.applyGkxEnrichmentPlan(noAck, plan, { backupReady: true, valuesReviewed: false, relationshipsReviewed: true }), /acknowledgements/);
  assert.equal(noAck.files.get("Guides/Current.md"), note);
  assert.equal(noAck.calls.some(([operation]) => operation === "process"), false);

  const noSecrets = new MemoryApp(proposal, { noSecretStorage: true });
  await assert.rejects(() => applyApi.applyGkxEnrichmentPlan(noSecrets, plan, acknowledgements), /Secret Storage is unavailable/);
  assert.equal(noSecrets.files.get("Guides/Current.md"), note);
  assert.equal([...noSecrets.files.keys()].some((path) => path.startsWith(".gkx/decisions/")), false);
});

test("zero or multiple canonical proposal matches block the whole batch before decisions", async () => {
  const { plan, proposal } = await fixture();
  const zero = new MemoryApp(proposal);
  zero.files.delete(`.gkx/proposals/${proposal.proposalId}.yaml`);
  await assert.rejects(() => applyApi.persistReviewedEnrichmentDecisions(zero, plan, { valuesReviewed: true }), /0 canonical proposal matches|quarantine is unavailable/);
  assert.equal([...zero.files.keys()].some((path) => path.startsWith(".gkx/decisions/")), false);

  const multiple = new MemoryApp(proposal);
  const [other] = await proposalApi.buildImmutableProposals({
    proposalId: operationId, createdAt: "2026-08-26T12:01:00.000Z", targetUid: proposal.target.uid,
    path: proposal.target.path, noteHash: proposal.target.sourceSha256, provider: "deterministic",
    evidence: [{ id: 1, fingerprint: `sha256:${"e".repeat(64)}`, startLine: 20, endLine: 21 }], suggestions: [suggestion],
  }, { kind: "credential-bound-agent", id: "agent-alpha", credentialBound: true });
  multiple.files.set(`.gkx/proposals/${other.proposalId}.yaml`, proposalApi.serializeProposalYaml(other));
  await assert.rejects(() => applyApi.persistReviewedEnrichmentDecisions(multiple, plan, { valuesReviewed: true }), /2 canonical proposal matches/);
  assert.equal([...multiple.files.keys()].some((path) => path.startsWith(".gkx/decisions/")), false);
  assert.equal(multiple.calls.some(([operation]) => operation === "setSecret"), false, "binding fails before creating reviewer credential state");
});
