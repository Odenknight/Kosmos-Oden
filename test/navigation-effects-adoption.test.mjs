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
  bundleEntry("src/navigation-effects/adoption-controller.ts"),
]);
const api = Object.assign({}, ...bundles.map((item) => item.module));

const digest = (char) => `sha256:${char.repeat(64)}`;
const actor = { actorId: "operator-1", actorType: "human", displayName: "Operator" };
const configDigest = digest("a"), policyDigest = digest("b");
const lf = `Human prefix\n<!-- gkos:moc generated:start version=1 config=${configDigest} -->\ngenerated body\n<!-- gkos:moc generated:end -->\nHuman suffix\n`;
const crlf = lf.replaceAll("\n", "\r\n");
const candidate = "<!-- gkos-navigation:managed:start -->\nfresh generated body\n<!-- gkos-navigation:managed:end -->";

test("adoption controller binds previews to source state and closes the final commit window", async () => {
  const memory = new api.InMemoryAdoptionStore(await api.createEmptyAdoptionRegistry());
  let bytes = lf, valid = true, beforeCommit = () => {};
  const controller = api.createAdoptionCallbacks({
    load: async () => memory.load(),
    commit: async (expected, registry, receipt, guard) => {
      beforeCommit();
      if (guard() !== true) throw Error("ADOPTION_HOST_STATE_STALE");
      await memory.commit(expected, registry, receipt);
    },
  }, async () => ({
    input: { targetPath: "MOCs/Alpha.md", currentBytes: bytes, candidateBytes: candidate, policyDigest, configDigest, actor },
    credentialId: "cred-1", stillCurrent: () => valid,
  }));
  const stale = await controller.createPreview("region-managed");
  bytes += "changed";
  assert.equal(await controller.checkFreshness(stale), false);
  await assert.rejects(controller.recordAdoption(stale), /PREVIEW_STALE/);
  bytes = lf;
  const original = await controller.createPreview("region-managed");
  const altered = { ...original, semanticSummary: "changed after presentation" };
  await assert.rejects(controller.recordAdoption(altered), /PREVIEW_STALE/);
  const revoked = await controller.createPreview("region-managed");
  beforeCommit = () => { valid = false; };
  await assert.rejects(controller.recordAdoption(revoked), /HOST_STATE_STALE/);
  assert.equal(memory.load().generation, 0);
  valid = true;
  const closed = await controller.createPreview("region-managed");
  beforeCommit = () => controller.close();
  await assert.rejects(controller.recordAdoption(closed), /HOST_STATE_STALE/);
  assert.equal(memory.load().generation, 0);
  await assert.rejects(controller.createPreview("region-managed"), /WORKFLOW_UNAVAILABLE/);
});

test("adoption controller records a current preview once without source writes", async () => {
  const memory = new api.InMemoryAdoptionStore(await api.createEmptyAdoptionRegistry());
  const controller = api.createAdoptionCallbacks({
    load: async () => memory.load(),
    commit: async (expected, registry, receipt, guard) => {
      assert.equal(guard(), true);
      await memory.commit(expected, registry, receipt);
    },
  }, async () => ({
    input: { targetPath: "MOCs/Alpha.md", currentBytes: lf, candidateBytes: candidate, policyDigest, configDigest, actor },
    credentialId: "cred-1", stillCurrent: () => true,
  }));
  const plan = await controller.createPreview("region-managed");
  assert.equal(await controller.checkFreshness(plan), true);
  await controller.recordAdoption(plan);
  assert.equal(memory.load().generation, 1);
  await assert.rejects(controller.recordAdoption(plan), /PREVIEW_STALE/);
});

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


async function nativeStoreFixture() {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, dirname } = await import('node:path');
  const bundle = await build({entryPoints:['src/navigation-effects/sqlite-adoption-store.ts'],bundle:true,write:false,format:'esm',platform:'node'});
  const { SqliteAdoptionStore } = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const directory=mkdtempSync(join(tmpdir(),'kosmos-adoption-'));
  return {SqliteAdoptionStore,directory,bundleText:bundle.outputFiles[0].text,cleanup:()=>{if(dirname(directory)!==tmpdir())throw Error('Unexpected cleanup path');rmSync(directory,{recursive:true,force:true});}};
}

