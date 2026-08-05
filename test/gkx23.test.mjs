import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  GKX23_POLICY,
  buildGraph,
  buildGkx23Projection,
  parseGkx23Frontmatter,
} from "../dist/kosmos-core.mjs";

const CANONICAL_POLICY = '{"assessment_thresholds":[[0.9,"assessment:strongly-documented"],[0.75,"assessment:well-documented"],[0.6,"assessment:partially-supported"],[0.4,"assessment:weakly-supported"],[0.01,"assessment:insufficient"],[0,"assessment:invalid-or-untraceable"]],"compatible_gkx_versions":["2.3"],"missing_value_behavior":"exclude-null-and-renormalize","policy_id":"policy:gkx23-default-v1","policy_version":"1.0.0","sensitivity_default":"internal","weights":{"contradiction_status":0.1,"evidence_support":0.2,"provenance_quality":0.2,"relationship_integrity":0.15,"review_readiness":0.1,"structural_completeness":0.15,"temporal_freshness":0.1}}';

const note = `---
gkx_version: "2.3"
uid: "019b2d14-4230-7db7-87d4-7d81cfaec932"
title: "A governed hypothesis"
type: "hypothesis"
created_at: "2026-07-16T20:00:00Z"
updated_at: "2026-07-17T20:00:00Z"
authorship:
  origin: "authored"
  author_id: "person:operator"
epistemic:
  state: "hypothesis"
  confidence: 0.35
  confidence_origin: "authored"
sensitivity:
  level: "restricted"
  handling:
    - "no-public-export"
provenance:
  source_kind: "document"
  source_refs:
    - "source:paper-001"
  source_locator:
    page: 12
  content_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  extraction:
    method: "human"
relationships:
  depends_on:
    - target: "concept:metric"
      origin: "authored"
  related_to:
    - "019b2d14-4230-7db7-87d4-7d81cfaec933"
evidence:
  supports:
    - target: "019b2d14-4230-7db7-87d4-7d81cfaec932"
      strength: 0.8
      relevance: 0.9
      source_uid: "source:paper-001"
      independence_group: "paper:001"
  contradicts: []
review:
  status: "pending"
  last_reviewed_at: "2026-07-16T20:00:00Z"
assessment:
  current_assessment_id: null
  status: "unassessed"
authorization:
  status: "research-only"
tags:
  - "navigation-only"
labels:
  authored:
    - "domain:test"
  derived: []
  proposed:
    - label: "epistemic:supported"
      proposal_id: "proposal:1"
  approved:
    - "use:research-only"
x-lab-extension:
  sample: true
---
# Hypothesis
Body remains source content.`;

test("GKX 2.3 nested parser preserves extensions and scalar types", () => {
  const parsed = parseGkx23Frontmatter(note);
  assert.equal(parsed.present, true);
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.data.gkx_version, "2.3");
  assert.equal(parsed.data.epistemic.confidence, 0.35);
  assert.equal(parsed.data.sensitivity.level, "restricted");
  assert.equal(parsed.data["x-lab-extension"].sample, true);
});

test("bundled GKX 2.3 policy hash matches its canonical deterministic input", () => {
  assert.equal(GKX23_POLICY.hash, `sha256:${createHash("sha256").update(CANONICAL_POLICY).digest("hex")}`);
});

test("GKX 2.3 projection separates origins and scores documentation, not truth", () => {
  const projection = buildGkx23Projection(note, "Claims/Test.md", "abc:123", null);
  assert.ok(projection);
  assert.equal(projection.profile, "gkx-2.3-validating-projection");
  assert.equal(projection.authored.epistemicState, "hypothesis");
  assert.equal(projection.effective.sensitivity, "restricted");
  assert.deepEqual(projection.authored.tags, ["navigation-only"]);
  assert.equal(projection.authored.labels.includes("navigation-only"), false);
  assert.ok(projection.authored.labels.includes("domain:test"));
  assert.deepEqual(projection.extensions["x-lab-extension"], { sample: true });
  assert.equal(projection.proposed.labels.length, 1);
  assert.equal(projection.approved.labels.length, 1);
  assert.ok(projection.derived.labels.includes("identity:stable"));
  assert.equal(projection.assessment.interpretation, "documentation-and-support-quality-not-truth");
  assert.equal(projection.assessment.policy.id, "policy:gkx23-default-v1");
  assert.ok(projection.assessment.scores.overall > 0);
  assert.equal(projection.assessment.scores.evidence_support > 0, true);
});

