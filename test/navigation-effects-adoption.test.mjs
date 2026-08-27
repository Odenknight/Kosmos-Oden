import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

async function bundleEntry(entryPoint) {
  const result = await build({
    entryPoints: [entryPoint],
    absWorkingDir: process.cwd(),
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    write: false,
    logLevel: "silent",
    metafile: true,
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
  return { result, module };
}

const bundles = await Promise.all([
  bundleEntry("src/navigation-effects/adoption-registry.ts"),
  bundleEntry("src/navigation-effects/adoption-plan.ts"),
  bundleEntry("src/navigation-effects/in-memory-adoption-store.ts"),
]);
const api = Object.assign({}, ...bundles.map((item) => item.module));

const digest = (char) => `sha256:${char.repeat(64)}`;
const actor = { actorId: "operator-1", actorType: "human", displayName: "Operator" };
const configDigest = digest("a"), policyDigest = digest("b");
const lf = `Human prefix\n<!-- gkos:moc generated:start version=1 config=${configDigest} -->\ngenerated body\n<!-- gkos:moc generated:end -->\nHuman suffix\n`;
const crlf = lf.replaceAll("\n", "\r\n");
const candidate = "<!-- gkos-navigation:managed:start -->\nfresh generated body\n<!-- gkos-navigation:managed:end -->";

function mergedRegionBytes(currentBytes) {
  const markerStart = currentBytes.indexOf("<!-- gkos:moc generated:start");
  const markerEnd = currentBytes.indexOf("<!-- gkos:moc generated:end -->") + "<!-- gkos:moc generated:end -->".length;
  const generated = `<!-- gkos:moc generated:start version=1 config=${configDigest} -->\nfresh generated body\n<!-- gkos:moc generated:end -->`;
  return currentBytes.slice(0, markerStart) + generated + currentBytes.slice(markerEnd);
}

async function preview(overrides = {}) {
  const registry = overrides.registry ?? await api.createEmptyAdoptionRegistry();
  return api.planMocAdoption({ operationId: "op-1", targetPath: "MOCs/Alpha.md", currentBytes: lf, candidateBytes: candidate, ownership: "region-managed", policyDigest, configDigest, actor, registry, ...overrides });
}

function confirmationInput(previewValue, registry, overrides = {}) {
  return {
    preview: previewValue,
    registry,
    rereadBytes: lf,
    currentTargetPath: previewValue.targetPath,
    currentProposedDigest: previewValue.proposedDigest,
    currentPolicyDigest: previewValue.policyDigest,
    currentConfigDigest: previewValue.configDigest,
    actor,
    credentialId: "cred-1",
    confirmed: true,
    occurredAt: "2026-08-27T12:00:00Z",
    ...overrides,
  };
}

test("every unbound MOC is unmanaged and unmanaged adoption cannot confirm", async () => {
  const registry = await api.createEmptyAdoptionRegistry();
  assert.equal(registry.bindings.length, 0);
  assert.equal(registry.generation, 0);
  assert.equal(registry.predecessorDigest, undefined);
  const plan = await preview({ ownership: "unmanaged", registry });
  assert.equal(plan.confirmable, false);
  assert.ok(plan.reasonCodes.includes("UNMANAGED_NOT_ADOPTABLE"));
  assert.equal(plan.binding.ownership, "unmanaged");
  await assert.rejects(
    api.confirmMocAdoption(confirmationInput(plan, registry)),
    /NOT_CONFIRMABLE/,
  );
});

test("region, full, and creation-authorized bindings remain distinct", async () => {
  const region = (await preview()).binding;
  const full = (await preview({ ownership: "fully-managed" })).binding;
  const create = { ...full, creationAuthorized: true };
  assert.equal(region.ownership, "region-managed");
  assert.ok(region.generatedRegion);
  assert.equal(region.creationAuthorized, undefined);
  assert.equal(full.ownership, "fully-managed");
  assert.equal(full.generatedRegion, undefined);
  assert.equal(full.creationAuthorized, undefined);
  assert.equal(create.ownership, "fully-managed");
  assert.equal(create.generatedRegion, undefined);
  assert.equal(create.creationAuthorized, true);
  assert.notDeepEqual(region, full);
  assert.notDeepEqual(full, create);
});

test("region adoption preserves LF and CRLF human prefix/suffix byte-exactly", async () => {
  for (const bytes of [lf, crlf]) {
    const plan = await preview({ currentBytes: bytes });
    assert.equal(plan.confirmable, true, plan.reasonCodes.join(","));
    assert.equal(plan.preservedHumanPrefix, bytes.slice(0, bytes.indexOf("<!-- gkos:moc")));
    const end = bytes.indexOf("<!-- gkos:moc generated:end -->") + "<!-- gkos:moc generated:end -->".length;
    assert.equal(plan.preservedHumanSuffix, bytes.slice(end));
    assert.equal(plan.binding.ownership, "region-managed");
    const expectedProposed = mergedRegionBytes(bytes);
    assert.equal(plan.proposedDigest, await api.sha256Text(expectedProposed));
    assert.match(plan.exactDiff, new RegExp(JSON.stringify(expectedProposed).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const full = await preview({ ownership: "fully-managed" });
  assert.equal(full.preservedHumanPrefix, "");
  assert.equal(full.preservedHumanSuffix, "");
});

test("malformed, missing, nested, duplicate, and configuration-mismatched markers fail closed", async () => {
  const start = `<!-- gkos:moc generated:start version=1 config=${configDigest} -->`;
  const end = "<!-- gkos:moc generated:end -->";
  const cases = [
    ["plain MOC", "MARKER_MISSING"],
    [`${lf}${lf}`, "MARKER_DUPLICATED"],
    [`${start}\n${start}\nbody\n${end}\n${end}`, "MARKER_NESTED"],
    [lf.replace("version=1", "version=2"), "MARKER_MALFORMED"],
    [lf.replace(configDigest, digest("c")), "MARKER_CONFIG_MISMATCH"],
    [lf.replace(end, "<!-- gkos:moc generated:end version=1 -->"), "MARKER_MISSING"],
  ];
  for (const [currentBytes, reason] of cases) {
    const plan = await preview({ currentBytes });
    assert.equal(plan.confirmable, false, reason);
    assert.ok(plan.reasonCodes.includes(reason), `${reason}: ${plan.reasonCodes.join(",")}`);
  }
});

test("region adoption requires one unambiguous Engine Navigation candidate region", async () => {
  for (const candidateBytes of [
    "plain candidate",
    "<!-- gkos-navigation:managed:start -->\nmissing end",
    "<!-- gkos-navigation:managed:end -->\nmissing start",
    `${candidate}\n${candidate}`,
  ]) {
    const plan = await preview({ candidateBytes });
    assert.equal(plan.confirmable, false, candidateBytes);
  }
});

test("path hazards, operational roots, and case or Unicode collisions fail closed", async () => {
  for (const targetPath of [
    "../Alpha.md", "/MOCs/Alpha.md", "C:/MOCs/Alpha.md", "//server/share/Alpha.md",
    "MOCs\\Alpha.md", "MOCs/%2e%2e/Alpha.md", "MOCs//Alpha.md", "MOCs/CON.md",
    "MOCs/Alpha.md. ", ".gkx/effects/Alpha.md", "_archive/moc-runs/run/Alpha.md",
  ]) {
    assert.equal((await preview({ targetPath })).confirmable, false, targetPath);
  }
  const caseCollision = await preview({ existingPaths: ["mocs/alpha.md"] });
  assert.equal(caseCollision.confirmable, false);
  assert.ok(caseCollision.reasonCodes.includes("PATH_CASE_OR_UNICODE_COLLISION"));
  const unicodeCollision = await preview({ targetPath: "MOCs/Cafe\u0301.md", existingPaths: ["MOCs/Caf\u00e9.md"] });
  assert.equal(unicodeCollision.confirmable, false);
  assert.ok(unicodeCollision.reasonCodes.includes("PATH_CASE_OR_UNICODE_COLLISION"));
  assert.ok(unicodeCollision.reasonCodes.includes("TARGET_PATH_NOT_CANONICAL"));
});

test("confirmation rechecks credential, target, candidate, policy, configuration, actor, and collisions", async () => {
  const registry = await api.createEmptyAdoptionRegistry();
  const plan = await preview({ registry });
  await assert.rejects(api.confirmMocAdoption(confirmationInput(plan, registry, { credentialId: "" })), /CREDENTIAL_BOUND/);
  for (const changed of [
    { rereadBytes: `${lf}external` },
    { rereadBytes: lf.replace("generated body", "moved or changed body") },
    { currentTargetPath: "MOCs/Other.md" },
    { currentProposedDigest: digest("c") },
    { currentPolicyDigest: digest("c") },
    { currentConfigDigest: digest("c") },
    { actor: { ...actor, actorId: "operator-2" } },
    { currentExistingPaths: ["mocs/alpha.md"] },
  ]) {
    await assert.rejects(api.confirmMocAdoption(confirmationInput(plan, registry, changed)), /STALE/, JSON.stringify(changed));
  }
});

test("adoption is deterministic and idempotent for the same operation ID", async () => {
  const registry = await api.createEmptyAdoptionRegistry();
  const planA = await preview({ registry });
  const planB = await preview({ registry });
  assert.deepEqual(planB, planA);
  const confirmation = confirmationInput(planA, registry);
  const confirmedA = await api.confirmMocAdoption(confirmation);
  const confirmedB = await api.confirmMocAdoption(confirmation);
  assert.deepEqual(confirmedB, confirmedA);
  const store = new api.InMemoryAdoptionStore(registry);
  await store.commit(registry.registryDigest, confirmedA.registry, confirmedA.receipt);
  await store.commit(registry.registryDigest, confirmedB.registry, confirmedB.receipt);
  assert.equal(store.load().generation, 1);
  assert.deepEqual(store.receipt(confirmedA.receipt.receiptId), confirmedA.receipt);
});

test("adoption receipt binds exact registry generation and contains no source note", async () => {
  const registry = await api.createEmptyAdoptionRegistry();
  const plan = await preview({ registry });
  const confirmed = await api.confirmMocAdoption(confirmationInput(plan, registry));
  assert.equal(confirmed.receipt.sourceContentIncluded, false);
  assert.equal("currentBytes" in confirmed.receipt, false);
  assert.equal("candidateBytes" in confirmed.receipt, false);
  assert.equal("sourceBytes" in confirmed.receipt, false);
  assert.equal(confirmed.receipt.priorRegistryDigest, registry.registryDigest);
  assert.equal(confirmed.receipt.newRegistryDigest, confirmed.registry.registryDigest);
  assert.equal(confirmed.receipt.newRegistryGeneration, 1);
  assert.equal(confirmed.registry.predecessorDigest, registry.registryDigest);
  assert.equal(confirmed.registry.bindings[0].adoptionReceiptId, confirmed.receipt.receiptId);
  const store = new api.InMemoryAdoptionStore(registry);
  assert.equal("write" in store, false);
  assert.equal("execute" in store, false);
  assert.equal("saveSource" in store, false);
  await assert.rejects(async () => store.commit(digest("f"), confirmed.registry, confirmed.receipt), /STALE/);
  await store.commit(registry.registryDigest, confirmed.registry, confirmed.receipt);
  assert.equal(store.load().generation, 1);
});

test("target, policy, config, actor, and registry changes invalidate the preview binding", async () => {
  const registry = await api.createEmptyAdoptionRegistry();
  const plan = await preview({ registry });
  const actorDigest = await api.canonicalDigest(actor);
  const exact = {
    targetPath: plan.targetPath,
    targetDigest: plan.currentDigest,
    proposedDigest: plan.proposedDigest,
    policyDigest,
    configDigest,
    actorDigest,
    registryDigest: registry.registryDigest,
    existingPaths: [],
  };
  assert.equal(api.previewStillCurrent(plan, exact), true);
  for (const key of ["targetDigest", "proposedDigest", "policyDigest", "configDigest", "actorDigest", "registryDigest"]) {
    assert.equal(api.previewStillCurrent(plan, { ...exact, [key]: digest("e") }), false, key);
  }
  assert.equal(api.previewStillCurrent(plan, { ...exact, targetPath: "MOCs/Other.md" }), false, "targetPath");
  assert.equal(api.previewStillCurrent(plan, { ...exact, existingPaths: ["mocs/alpha.md"] }), false, "existingPaths");
});

test("registry corruption and operation-ID receipt mismatch fail closed", async () => {
  const registry = await api.createEmptyAdoptionRegistry();
  const plan = await preview({ registry });
  const confirmed = await api.confirmMocAdoption(confirmationInput(plan, registry));
  const corrupt = { ...registry, bindings: [{ schemaVersion: 1, targetPath: 42, ownership: "fully-managed" }] };
  assert.equal((await api.validateAdoptionRegistry(corrupt)).valid, false);
  await assert.rejects(api.confirmMocAdoption(confirmationInput(plan, corrupt)), /REGISTRY_INVALID/);
  const store = new api.InMemoryAdoptionStore(registry);
  await store.commit(registry.registryDigest, confirmed.registry, confirmed.receipt);
  const mismatched = { ...confirmed.receipt, receiptId: "adoption:different", receiptDigest: digest("d") };
  await assert.rejects(store.commit(confirmed.registry.registryDigest, confirmed.registry, mismatched), /OPERATION_MISMATCH/);
});

test("receipt tampering cannot silently retarget ownership", async () => {
  const registry = await api.createEmptyAdoptionRegistry();
  const plan = await preview({ registry });
  const confirmed = await api.confirmMocAdoption(confirmationInput(plan, registry));
  const retargeted = { ...confirmed.receipt, targetPath: "MOCs/Other.md" };
  const store = new api.InMemoryAdoptionStore(registry);
  await assert.rejects(
    store.commit(registry.registryDigest, confirmed.registry, retargeted),
    /RECEIPT_(?:DIGEST|BINDING)_INVALID/,
  );
  assert.equal(store.load().generation, 0);
});

test("adoption bundle remains browser-safe and does not import an executor", () => {
  const inputs = bundles.flatMap(({ result }) => Object.keys(result.metafile.inputs)).map((path) => path.replaceAll("\\", "/"));
  assert.equal(inputs.some((path) => path.includes("navigation-effects/node")), false);
  assert.equal(inputs.some((path) => /(?:^|\/)(?:node:)?(?:fs|http|https)(?:$|\/)/u.test(path)), false);
  for (const { result } of bundles) assert.doesNotMatch(result.outputFiles[0].text, /node:(?:fs|http|https)/u);
});
