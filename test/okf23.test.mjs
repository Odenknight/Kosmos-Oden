import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph, parseFrontmatter, projectOkf23 } from "../dist/kosmos-core.mjs";

const note = `---
okf_version: "2.3"
uid: "019b2d14-4230-7db7-87d4-7d81cfaec932"
title: Claim
type: semantic
created_at: "2026-07-16T00:00:00Z"
epistemic:
  state: hypothesis
sensitivity:
  level: restricted
provenance:
  source_kind: paper
  source_locator: doi:example
labels:
  authored:
    - use:research
x-lab:
  calibration: alpha
---
Body`;

test("OKF+ 2.3 nested blocks and extensions are preserved", () => {
  const { data, content } = parseFrontmatter(note);
  assert.deepEqual(data.epistemic, { state: "hypothesis" });
  assert.deepEqual(data["x-lab"], { calibration: "alpha" });
  const p = projectOkf23(data, content, "Claim.md");
  assert.equal(p.profile, "OKF+ v2.3 Validating Projection Profile");
  assert.equal(p.derived.effectiveSensitivity, "restricted");
  assert.deepEqual(p.labels.authored, ["use:research"]);
  assert.deepEqual(p.extensions["x-lab"], { calibration: "alpha" });
  assert.equal(p.assessment.meaning, "documentation-and-support-quality-not-truth");
});

test("strict mode reports missing v2.3 identity without mutating source", () => {
  const raw = { okf_version: "2.3", title: "No UID" };
  const before = JSON.stringify(raw);
  const p = projectOkf23(raw, "Body", "No UID.md", "strict-v2.3");
  assert.ok(p.diagnostics.some((d) => d.code === "OKF-IDENTITY-001" && d.severity === "error"));
  assert.equal(JSON.stringify(raw), before);
});

test("duplicate UIDs are diagnosed on each graph node and never merged", () => {
  const fm = `---\nokf_version: "2.3"\nuid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\ntype: semantic\n---\n`;
  const graph = buildGraph([{ relativePath:"A.md", content:fm+"A" }, { relativePath:"B.md", content:fm+"B" }], []);
  const files = graph.nodes.filter((n) => n.kind === "file");
  assert.equal(files.length, 2);
  assert.ok(files.every((n) => n.okf.governance.diagnostics.some((d) => d.code === "OKF-IDENTITY-003")));
});
