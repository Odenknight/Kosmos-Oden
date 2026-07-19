import test from "node:test";
import assert from "node:assert/strict";
import {
  createOkfMigrationPlan,
  publicOkfMigrationPlan,
  verifyOkfMigrationPlan,
} from "../dist/kosmos-core.mjs";

const UUIDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
];

function options() {
  let i = 0;
  return {
    now: () => new Date("2026-07-14T12:00:00.000Z"),
    uuid: () => UUIDS[i++] ?? `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  };
}

const validOkf = `---
okf_version: "2.2"
uid: "11111111-1111-4111-8111-111111111111"
type: "semantic"
title: "Existing"
description: "Already conformant."
timestamp: "2026-07-01T00:00:00Z"
epistemic_state: "hypothesis"
scope: "node"
scope_id: "11111111-1111-4111-8111-111111111111"
sensitivity: "internal"
tags: []
supersedes: []
superseded_by: []
forked_from: []
forked_to: []
---
Body.
`;

const nativeOkf23 = `---
okf_version: "2.3"
uid: "019b2d14-4230-7db7-87d4-7d81cfaec932"
title: "Native"
type: "semantic"
created_at: "2026-07-01T00:00:00Z"
authorship:
  origin: "authored"
epistemic:
  state: "hypothesis"
sensitivity:
  level: "internal"
provenance: {}
relationships: {}
review: {}
assessment: {}
labels:
  authored: []
  derived: []
  proposed: []
  approved: []
---
Native body.
`;

test("OKF+ onboarding retains native 2.3, converts valid 2.2, and accepts Google's minimal OKF", async () => {
  const plan = await createOkfMigrationPlan([
    { path: "Native.md", content: nativeOkf23 },
    { path: "Existing.md", content: validOkf },
    { path: "Google.md", content: "---\ntype: Playbook\ntitle: Google-compatible\n---\nBody\n" },
    { path: "index.md", content: "# Index\n" },
  ], options());
  assert.equal(plan.totals["okf-plus-2.3"], 1);
  assert.equal(plan.totals["google-okf-0.1"], 1);
  assert.equal(plan.totals["google-reserved"], 1);
  assert.equal(plan.totals.changes, 1);
  assert.match(plan.entries.find((entry) => entry.path === "Existing.md").proposedContent, /okf_version: "2\.3"/);
  assert.match(plan.entries.find((entry) => entry.path === "Existing.md").proposedContent, /x-okf22-compatibility:\n  scope: "node"\n  scope_id: "11111111-1111-4111-8111-111111111111"/);
});

test("missing frontmatter gets conservative native OKF+ 2.3 without changing body bytes", async () => {
  const body = "# Alpha\r\n\r\nHuman text.\r\n";
  const plan = await createOkfMigrationPlan([
    { path: "Folder/Alpha.md", content: "\uFEFF" + body, createdTime: Date.parse("2025-03-04T05:06:07Z") },
  ], options());
  const entry = plan.entries[0];
  assert.equal(entry.status, "needs-okf-plus");
  assert.match(entry.proposedContent, /^\uFEFF---\r\nokf_version: "2\.3"/);
  assert.match(entry.proposedContent, /type: "semantic"/);
  assert.match(entry.proposedContent, /epistemic:\r\n  state: "hypothesis"/);
  assert.match(entry.proposedContent, /sensitivity:\r\n  level: "internal"/);
  assert.match(entry.proposedContent, /created_at: "2025-03-04T05:06:07\.000Z"/);
  assert.match(entry.proposedContent, /labels:\r\n  authored: \[\]/);
  assert.ok(entry.proposedContent.endsWith(body), "body bytes after frontmatter are preserved");
  const rescan = await createOkfMigrationPlan([{ path: "Folder/Alpha.md", content: entry.proposedContent }], options());
  assert.equal(rescan.totals["okf-plus-2.3"], 1);
  assert.equal(rescan.totals.changes, 0);
});

test("simple Obsidian properties are preserved after canonical OKF+ fields", async () => {
  const original = `---
aliases: [Alpha alias]
cssclasses: [wide]
tags: [one, one, two]
---
Text
`;
  const plan = await createOkfMigrationPlan([{ path: "Alpha.md", content: original }], options());
  const out = plan.entries[0].proposedContent;
  assert.match(out, /tags:\n  - "one"\n  - "two"/);
  assert.ok(out.indexOf("labels:") < out.indexOf("aliases: [Alpha alias]"));
  assert.match(out, /cssclasses: \[wide\]/);
  assert.ok(out.endsWith("Text\n"));
});

test("quoted hash characters and human frontmatter comments survive normalization", async () => {
  const original = `---
title: "A # B" # keep this title note
# keep this standalone note
aliases: [hash-test]
---
Body
`;
  const plan = await createOkfMigrationPlan([{ path: "Hash.md", content: original }], options());
  const out = plan.entries[0].proposedContent;
  assert.match(out, /title: "A # B"/);
  assert.match(out, /# keep this title note/);
  assert.match(out, /# keep this standalone note/);
});

test("ambiguous or destructive frontmatter is blocked instead of guessed", async () => {
  const plan = await createOkfMigrationPlan([
    { path: "Duplicate.md", content: "---\ntags: [a]\ntags: [b]\n---\nBody\n" },
    { path: "Nested.md", content: "---\nscope:\n  kind: project\n---\nBody\n" },
    { path: "Invalid-v2.2.md", content: "---\nokf_version: '2.2'\nuid: unknown\ntype: semantic\n---\nBody\n" },
    { path: "Only-delimiter.md", content: "---" },
  ], options());
  assert.equal(plan.totals.blocked, 4);
  assert.equal(plan.totals.changes, 0);
  assert.ok(plan.entries.every((e) => e.proposedContent == null));
  assert.ok(plan.entries.every((e) => e.review.required));
  assert.ok(plan.entries.every((e) => e.review.confidence <= 0.25));
  assert.ok(plan.entries.every((e) => e.review.reasons.length > 0));
});

test("upgrade-all converts recoverable legacy notes and preserves overridden values in salvage", async () => {
  const legacy = `---
okf_version: "2.1"
uid: unknown
id: unknown
type: memo
title: Legacy
timestamp: yesterday
epistemic_state: inferred
scope: somewhere
sensitivity: secret
tags: [legacy]
---
Body remains exact.
`;
  const unsafe = `---
okf_version: "2.1"
type: semantic
related_to: [not-a-wikilink]
---
Unsafe
`;
  const plan = await createOkfMigrationPlan([
    { path: "Google.md", content: "---\nid: 22222222-2222-4222-8222-222222222222\ntype: Playbook\ntitle: Google-compatible\n---\nBody\n" },
    { path: "index.md", content: "# Reserved index\n" },
    { path: "Legacy.md", content: legacy, createdTime: Date.parse("2025-01-02T03:04:05Z") },
    { path: "Unsafe.md", content: unsafe },
  ], { ...options(), mode: "upgrade-all" });

  assert.equal(plan.schema, "okf-plus-migration-plan/3");
  assert.equal(plan.mode, "upgrade-all");
  assert.equal(plan.totals.changes, 3);
  assert.equal(plan.totals.blocked, 1);
  const google = plan.entries.find((entry) => entry.path === "Google.md");
  assert.match(google.proposedContent, /okf_version: "2\.3"/);
  assert.match(google.proposedContent, /uid: "22222222-2222-4222-8222-222222222222"/);
  assert.doesNotMatch(google.proposedContent, /^id:/m);
  assert.match(google.proposedContent, /type: "semantic"/);
  assert.ok(google.findings.some((finding) => finding.code === "upgrade-google-okf"));
  const reserved = plan.entries.find((entry) => entry.path === "index.md");
  assert.equal(reserved.status, "needs-okf-plus");
  assert.ok(reserved.findings.some((finding) => finding.code === "upgrade-google-reserved"));
  const upgraded = plan.entries.find((entry) => entry.path === "Legacy.md");
  assert.match(upgraded.proposedContent, /uid: "00000000-0000-4000-8000-00000000000/);
  assert.match(upgraded.proposedContent, /epistemic:\n  state: "hypothesis"/);
  assert.match(upgraded.proposedContent, /sensitivity:\n  level: "internal"/);
  assert.ok(upgraded.proposedContent.endsWith("Body remains exact.\n"));
  assert.ok(upgraded.salvage.some((record) => record.field === "okf_version" && record.originalValue === "2.1"));
  assert.ok(upgraded.salvage.some((record) => record.field === "uid" && record.originalValue === "unknown"));
  assert.ok(upgraded.salvage.some((record) => record.field === "id" && record.originalValue === "unknown"));
  assert.doesNotMatch(upgraded.proposedContent, /^id:/m);
  assert.equal(upgraded.review.basis, "deterministic-migration-safety");
  assert.equal(upgraded.review.required, false);
  assert.ok(upgraded.review.confidence < 0.9);
  const blocked = plan.entries.find((entry) => entry.path === "Unsafe.md");
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.review.required, true);
  assert.ok(blocked.review.reasons.some((finding) => finding.code === "unsafe-explicit-related_to"));
});

test("duplicate OKF+ UIDs are a global blocking conflict", async () => {
  const two = validOkf.replace("title: \"Existing\"", "title: \"Second\"");
  const plan = await createOkfMigrationPlan([
    { path: "One.md", content: validOkf },
    { path: "Two.md", content: two },
  ], options());
  assert.equal(plan.totals.blocked, 2);
  assert.ok(plan.entries.every((e) => e.findings.some((f) => f.code === "duplicate-uid")));
});

test("persistable plan binds hashes but never includes note contents", async () => {
  const plan = await createOkfMigrationPlan([{ path: "Secret.md", content: "TOP SECRET BODY" }], options());
  assert.match(plan.planHash, /^[0-9a-f]{64}$/);
  const persisted = JSON.stringify(publicOkfMigrationPlan(plan));
  assert.doesNotMatch(persisted, /TOP SECRET BODY/);
  assert.match(persisted, /originalHash/);
  assert.match(persisted, /proposedHash/);
  assert.match(persisted, /deterministic-migration-safety/);
  assert.equal(await verifyOkfMigrationPlan(plan), true);
  const originalConfidence = plan.entries[0].review.confidence;
  plan.entries[0].review.confidence = 0;
  assert.equal(await verifyOkfMigrationPlan(plan), false, "review confidence is covered by the plan hash");
  plan.entries[0].review.confidence = originalConfidence;
  assert.equal(await verifyOkfMigrationPlan(plan), true);
  plan.entries[0].proposedContent += "tampered";
  assert.equal(await verifyOkfMigrationPlan(plan), false);
});

test("nonempty relationship lists become origin-bearing OKF+ 2.3 relationships", async () => {
  const input = validOkf.replace("forked_to: []", "forked_to: []\nrelated_to: [\"[[Neighbor]]\"]");
  const plan = await createOkfMigrationPlan([{ path: "Existing.md", content: input }], options());
  assert.equal(plan.entries[0].status, "needs-okf-plus");
  assert.match(plan.entries[0].proposedContent, /relationships:\n  related_to:\n    - target: "\[\[Neighbor\]\]"\n      origin: "authored"/);
});
