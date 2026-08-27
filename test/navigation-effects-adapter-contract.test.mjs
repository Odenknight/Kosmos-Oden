import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundled = await build({
  entryPoints: ["src/navigation-effects/effect-adapter.ts"],
  absWorkingDir: process.cwd(),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  write: false,
  logLevel: "silent",
  metafile: true,
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);

const provenPrimitives = () => Object.fromEntries(
  api.EFFECT_HOST_CAPABILITY_PRIMITIVES.map((primitive) => [primitive, { proof: "proven", mechanism: `test:${primitive}` }]),
);

test("capability normalization is deterministic, ordered, and automatic-write fail closed", () => {
  const input = { configured: true, primitives: provenPrimitives(), limitationCodes: [] };
  const first = api.normalizeEffectHostCapabilityReport("obsidian", input);
  const second = api.normalizeEffectHostCapabilityReport("obsidian", {
    ...input,
    primitives: Object.fromEntries(Object.entries(input.primitives).reverse()),
  });
  assert.deepEqual(second, first);
  assert.equal(first.configured, true);
  assert.equal(first.effectExecutionAvailable, true);
  assert.equal(first.automaticWriteEligible, false);
  assert.equal(first.browserViewerWriteAdapter, false);
  assert.equal(first.sourceContentIncluded, false);
  assert.equal(api.serializeEffectHostCapabilityReport(first), `${JSON.stringify(first)}\n`);
  assert.deepEqual(api.validateEffectHostCapabilityReport("obsidian", first), {
    valid: true,
    reasonCodes: [],
    normalized: first,
  });
});

test("missing or malformed capability evidence stays unavailable", () => {
  const missing = api.normalizeEffectHostCapabilityReport("standalone-native", { configured: true });
  assert.equal(missing.configured, false);
  assert.equal(missing.effectExecutionAvailable, false);
  assert.equal(missing.automaticWriteEligible, false);
  assert.ok(missing.limitationCodes.includes("CAPABILITY_UNPROVEN"));
  assert.ok(missing.limitationCodes.includes("REQUIRED_PRIMITIVE_UNPROVEN"));
  for (const evidence of Object.values(missing.primitives)) assert.equal(evidence.proof, "unavailable");

  const malformed = api.normalizeEffectHostCapabilityReport("obsidian", {
    configured: true,
    primitives: { ...provenPrimitives(), fileFlush: { proof: "probably", mechanism: "x" } },
  });
  assert.equal(malformed.configured, false);
  assert.deepEqual(malformed.primitives.fileFlush, {
    proof: "unavailable",
    limitationCode: "CAPABILITY_EVIDENCE_INVALID",
  });
  assert.equal(api.validateEffectHostCapabilityReport("obsidian", { ...malformed, automaticWriteEligible: true }).valid, false);

  const noMechanismPrimitives = provenPrimitives();
  delete noMechanismPrimitives.fileFlush.mechanism;
  const noMechanism = api.normalizeEffectHostCapabilityReport("obsidian", {
    configured: true,
    primitives: noMechanismPrimitives,
  });
  assert.equal(noMechanism.configured, false);
  assert.deepEqual(noMechanism.primitives.fileFlush, {
    proof: "unavailable",
    limitationCode: "CAPABILITY_EVIDENCE_INVALID",
  });
});

test("capability validation rejects noncanonical and normalization-masked reports", () => {
  const canonical = api.normalizeEffectHostCapabilityReport("obsidian", {
    configured: true,
    primitives: provenPrimitives(),
  });
  const unavailable = api.normalizeEffectHostCapabilityReport("obsidian", { configured: true });
  const clone = (value) => structuredClone(value);
  const adversarial = [];

  const missingLimitations = clone(canonical);
  delete missingLimitations.limitationCodes;
  adversarial.push(["missing limitationCodes", missingLimitations]);

  adversarial.push(["unknown top-level field", { ...clone(canonical), trusted: true }]);

  const missingPrimitive = clone(canonical);
  delete missingPrimitive.primitives.fileFlush;
  adversarial.push(["missing primitive", missingPrimitive]);

  const unknownPrimitive = clone(canonical);
  unknownPrimitive.primitives.browserFilesystem = { proof: "proven" };
  adversarial.push(["unknown primitive", unknownPrimitive]);

  const unknownEvidenceField = clone(canonical);
  unknownEvidenceField.primitives.fileFlush.trusted = true;
  adversarial.push(["unknown evidence field", unknownEvidenceField]);

  const missingMechanism = clone(canonical);
  delete missingMechanism.primitives.fileFlush.mechanism;
  adversarial.push(["proven evidence without mechanism", missingMechanism]);

  const maskedEvidence = clone(unavailable);
  delete maskedEvidence.primitives.fileFlush.limitationCode;
  adversarial.push(["evidence normalized by adding a limitation", maskedEvidence]);

  const duplicateLimitations = clone(unavailable);
  duplicateLimitations.limitationCodes.push(duplicateLimitations.limitationCodes[0]);
  adversarial.push(["duplicate limitations", duplicateLimitations]);

  const reversedLimitations = clone(unavailable);
  reversedLimitations.limitationCodes.reverse();
  adversarial.push(["noncanonical limitation order", reversedLimitations]);

  const unknownLimitation = clone(canonical);
  unknownLimitation.limitationCodes = ["HOST_SAYS_FINE"];
  adversarial.push(["unknown limitation", unknownLimitation]);

  adversarial.push(["selected profile mismatch", { ...clone(canonical), profile: "standalone-native" }]);
  adversarial.push(["derived availability mismatch", { ...clone(canonical), effectExecutionAvailable: false }]);
  adversarial.push(["contradictory configured limitation", { ...clone(canonical), limitationCodes: ["ADAPTER_NOT_IMPLEMENTED"] }]);

  for (const [name, candidate] of adversarial) {
    const validation = api.validateEffectHostCapabilityReport("obsidian", candidate);
    assert.equal(validation.valid, false, name);
    assert.ok(validation.reasonCodes.includes("CAPABILITY_EVIDENCE_INVALID") || validation.reasonCodes.includes("REQUIRED_PRIMITIVE_UNPROVEN"), name);
  }
});

test("the unavailable adapter returns bounded structured unavailability for every operation", async () => {
  const adapter = api.createUnavailableEffectHostAdapter("obsidian", [
    "OPERATION_UNSUPPORTED",
    "ADAPTER_NOT_IMPLEMENTED",
    "OPERATION_UNSUPPORTED",
  ]);
  assert.equal(Object.isFrozen(adapter), true);
  const capability = await adapter.capabilities();
  assert.equal(capability.configured, false);
  assert.equal(capability.effectExecutionAvailable, false);
  assert.equal(capability.automaticWriteEligible, false);

  const calls = [
    ["snapshot", adapter.snapshot({})],
    ["inspect-path", adapter.inspectPath({})],
    ["prepare", adapter.prepare({})],
    ["execute", adapter.execute({})],
    ["inspect-recovery", adapter.inspectRecovery()],
    ["recover", adapter.recover({})],
    ["rollback", adapter.rollback({})],
    ["shutdown", adapter.shutdown(new AbortController().signal)],
  ];
  for (const [operation, pending] of calls) {
    const result = await pending;
    assert.deepEqual(result, {
      artifactKind: "kosmos.effect-host-unavailable",
      schemaVersion: 1,
      profile: "obsidian",
      operation,
      status: "unavailable",
      reasonCodes: ["ADAPTER_NOT_IMPLEMENTED", "OPERATION_UNSUPPORTED"],
      sourceContentIncluded: false,
    });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(result.reasonCodes.length <= 8, true);
  }
});

test("only trusted host profiles exist and invalid runtime profiles are rejected", () => {
  assert.equal(api.isEffectHostProfile("obsidian"), true);
  assert.equal(api.isEffectHostProfile("standalone-native"), true);
  for (const profile of ["browser", "viewer", "mcp", "node", ""]) {
    assert.equal(api.isEffectHostProfile(profile), false);
    assert.throws(() => api.createUnavailableEffectHostAdapter(profile), /EFFECT_HOST_PROFILE_INVALID/);
  }
});

test("contract bundle has no Node executor, host framework, or filesystem import", () => {
  const inputs = Object.keys(bundled.metafile.inputs).map((path) => path.replaceAll("\\", "/"));
  assert.equal(inputs.some((path) => /navigation-effects(?:-node|\/node)(?:\.|\/)/.test(path)), false);
  assert.equal(inputs.some((path) => /(?:^|\/)(?:obsidian|electron)(?:$|\/)/.test(path)), false);
  assert.doesNotMatch(bundled.outputFiles[0].text, /node:(?:fs|path|os|crypto)|require\(["'](?:fs|path|os)["']\)/);
});
