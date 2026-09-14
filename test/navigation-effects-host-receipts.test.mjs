import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['src/navigation-effects/engine-host-receipts.ts'], bundle: true,
  platform: 'neutral', format: 'esm', target: 'es2022', write: false, metafile: true });
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const D = `sha256:${'a'.repeat(64)}`;
const result = () => ({ artifactKind: 'engine.navigation-effect-recovery-result', effectsContract: '1.0.0',
  effectId: `effect:${'1'.repeat(32)}`, classification: 'effect-absent-retryable', writeCapabilityMayEnable: false,
  reasonCodes: ['VERIFIED_TEMP_AWAITS_AUTHORIZED_RECOVERY'], observed: { proposedDigest: D } });
function inspection(results = []) {
  const evidence = { artifactKind: 'engine.effect-recovery-inspection', effectsContract: '1.0.0', journalDigest: D,
    checkpointDigest: null, results, writeCapabilityMayEnable: false, sourceContentIncluded: false };
  return { ...evidence, inspectionDigest: hash(evidence) };
}

test('recovery mapping binds both digests and never grants automatic writes', async () => {
  for (const rows of [[], [result()], [{ ...result(), classification: 'ambiguous-or-corrupt' }]]) {
    const source = inspection(rows);
    const mapped = await api.mapEngineRecoveryInspection('standalone-native', source);
    assert.equal(mapped.engineInspectionDigest, source.inspectionDigest);
    assert.equal(mapped.inspection.status, rows.length ? rows[0].classification === 'ambiguous-or-corrupt' ? 'blocked' : 'action-required' : 'safe');
    assert.equal(mapped.inspection.engineWriteCapabilityMayEnable, false);
    assert.equal(mapped.inspection.automaticWriteEnabled, false);
    const { inspectionDigest, ...body } = mapped.inspection;
    assert.equal(inspectionDigest, hash({ ...body, engineInspectionDigest: source.inspectionDigest }));
    assert.ok(Object.isFrozen(mapped.inspection.results));
    if (rows.length) { rows[0].observed.proposedDigest = 'changed'; assert.equal(mapped.inspection.results[0].observed.proposedDigest, D); }
  }
  const first = inspection(), second = inspection(); second.journalDigest = null;
  const { inspectionDigest: _, ...body } = second; second.inspectionDigest = hash(body);
  assert.notEqual((await api.mapEngineRecoveryInspection('obsidian', first)).inspection.inspectionDigest,
    (await api.mapEngineRecoveryInspection('obsidian', second)).inspection.inspectionDigest);
});

test('malformed, forged, duplicate and source-bearing recovery evidence is rejected', async () => {
  const cases = [null, { ...inspection(), inspectionDigest: D }, { ...inspection(), sourceContentIncluded: true },
    { ...inspection(), sourceBytes: 'private' }, inspection([result(), result()]),
    inspection([{ ...result(), writeCapabilityMayEnable: true }]),
    inspection([{ ...result(), reasonCodes: ['private source text'] }]),
    inspection([{ ...result(), observed: { proposedDigest: D, sourceBytes: 'private' } }]),
    { ...inspection(), checkpointDigest: undefined }, inspection([{ ...result(), classification: 'safe' }]),
    inspection(Array(1)), inspection([{ ...result(), reasonCodes: Array(1) }]),
    Object.create(inspection())];
  for (const value of cases) await assert.rejects(api.mapEngineRecoveryInspection('obsidian', value), /ENGINE_.*(?:INVALID|MISMATCH)/);
  assert.ok(Object.keys(compiled.metafile.inputs).every(path => !path.includes('navigation-effects-node') && !path.includes('native/')));
  assert.ok(Object.values(compiled.metafile.outputs).every(output => output.imports.every(entry => !entry.path.startsWith('node:'))));
});