test("UID-first typed relationships resolve canonically and proposed edges stay non-effective", () => {
  const target = note
    .replace("019b2d14-4230-7db7-87d4-7d81cfaec932", "019b2d14-4230-7db7-87d4-7d81cfaec933")
    .replace('title: "A governed hypothesis"', 'title: "Target"')
    .replace(/relationships:[\s\S]*?evidence:/, "relationships:\n  related_to: []\nevidence:");
  const proposed = `---
gkx_version: "2.3"
uid: "019b2d14-4230-7db7-87d4-7d81cfaec934"
title: "Proposal only"
type: "proposal"
created_at: "2026-07-16T20:00:00Z"
authorship:
  origin: "proposed"
epistemic:
  state: "hypothesis"
sensitivity:
  level: "internal"
provenance: { }
relationships:
  related_to:
    - target: "019b2d14-4230-7db7-87d4-7d81cfaec933"
review: { }
assessment: { }
labels:
  authored: []
  derived: []
  proposed: []
  approved: []
---`;
  const graph = buildGraph([
    { relativePath: "Claims/Source.md", extension: "md", content: note },
    { relativePath: "Claims/Target.md", extension: "md", content: target },
    { relativePath: "Claims/Proposal.md", extension: "md", content: proposed },
  ], ["Claims"], Date.parse("2026-07-18T00:00:00Z"));
  assert.equal(graph.gkxUidIndex["019b2d14-4230-7db7-87d4-7d81cfaec933"], "file:Claims/Target.md");
  assert.ok(graph.links.some((link) => link.source === "file:Claims/Source.md" && link.target === "file:Claims/Target.md" && link.kind === "semantic" && link.label === "related_to"));
  assert.equal(graph.links.some((link) => link.source === "file:Claims/Proposal.md" && link.target === "file:Claims/Target.md" && link.kind === "semantic"), false);
});

test("native 2.3 wikilink targets yield to flat Obsidian relationship corrections", () => {
  const original = note
    .replace("019b2d14-4230-7db7-87d4-7d81cfaec932", "019b2d14-4230-7db7-87d4-7d81cfaec933")
    .replace('title: "A governed hypothesis"', 'title: "Original"')
    .replace(/relationships:[\s\S]*?evidence:/, "relationships:\n  related_to: []\nevidence:");
  const target = note
    .replace("019b2d14-4230-7db7-87d4-7d81cfaec932", "019b2d14-4230-7db7-87d4-7d81cfaec934")
    .replace('title: "A governed hypothesis"', 'title: "Target"')
    .replace(/relationships:[\s\S]*?evidence:/, "relationships:\n  related_to: []\nevidence:");
  const corrected = note.replace("labels:\n", "related_to:\n  - \"[[Target]]\"\nlabels:\n");
  const graph = buildGraph([
    { relativePath: "Claims/Source.md", extension: "md", content: corrected },
    { relativePath: "Claims/Original.md", extension: "md", content: original },
    { relativePath: "Claims/Target.md", extension: "md", content: target },
  ], ["Claims"]);
  const links = graph.links.filter((link) => link.source === "file:Claims/Source.md" && link.target === "file:Claims/Target.md" && link.kind === "semantic");
  assert.equal(links.length, 1);
  assert.equal(links[0].label, "related_to");
  assert.equal(graph.links.some((link) => link.source === "file:Claims/Source.md" && link.target === "file:Claims/Original.md" && link.kind === "semantic"), false);
  const projection = graph.nodes.find((node) => node.path === "Claims/Source.md").gkx.projection;
  assert.ok(!projection.diagnostics.some((diagnostic) => diagnostic.code === "GKX-RELATIONSHIP-001" && diagnostic.field === "relationships.related_to"));
});