test('native adoption store atomically reopens registry and receipt and refuses conflicting replay', async () => {
  const f=await nativeStoreFixture();let store;
  try {
    const registry=await api.createEmptyAdoptionRegistry();
    await assert.rejects(f.SqliteAdoptionStore.open(f.directory));
    store=await f.SqliteAdoptionStore.open(f.directory,registry);
    const plan=await preview({registry});const confirmed=await api.confirmMocAdoption(confirmationInput(plan,registry));
    await store.commit(registry.registryDigest,confirmed.registry,confirmed.receipt,()=>true);
    store.close();store=await f.SqliteAdoptionStore.open(f.directory);
    assert.deepEqual(await store.load(),confirmed.registry);
    assert.deepEqual(await store.receipt(confirmed.receipt.receiptId),confirmed.receipt);
    await store.commit(registry.registryDigest,confirmed.registry,confirmed.receipt,()=>true);
    await assert.rejects(store.commit(registry.registryDigest,confirmed.registry,{...confirmed.receipt,credentialId:'different'},()=>true));
    assert.deepEqual(await store.load(),confirmed.registry);
    await assert.rejects(f.SqliteAdoptionStore.open(f.directory,registry));
  } finally {store?.close();f.cleanup();}
});

test('native adoption store serializes competing generation commits and detects corrupt receipts', async () => {
  const f=await nativeStoreFixture();let first,second;
  try {
    const registry=await api.createEmptyAdoptionRegistry();first=await f.SqliteAdoptionStore.open(f.directory,registry);second=await f.SqliteAdoptionStore.open(f.directory);
    const a=await preview({registry,operationId:'op-a'}),b=await preview({registry,operationId:'op-b'});
    const ca=await api.confirmMocAdoption(confirmationInput(a,registry)),cb=await api.confirmMocAdoption(confirmationInput(b,registry));
    const results=await Promise.allSettled([first.commit(registry.registryDigest,ca.registry,ca.receipt,()=>true),second.commit(registry.registryDigest,cb.registry,cb.receipt,()=>true)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await first.load()).generation,1);
    first.db.exec("UPDATE commits SET receipt='{}'");
    await assert.rejects(first.load());
  } finally {first?.close();second?.close();f.cleanup();}
});


test('native adoption survives process exit immediately before and after transaction commit', async () => {
  const {writeFileSync}=await import('node:fs');const {join}=await import('node:path');
  const {pathToFileURL}=await import('node:url');const {spawnSync}=await import('node:child_process');
  for(const phase of ['before','after']) {
    const f=await nativeStoreFixture();let store;
    try {
      const registry=await api.createEmptyAdoptionRegistry();store=await f.SqliteAdoptionStore.open(f.directory,registry);store.close();store=undefined;
      const plan=await preview({registry}),confirmed=await api.confirmMocAdoption(confirmationInput(plan,registry));
      const modulePath=join(f.directory,'store.mjs');writeFileSync(modulePath,f.bundleText);
      const payload=join(f.directory,'fixture.json');writeFileSync(payload,JSON.stringify({registry,confirmed}));
      const code=`import {SqliteAdoptionStore} from ${JSON.stringify(pathToFileURL(modulePath).href)};
        import {readFileSync} from 'node:fs';
        const fixture=JSON.parse(readFileSync(process.argv[2],'utf8'));
        const store=await SqliteAdoptionStore.open(process.argv[1]);
        const exec=store.db.exec.bind(store.db);let commits=0;
        store.db.exec=sql=>{if(sql==='COMMIT;' && ++commits===2){if(process.argv[3]==='before')process.exit(86);exec(sql);process.exit(87);}return exec(sql);};
        await store.commit(fixture.registry.registryDigest,fixture.confirmed.registry,fixture.confirmed.receipt,()=>true);
        process.exit(99);`;
      const child=spawnSync(process.execPath,['--input-type=module','-e',code,f.directory,payload,phase],{encoding:'utf8',timeout:10000,windowsHide:true});
      assert.equal(child.status,phase==='before'?86:87,child.stderr);
      store=await f.SqliteAdoptionStore.open(f.directory);
      assert.equal((await store.load()).generation,phase==='before'?0:1);
      assert.deepEqual(await store.receipt(confirmed.receipt.receiptId),phase==='before'?undefined:confirmed.receipt);
      await store.commit(registry.registryDigest,confirmed.registry,confirmed.receipt,()=>true);
      assert.deepEqual(await store.load(),confirmed.registry);
    } finally {store?.close();f.cleanup();}
  }
});