test('shutdown receipts preserve truthful completion and deadline evidence', async () => {
  for (const source of [
    { status: 'complete', admissionStopped: true, checkpointVerified: true, leaseReleased: true, reasonCodes: [] },
    { status: 'deadline-exceeded', admissionStopped: true, checkpointVerified: false, leaseReleased: false, reasonCodes: ['SHUTDOWN_DEADLINE_EXCEEDED'] },
    { status: 'blocked', admissionStopped: true, checkpointVerified: true, leaseReleased: true, reasonCodes: ['NONTERMINAL_EFFECTS_REMAIN'] },
  ]) {
    const mapped = await api.mapEngineShutdownResult('standalone-native', source);
    assert.equal(mapped.status, source.status);
    assert.equal(mapped.leaseReleased, source.leaseReleased);
    const { receiptDigest, ...body } = mapped; assert.equal(receiptDigest, hash(body));
    assert.ok(Object.isFrozen(mapped.reasonCodes));
  }
  for (const source of [
    { status: 'complete', admissionStopped: true, checkpointVerified: false, leaseReleased: true, reasonCodes: [] },
    { status: 'complete', admissionStopped: true, checkpointVerified: true, leaseReleased: false, reasonCodes: [] },
    { status: 'blocked', admissionStopped: false, checkpointVerified: false, leaseReleased: false, reasonCodes: ['FAILED'] },
    { status: 'blocked', admissionStopped: true, checkpointVerified: false, leaseReleased: false, reasonCodes: [] },
  ]) await assert.rejects(api.mapEngineShutdownResult('obsidian', source), /ENGINE_HOST_EVIDENCE_INVALID/);
});


test('receipt evidence refuses hidden fields and array accessors without reading them', async () => {
  let calls = 0;
  const hidden = inspection();
  Object.defineProperty(hidden, 'sourceBytes', { value: 'private', enumerable: false });
  const symbol = inspection();
  symbol[Symbol('sourceBytes')] = 'private';
  const rows = [result()];
  Object.defineProperty(rows, '0', { get() { calls++; return result(); } });
  const codes = ['SAFE'];
  Object.defineProperty(codes, '0', { get() { calls++; return 'SAFE'; } });
  const iterable = [];
  iterable[Symbol.iterator] = function* () { calls++; };
  for (const value of [hidden, symbol, { ...inspection(), results: rows },
    { ...inspection(), results: iterable }, { ...inspection([result()]), results: [{ ...result(), reasonCodes: codes }] }]) {
    await assert.rejects(api.mapEngineRecoveryInspection('obsidian', value), /ENGINE_HOST_EVIDENCE_INVALID/);
  }
  await assert.rejects(api.mapEngineShutdownResult('obsidian', {
    status: 'blocked', admissionStopped: true, checkpointVerified: false, leaseReleased: false, reasonCodes: codes,
  }), /ENGINE_HOST_EVIDENCE_INVALID/);
  assert.equal(calls, 0);
});


test('installed Engine package produces usable host inspection and shutdown receipts', async () => {
  const { NodeNavigationEffectsExecutor } = await import('gkos-engine/navigation-effects/node');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { dirname, join, resolve } = await import('node:path');
  const parent = resolve(tmpdir()), vault = mkdtempSync(join(parent, 'kosmos-installed-effects-'));
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot: vault, pathThreatModel: 'cooperative-vault' });
  try {
    const observed = await executor.inspectRecovery();
    const mapped = await api.mapEngineRecoveryInspection('standalone-native', observed);
    assert.equal(mapped.engineInspectionDigest, observed.inspectionDigest);
    assert.equal(mapped.inspection.status, 'safe');
    assert.equal(mapped.inspection.engineWriteCapabilityMayEnable, false);
    assert.equal(mapped.inspection.automaticWriteEnabled, false);
    await executor.shutdown();
    const receipt = await api.mapEngineShutdownResult('standalone-native',
      await executor.shutdownByDeadline(new AbortController().signal));
    assert.equal(receipt.status, 'complete');
    assert.equal(receipt.checkpointVerified, true);
    assert.equal(receipt.leaseReleased, true);
  } finally {
    await executor.releaseVaultLease();
    assert.equal(dirname(vault), parent);
    assert.ok(vault.startsWith(join(parent, 'kosmos-installed-effects-')));
    rmSync(vault, { recursive: true, force: true });
  }
});


