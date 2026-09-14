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