test('native adoption refuses empty and unrelated databases without changing their bytes', async () => {
  const {writeFileSync,readFileSync}=await import('node:fs');const {join}=await import('node:path');
  const {DatabaseSync}=await import('node:sqlite');
  for(const kind of ['empty','unrelated']) {
    const f=await nativeStoreFixture();
    try {
      const path=join(f.directory,'adoption.sqlite');
      if(kind==='empty')writeFileSync(path,'');
      else {const db=new DatabaseSync(path);db.exec("CREATE TABLE unrelated(value TEXT); INSERT INTO unrelated VALUES ('preserve');");db.close();}
      const before=readFileSync(path);
      await assert.rejects(f.SqliteAdoptionStore.open(f.directory),kind==='empty'?/DATABASE_UNSAFE/:/DATABASE_IDENTITY_INVALID/);
      await assert.rejects(f.SqliteAdoptionStore.open(f.directory,await api.createEmptyAdoptionRegistry()));
      assert.deepEqual(readFileSync(path),before);
    } finally {f.cleanup();}
  }
});

test('native adoption bounds a proposed record before any transaction changes the registry', async () => {
  const f=await nativeStoreFixture();let store;
  try {
    const registry=await api.createEmptyAdoptionRegistry();store=await f.SqliteAdoptionStore.open(f.directory,registry);
    const plan=await preview({registry}),confirmed=await api.confirmMocAdoption(confirmationInput(plan,registry));
    await assert.rejects(store.commit(registry.registryDigest,confirmed.registry,{...confirmed.receipt,credentialId:'x'.repeat(1024*1024)},()=>true),/ADOPTION_RECORD_BUDGET/);
    assert.deepEqual(await store.load(),registry);
    assert.equal(await store.receipt(confirmed.receipt.receiptId),undefined);
  } finally {store?.close();f.cleanup();}
});


test('native adoption requires a synchronous final host check and refuses late revocation', async () => {
  const f=await nativeStoreFixture();let store;
  try {
    const registry=await api.createEmptyAdoptionRegistry();store=await f.SqliteAdoptionStore.open(f.directory,registry);
    const plan=await preview({registry}),confirmed=await api.confirmMocAdoption(confirmationInput(plan,registry));
    await assert.rejects(store.commit(registry.registryDigest,confirmed.registry,confirmed.receipt),/HOST_STATE_STALE/);
    await assert.rejects(store.commit(registry.registryDigest,confirmed.registry,confirmed.receipt,async()=>true),/HOST_STATE_STALE/);
    let current=true;const pending=store.commit(registry.registryDigest,confirmed.registry,confirmed.receipt,()=>current);current=false;
    await assert.rejects(pending,/HOST_STATE_STALE/);
    assert.deepEqual(await store.load(),registry);
    assert.equal(await store.receipt(confirmed.receipt.receiptId),undefined);
    await store.commit(registry.registryDigest,confirmed.registry,confirmed.receipt,()=>true);
    await assert.rejects(store.commit(registry.registryDigest,confirmed.registry,confirmed.receipt,()=>false),/HOST_STATE_STALE/);
  } finally {store?.close();f.cleanup();}
});