test("duplicate UID reuse fails closed and is excluded from the UID index", () => {
  const other = note.replace("Body remains source content.", "Conflicting bytes.");
  const graph = buildGraph([
    { relativePath: "A.md", extension: "md", content: note },
    { relativePath: "B.md", extension: "md", content: other },
  ], [], Date.parse("2026-07-18T00:00:00Z"));
  assert.equal(graph.gkxUidIndex["019b2d14-4230-7db7-87d4-7d81cfaec932"], undefined);
  for (const path of ["A.md", "B.md"]) {
    const projection = graph.nodes.find((node) => node.path === path).gkx.projection;
    assert.ok(projection.diagnostics.some((d) => d.code === "GKX-IDENTITY-003"));
    assert.ok(projection.diagnostics.some((d) => d.code === "GKX-IDENTITY-004"));
  }
});

test("flat editable 2.3 profile validates and projects governance from flat properties", () => {
  const flat23 = `---
gkx_version: "2.3"
uid: "019b2d14-4230-7db7-87d4-7d81cfaec935"
title: "Flat editable"
type: "semantic"
created_at: "2026-07-01T00:00:00Z"
updated_at: "2026-07-02T00:00:00Z"
description: "Obsidian-editable 2.3 note."
epistemic_state: "fact"
sensitivity: "restricted"
authorship_origin: "authored"
tags:
  - "research"
supersedes: []
superseded_by: []
forked_from: []
forked_to: []
related_to:
  - "[[Neighbor]]"
---
Body.`;
  const projection = buildGkx23Projection(flat23, "Flat23.md", "f:1", null);
  assert.ok(projection);
  assert.equal(projection.mode, "strict-v2.3");
  assert.ok(!projection.diagnostics.some((d) => d.code === "GKX-SCHEMA-004"), "no missing-block schema errors for the flat profile");
  assert.equal(projection.authored.epistemicState, "reported");
  assert.equal(projection.effective.sensitivity, "restricted");
  assert.equal(projection.authored.assertionOrigin, "authored");
  assert.deepEqual(projection.authored.tags, ["research"]);
  assert.equal(projection.extensions.authorship_origin, undefined, "flat governance keys are not extensions");
});

test("missing and invalid sensitivity fail closed", () => {
  const missing = note.replace(/sensitivity:[\s\S]*?provenance:/, "provenance:");
  const p1 = buildGkx23Projection(missing, "Missing.md", "m:1", null);
  assert.equal(p1.effective.sensitivity, "secret");
  assert.ok(p1.diagnostics.some((d) => d.code === "GKX-SENSITIVITY-001"));
  const p1relaxed = buildGkx23Projection(missing, "Missing.md", "m:1", null, { defaultSensitivity: "internal" });
  assert.equal(p1relaxed.effective.sensitivity, "internal");
  assert.ok(p1relaxed.diagnostics.some((d) => d.code === "GKX-SENSITIVITY-001"));
  const invalid = note.replace('level: "restricted"', 'level: "unclassified"');
  const p2 = buildGkx23Projection(invalid, "Invalid.md", "i:1", null);
  assert.equal(p2.effective.sensitivity, "secret");

  const flat = `---\ngkx_version: "2.2"\nuid: "11111111-1111-4111-8111-111111111111"\ntype: "semantic"\ntitle: "Flat"\ntimestamp: "2026-07-01T00:00:00Z"\nepistemic_state: "fact"\nsensitivity: "typo"\n---\nBody`;
  const graph = buildGraph([{ relativePath: "Flat.md", extension: "md", content: flat }], []);
  assert.equal(graph.nodes.find((node) => node.path === "Flat.md").gkx.projection.effective.sensitivity, "secret");
});