test('installed Engine interrupted inspections preserve every file and require host action', async t => {
  const { planMocApply } = await import('gkos-engine/navigation-effects');
  const { NodeNavigationEffectsExecutor, SimulatedEffectCrash } = await import('gkos-engine/navigation-effects/node');
  const { mkdir, mkdtemp, readFile, readdir, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { dirname, join, resolve } = await import('node:path');
  const parent = resolve(tmpdir());
  async function snapshot(root) {
    const entries = [];
    async function visit(directory, prefix = '') {
      for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const relative = `${prefix}${entry.name}`;
        if (entry.isDirectory()) { entries.push([relative, 'directory']); await visit(join(directory, entry.name), `${relative}/`); }
        else { assert.ok(entry.isFile()); entries.push([relative, (await readFile(join(directory, entry.name))).toString('base64')]); }
      }
    }
    await visit(root);
    return entries;
  }
  for (const point of ['after-prepared', 'after-temporary-write', 'after-replace']) await t.test(point, async () => {
    const vault = await mkdtemp(join(parent, 'kosmos-pending-effects-'));
    const before = 'Synthetic original source';
    const actor = { actorId: 'human:fixture', actorType: 'human' };
    const policyRef = { id: 'effects', version: '1', digest: D };
    let authorityCalls = 0;
    const writer = new NodeNavigationEffectsExecutor({ vaultRoot: vault, pathThreatModel: 'cooperative-vault',
      preconditionValidator: () => [],
      faultInjector: observed => { if (observed === point) throw new SimulatedEffectCrash(point); } });
    const reader = new NodeNavigationEffectsExecutor({ vaultRoot: vault, pathThreatModel: 'cooperative-vault',
      preconditionValidator: () => { authorityCalls++; return ['AUTHORITY_REVOKED']; } });
    try {
      await mkdir(join(vault, 'topics'));
      await writeFile(join(vault, 'topics/index.md'), before);
      const planned = await planMocApply({
        candidate: { artifactKind: 'engine.moc-candidate', candidateId: 'candidate:fixture', directory: 'topics',
          targetPath: 'topics/index.md', candidateBytes: '# Synthetic topics\n', digest: 'candidate-digest',
          sourceSnapshotDigest: D, configRef: { id: 'config', version: 1, digest: D }, policy: policyRef, sourceRefs: [] },
        currentBytes: before,
        ownership: { targetPath: 'topics/index.md', ownership: 'fully-managed',
          adoptedDigest: `sha256:${createHash('sha256').update(before).digest('hex')}`,
          adoptedBy: actor, adoptedAt: '2026-09-14T00:00:00Z', adoptionReceiptId: 'receipt:fixture' },
        vaultId: 'vault:fixture', corpusDigest: D, policyRef,
        authority: { actor, grantId: 'grant:moc:apply', allowedRoot: 'topics', capability: 'moc:apply',
          sensitivityCeiling: 'secret', policyRef },
        authorityEvaluatedAt: '2026-09-14T00:00:00Z', archiveDate: '2026-09-14', runId: `run-${point}`,
      });
      assert.equal(planned.status, 'planned');
      await assert.rejects(writer.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes }),
        new RegExp(`SIMULATED_EFFECT_CRASH:${point}`));
      await writer.releaseVaultLease();
      const tree = await snapshot(vault);
      const observed = await reader.inspectRecovery();
      assert.equal(observed.results.length, 1);
      assert.equal(observed.results[0].effectId, planned.plan.effectId);
      for (const profile of ['obsidian', 'standalone-native']) {
        const mapped = await api.mapEngineRecoveryInspection(profile, observed);
        assert.equal(mapped.inspection.status, 'action-required');
        assert.equal(mapped.engineInspectionDigest, observed.inspectionDigest);
        assert.equal(mapped.inspection.engineWriteCapabilityMayEnable, false);
        assert.equal(mapped.inspection.automaticWriteEnabled, false);
      }
      assert.equal(authorityCalls, 0, 'inspection must not call the recovery authority provider');
      assert.deepEqual(await snapshot(vault), tree, 'inspection and receipt mapping must preserve all entries and bytes');
      assert.equal(await readFile(join(vault, 'topics/index.md'), 'utf8'), point === 'after-replace' ? planned.proposedBytes : before);
      assert.equal((await reader.inspectRecovery()).inspectionDigest, observed.inspectionDigest);
    } finally {
      await writer.releaseVaultLease();
      await reader.releaseVaultLease();
      assert.equal(dirname(vault), parent);
      assert.ok(vault.startsWith(join(parent, 'kosmos-pending-effects-')));
      await rm(vault, { recursive: true, force: true });
    }
  });
});
