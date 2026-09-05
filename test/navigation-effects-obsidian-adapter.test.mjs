import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundled = await build({
  entryPoints: ["src/navigation-effects/obsidian-effect-adapter.ts"],
  absWorkingDir: process.cwd(),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
  logLevel: "silent",
  metafile: true,
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);

test("Obsidian profile reports deterministic, primitive-specific unavailable evidence", async () => {
  const adapter = api.createObsidianEffectHostAdapter();
  const first = await adapter.capabilities();
  const second = api.getObsidianEffectHostCapabilityReport();
  assert.equal(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(first.profile, "obsidian");
  assert.equal(first.configured, false);
  assert.equal(first.effectExecutionAvailable, false);
  assert.equal(first.automaticWriteEligible, false);
  assert.equal(first.browserViewerWriteAdapter, false);
  assert.deepEqual(first.limitationCodes, ["ADAPTER_NOT_IMPLEMENTED", "CAPABILITY_UNPROVEN", "REQUIRED_PRIMITIVE_UNPROVEN"]);
  const primitives = Object.keys(api.OBSIDIAN_EFFECT_ADAPTER_GAP_CODES);
  assert.equal(primitives.length, 14);
  assert.deepEqual(Object.keys(first.primitives), primitives);
  for (const primitive of primitives) {
    const item = first.primitives[primitive];
    assert.notEqual(item.proof, "proven", primitive);
    assert.match(item.mechanism, /^obsidian:[a-z0-9:-]+$/, primitive);
    assert.match(api.OBSIDIAN_EFFECT_ADAPTER_GAP_CODES[primitive], /^OBSIDIAN_[A-Z0-9_]+$/, primitive);
    assert.equal(Object.isFrozen(item), true);
  }
  for (const primitive of ["linkEscapeDetection", "reparseJunctionDetection", "mountEscapeDetection", "fileFlush", "directoryFlush", "sameVolumeAtomicReplace"]) {
    assert.equal(first.primitives[primitive].proof, "unsupported", primitive);
    assert.equal(first.primitives[primitive].limitationCode, "CAPABILITY_UNPROVEN", primitive);
  }
});

test("every operation returns deterministic structured unavailability without inspecting inputs", async () => {
  const adapter = api.createObsidianEffectHostAdapter();
  assert.equal(Object.isFrozen(adapter), true);
  const poisoned = new Proxy({}, { get() { throw new Error("input inspected"); } });
  const calls = [
    ["snapshot", adapter.snapshot(poisoned)],
    ["inspect-path", adapter.inspectPath(poisoned)],
    ["prepare", adapter.prepare(poisoned)],
    ["execute", adapter.execute(poisoned)],
    ["inspect-recovery", adapter.inspectRecovery()],
    ["recover", adapter.recover(poisoned)],
    ["rollback", adapter.rollback(poisoned)],
    ["shutdown", adapter.shutdown(poisoned)],
  ];
  for (const [operation, pending] of calls) {
    assert.deepEqual(await pending, {
      artifactKind: "kosmos.effect-host-unavailable",
      schemaVersion: 1,
      profile: "obsidian",
      operation,
      status: "unavailable",
      reasonCodes: ["ADAPTER_NOT_CONFIGURED", "ADAPTER_NOT_IMPLEMENTED", "REQUIRED_PRIMITIVE_UNPROVEN"],
      sourceContentIncluded: false,
    });
  }
});

test("Obsidian descriptor browser bundle has no host framework, Node executor, fs, or runtime registration", () => {
  const inputs = Object.keys(bundled.metafile.inputs).map((path) => path.replaceAll("\\", "/"));
  assert.equal(inputs.some((path) => /navigation-effects(?:-node|\/node)(?:\.|\/)/.test(path)), false);
  assert.equal(inputs.some((path) => /(?:^|\/)(?:obsidian|electron)(?:$|\/)/.test(path)), false);
  const output = bundled.outputFiles[0].text;
  assert.doesNotMatch(output, /node:(?:fs|path|os|crypto)|require\(["'](?:fs|path|os)["']\)|nodeRequire|workspace\.on|vault\.on|registerEvent/);
});
