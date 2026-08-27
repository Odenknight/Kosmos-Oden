import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundled = await build({
  entryPoints: ["src/navigation-effects/native-effect-adapter.ts"],
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

const operations = [
  ["snapshot", (adapter) => adapter.snapshot({})],
  ["inspect-path", (adapter) => adapter.inspectPath({})],
  ["prepare", (adapter) => adapter.prepare({})],
  ["execute", (adapter) => adapter.execute({})],
  ["inspect-recovery", (adapter) => adapter.inspectRecovery()],
  ["recover", (adapter) => adapter.recover({})],
  ["rollback", (adapter) => adapter.rollback({})],
  ["shutdown", (adapter) => adapter.shutdown(new AbortController().signal)],
];

test("standalone-native evidence records the exact deterministic blockers", async () => {
  const first = api.getStandaloneNativeEffectAdapterEvidence();
  const second = api.getStandaloneNativeEffectAdapterEvidence();
  assert.strictEqual(second, first);
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(first.limitations.map((item) => item.code), [
    "AUTHORIZED_RECOVERY_UNAVAILABLE",
    "COOPERATIVE_VAULT_THREAT_MODEL_ONLY",
    "DEADLINE_SHUTDOWN_UNAVAILABLE",
    "DIRECTORY_FLUSH_UNPROVEN",
    "READ_ONLY_INSPECTION_UNAVAILABLE",
    "SPLIT_PREPARE_EXECUTE_UNAVAILABLE",
  ]);
  for (const limitation of first.limitations) {
    assert.equal(Object.isFrozen(limitation), true);
    assert.equal(Object.isFrozen(limitation.affectedOperations), true);
  }
  assert.equal(first.implemented, false);
  assert.equal(first.configured, false);
  assert.equal(first.effectExecutionAvailable, false);
  assert.equal(first.engineNodeExecutorImported, false);
  assert.equal(first.writerRuntimeEndpointExposed, false);
  assert.equal(first.browserViewerWriteAdapter, false);
  assert.equal(first.sourceContentIncluded, false);

  const report = first.capabilityReport;
  assert.equal(report.configured, false);
  assert.equal(report.effectExecutionAvailable, false);
  assert.equal(report.automaticWriteEligible, false);
  assert.deepEqual(report.primitives.exactByteSnapshot, {
    proof: "unsupported",
    mechanism: "read-only-inspection-api-missing",
    limitationCode: "CAPABILITY_UNPROVEN",
  });
  assert.deepEqual(report.primitives.durablePreparedIntent, {
    proof: "unsupported",
    mechanism: "split-prepare-api-missing",
    limitationCode: "CAPABILITY_UNPROVEN",
  });
  assert.deepEqual(report.primitives.startupRecovery, {
    proof: "unsupported",
    mechanism: "authorized-recovery-api-missing",
    limitationCode: "CAPABILITY_UNPROVEN",
  });
  assert.deepEqual(report.primitives.safeShutdown, {
    proof: "unsupported",
    mechanism: "deadline-shutdown-api-missing",
    limitationCode: "CAPABILITY_UNPROVEN",
  });
  assert.deepEqual(report.primitives.directoryFlush, {
    proof: "unsupported",
    mechanism: "directory-flush-not-proven",
    limitationCode: "CAPABILITY_UNPROVEN",
  });
});

test("every standalone-native host operation is unavailable", async () => {
  const adapter = api.createStandaloneNativeEffectAdapter();
  assert.equal(adapter.profile, "standalone-native");
  assert.strictEqual(await adapter.capabilities(), api.getStandaloneNativeEffectAdapterEvidence().capabilityReport);
  for (const [operation, call] of operations) {
    const result = await call(adapter);
    assert.deepEqual(result, {
      artifactKind: "kosmos.effect-host-unavailable",
      schemaVersion: 1,
      profile: "standalone-native",
      operation,
      status: "unavailable",
      reasonCodes: ["ADAPTER_NOT_IMPLEMENTED", "OPERATION_UNSUPPORTED", "REQUIRED_PRIMITIVE_UNPROVEN"],
      sourceContentIncluded: false,
    });
  }
});

test("standalone-native bundle contains no Node executor, filesystem, or runtime endpoint", () => {
  const inputs = Object.keys(bundled.metafile.inputs).map((path) => path.replaceAll("\\", "/"));
  assert.equal(inputs.some((path) => /gkos-engine\/navigation-effects\/node|navigation-effects-node/.test(path)), false);
  assert.equal(inputs.some((path) => /(?:^|\/)(?:node:)?(?:fs|path|os|http|https)(?:$|\/)/.test(path)), false);
  const output = bundled.outputFiles[0].text;
  assert.doesNotMatch(output, /node:(?:fs|path|os|http|https)|createServer|listen\s*\(|writeFile|rename\s*\(/);
});
