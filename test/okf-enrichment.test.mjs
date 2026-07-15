import test from "node:test";
import assert from "node:assert/strict";
import { assessOkfEvidence, deterministicOkfSuggestions, selectOkfEvidenceWindow, validateLlmEnrichmentResponse } from "../dist/kosmos-core.mjs";

test("evidence window excludes code/tables and selects bounded reproducible prose", async () => {
  const note = [
    "---", 'okf_version: "2.2"', "---", "# Build guide", "",
    "| key | value |", "|---|---|", "", "```sh", "rm -rf pretend", "```", "",
    "This guide explains the controlled deployment process and the evidence that an operator must review before release.", "",
    "This version supersedes [[Older Guide]] and records the explicit reason for replacement.", "", "#tag-one #tag-two",
  ].join("\n");
  const first = await selectOkfEvidenceWindow(note, { maxParagraphs: 2, maxChars: 500 });
  const second = await selectOkfEvidenceWindow(note, { maxParagraphs: 2, maxChars: 500 });
  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
  assert.doesNotMatch(first.map((block) => block.text).join(" "), /rm -rf|key \| value/);
  assert.ok(first.every((block) => /^sha256:[0-9a-f]{64}$/.test(block.fingerprint)));
  const suggestions = deterministicOkfSuggestions(first);
  assert.ok(suggestions.some((item) => item.field === "supersedes" && item.value === "[[Older Guide]]"));
  assert.ok(suggestions.every((item) => item.source === "deterministic"));
});

test("LLM response validation rejects unsupported, ungrounded, and excessive proposals", async () => {
  const blocks = await selectOkfEvidenceWindow("A sufficiently long paragraph supplies bounded evidence for a controlled metadata proposal and nothing else.");
  const result = validateLlmEnrichmentResponse({ suggestions: [
    { field: "description", value: "Grounded summary", confidence: 0.7, reason: "Supported by the only block", evidenceBlockIds: [1] },
    { field: "delete_note", value: "yes", confidence: 1, reason: "bad", evidenceBlockIds: [1] },
    { field: "supersedes", value: "[[Invented]]", confidence: 0.9, reason: "no evidence id", evidenceBlockIds: [] },
    { field: "tags", value: ["one", 2, "two"], confidence: 4, reason: "invalid confidence", evidenceBlockIds: [1] },
  ] }, blocks, 2);
  assert.equal(result.length, 1);
  assert.equal(result[0].field, "description");
  assert.equal(result[0].source, "llm");
});

test("LLM cannot propose governance authority or invent relationship targets", async () => {
  const blocks = await selectOkfEvidenceWindow("This controlled guide supersedes [[Old Guide]] because the former process is obsolete and should no longer be used.");
  const result = validateLlmEnrichmentResponse({ suggestions: [
    { field: "sensitivity", value: "public", confidence: 1, reason: "model decided", evidenceBlockIds: [1] },
    { field: "supersedes", value: "[[Invented Guide]]", confidence: 0.9, reason: "not actually named", evidenceBlockIds: [1] },
    { field: "supersedes", value: "[[Old Guide]]", confidence: 0.8, reason: "explicitly named after supersedes", evidenceBlockIds: [1] },
    { field: "related_to", value: "[[Missing Link]]", confidence: 0.8, reason: "not present", evidenceBlockIds: [1] },
  ] }, blocks, 12);
  assert.deepEqual(result.map((item) => [item.field, item.value]), [["supersedes", "[[Old Guide]]"]]);
});

test("insufficient structure is reported as fallback evidence, not semantic certainty", async () => {
  const blocks = await selectOkfEvidenceWindow("12345 67890 12345 67890 12345 67890 12345 67890");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].selectionRule, "fallback-prose");
  const description = deterministicOkfSuggestions(blocks).find((item) => item.field === "description");
  assert.ok(description);
  assert.ok(description.confidence < 0.7);
  const assessment = assessOkfEvidence(blocks);
  assert.equal(assessment.status, "weak");
  assert.ok(assessment.reasons.some((reason) => /fallback/i.test(reason)));
});
