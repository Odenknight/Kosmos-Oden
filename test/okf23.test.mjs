import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  OKF23_POLICY,
  buildGraph,
  buildOkf23Projection,
  parseOkf23Frontmatter,
} from "../dist/kosmos-core.mjs";

const CANONICAL_POLICY = '{"assessment_thresholds":[[0.9,"assessment:strongly-documented"],[0.75,"assessment:well-documented"],[0.6,"assessment:partially-supported"],[0.4,"assessment:weakly-supported"],[0.01,"assessment:insufficient"],[0,"assessment:invalid-or-untraceable"]],"compatible_okf_versions":["2.3"],"missing_value_behavior":"exclude-null-and-renormalize","policy_id":"policy:okf23-default-v1","policy_version":"1.0.0","sensitivity_default":"internal","weights":{"contradiction_status":0.1,"evidence_support":0.2,"provenance_quality":0.2,"relationship_integrity":0.15,"review_readiness":0.1,"structural_completeness":0.15,"temporal_freshness":0.1}}';

const note = `---
okf_version: "2.3"
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

test("OKF+ 2.3 nested parser preserves extensions and scalar types", () => {
  const parsed = parseOkf23Frontmatter(note);
  assert.equal(parsed.present, true);
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.data.okf_version, "2.3");
  assert.equal(parsed.data.epistemic.confidence, 0.35);
  assert.equal(parsed.data.sensitivity.level, "restricted");
  assert.equal(parsed.data["x-lab-extension"].sample, true);
});

test("bundled OKF+ 2.3 policy hash matches its canonical deterministic input", () => {
  assert.equal(OKF23_POLICY.hash, `sha256:${createHash("sha256").update(CANONICAL_POLICY).digest("hex")}`);
});

test("OKF+ 2.3 projection separates origins and scores documentation, not truth", () => {
  const projection = buildOkf23Projection(note, "Claims/Test.md", "abc:123", null);
  assert.ok(projection);
  assert.equal(projection.profile, "okf-plus-2.3-validating-projection");
  assert.equal(projection.authored.epistemicState, "hypothesis");
  assert.equal(projection.effective.sensitivity, "restricted");
  assert.deepEqual(projection.extensions["x-lab-extension"], { sample: true });
  assert.equal(projection.proposed.labels.length, 1);
  assert.equal(projection.approved.labels.length, 1);
  assert.ok(projection.derived.labels.includes("identity:stable"));
  assert.equal(projection.assessment.interpretation, "documentation-and-support-quality-not-truth");
  assert.equal(projection.assessment.policy.id, "policy:okf23-default-v1");
  assert.ok(projection.assessment.scores.overall > 0);
  assert.equal(projection.assessment.scores.evidence_support > 0, true);
});

test("UID-first typed relationships resolve canonically and proposed edges stay non-effective", () => {
  const target = note
    .replace("019b2d14-4230-7db7-87d4-7d81cfaec932", "019b2d14-4230-7db7-87d4-7d81cfaec933")
    .replace('title: "A governed hypothesis"', 'title: "Target"')
    .replace(/relationships:[\s\S]*?evidence:/, "relationships:\n  related_to: []\nevidence:");
  const proposed = `---
okf_version: "2.3"
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
  assert.equal(graph.okfUidIndex["019b2d14-4230-7db7-87d4-7d81cfaec933"], "file:Claims/Target.md");
  assert.ok(graph.links.some((link) => link.source === "file:Claims/Source.md" && link.target === "file:Claims/Target.md" && link.kind === "semantic" && link.label === "related_to"));
  assert.equal(graph.links.some((link) => link.source === "file:Claims/Proposal.md" && link.target === "file:Claims/Target.md" && link.kind === "semantic"), false);
});

test("duplicate UID reuse fails closed and is excluded from the UID index", () => {
  const other = note.replace("Body remains source content.", "Conflicting bytes.");
  const graph = buildGraph([
    { relativePath: "A.md", extension: "md", content: note },
    { relativePath: "B.md", extension: "md", content: other },
  ], [], Date.parse("2026-07-18T00:00:00Z"));
  assert.equal(graph.okfUidIndex["019b2d14-4230-7db7-87d4-7d81cfaec932"], undefined);
  for (const path of ["A.md", "B.md"]) {
    const projection = graph.nodes.find((node) => node.path === path).okf.projection;
    assert.ok(projection.diagnostics.some((d) => d.code === "OKF-IDENTITY-003"));
    assert.ok(projection.diagnostics.some((d) => d.code === "OKF-IDENTITY-004"));
  }
});

test("missing sensitivity defaults to internal and invalid sensitivity fails closed", () => {
  const missing = note.replace(/sensitivity:[\s\S]*?provenance:/, "provenance:");
  const p1 = buildOkf23Projection(missing, "Missing.md", "m:1", null);
  assert.equal(p1.effective.sensitivity, "internal");
  assert.ok(p1.diagnostics.some((d) => d.code === "OKF-SENSITIVITY-001"));
  const invalid = note.replace('level: "restricted"', 'level: "unclassified"');
  const p2 = buildOkf23Projection(invalid, "Invalid.md", "i:1", null);
  assert.equal(p2.effective.sensitivity, "secret");
});
