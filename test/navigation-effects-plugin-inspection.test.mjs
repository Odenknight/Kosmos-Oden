import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { build } from 'esbuild';
import { NodeNavigationEffectsExecutor, SimulatedEffectCrash } from 'gkos-engine/navigation-effects/node';
import { planMocApply } from 'gkos-engine/navigation-effects';

const compiled = await build({ entryPoints: [resolve('src/navigation-effects/plugin-inspection-host.ts')], bundle: true,
  platform: 'node', format: 'esm', target: 'es2022', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const D = `sha256:${'a'.repeat(64)}`;

async function snapshot(root) {
  const entries = [];
  async function visit(directory, prefix = '') {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) { entries.push([relative, 'directory']); await visit(join(directory, entry.name), `${relative}/`); }
      else entries.push([relative, (await readFile(join(directory, entry.name))).toString('base64')]);
    }
  }
  await visit(root);
  return entries;
}

function host(vault, adapter = {}) {
  let current = adapter, root = vault;
  const owner = new api.EffectsInspectionHost({ adapter, basePath: vault,
    currentAdapter: () => current, currentBasePath: () => root });
  return { owner, replaceAdapter: value => { current = value; }, replaceRoot: value => { root = value; } };
}

test('empty-vault inspection publishes safe evidence without creating entries or exposing effect operations', async () => {
  const vault = await mkdtemp(join(resolve(tmpdir()), 'kosmos-effects-inspection-'));
  try {
    const before = await snapshot(vault);
    const { owner } = host(vault);
    const result = await owner.inspect();
    assert.equal(result.artifactKind, 'kosmos.effect-recovery-inspection');
    assert.equal(result.status, 'safe');
    assert.equal(result.automaticWriteEnabled, false);
    assert.deepEqual(await snapshot(vault), before);
    assert.deepEqual(Object.keys(api).sort(), ['EffectsInspectionHost']);
  } finally { await rm(vault, { recursive: true, force: true }); }
});

test('interrupted-state inspection preserves every entry and byte', async () => {
  const vault = await mkdtemp(join(resolve(tmpdir()), 'kosmos-effects-pending-'));
  const writer = new NodeNavigationEffectsExecutor({ vaultRoot: vault, pathThreatModel: 'cooperative-vault',
    preconditionValidator: () => [], faultInjector: point => { if (point === 'after-prepared') throw new SimulatedEffectCrash(point); } });
  try {
    await mkdir(join(vault, 'topics'));
    await writeFile(join(vault, 'topics/index.md'), 'before');
    const actor = { actorId: 'human:fixture', actorType: 'human' };
    const policyRef = { id: 'effects', version: '1', digest: D };
    const planned = await planMocApply({ candidate: { artifactKind: 'engine.moc-candidate', candidateId: 'candidate:fixture',
      directory: 'topics', targetPath: 'topics/index.md', candidateBytes: '# after\n', digest: 'candidate-digest',
      sourceSnapshotDigest: D, configRef: { id: 'config', version: 1, digest: D }, policy: policyRef, sourceRefs: [] },
      currentBytes: 'before', ownership: { targetPath: 'topics/index.md', ownership: 'fully-managed', adoptedDigest: digest('before'),
        adoptedBy: actor, adoptedAt: '2026-09-14T00:00:00Z', adoptionReceiptId: 'receipt:fixture' },
      vaultId: 'vault:fixture', corpusDigest: D, policyRef,
      authority: { actor, grantId: 'grant:moc:apply', allowedRoot: 'topics', capability: 'moc:apply', sensitivityCeiling: 'secret', policyRef },
      authorityEvaluatedAt: '2026-09-14T00:00:00Z', archiveDate: '2026-09-14', runId: 'run-inspection' });
    assert.equal(planned.status, 'planned');
    await assert.rejects(writer.execute({ plan: planned.plan, proposedBytes: planned.proposedBytes }), /SIMULATED_EFFECT_CRASH/);
    await writer.releaseVaultLease();
    const before = await snapshot(vault);
    const result = await host(vault).owner.inspect();
    assert.equal(result.status, 'action-required');
    assert.equal(result.automaticWriteEnabled, false);
    assert.deepEqual(await snapshot(vault), before);
  } finally { await writer.releaseVaultLease(); await rm(vault, { recursive: true, force: true }); }
});

test('unload and changed adapter/root suppress stale inspection publication', async () => {
  for (const change of ['close', 'adapter', 'root']) {
    const vault = await mkdtemp(join(resolve(tmpdir()), 'kosmos-effects-stale-'));
    try {
      const binding = host(vault);
      const pending = binding.owner.inspect();
      if (change === 'close') binding.owner.close();
      if (change === 'adapter') binding.replaceAdapter({});
      if (change === 'root') binding.replaceRoot(`${vault}-other`);
      const result = await pending;
      assert.equal(result.artifactKind, 'kosmos.effect-host-unavailable');
      assert.deepEqual(result.reasonCodes, ['ADAPTER_NOT_CONFIGURED']);
    } finally { await rm(vault, { recursive: true, force: true }); }
  }
});

test('changed binding is refused before any old-vault read', async () => {
  const source = await readFile(resolve('src/navigation-effects/plugin-inspection-host.ts'), 'utf8');
  const inspectBody = source.slice(source.indexOf('async inspect()'));
  const constructAt = inspectBody.indexOf('new NodeNavigationEffectsExecutor');
  assert.ok(constructAt > 0);
  assert.ok(inspectBody.indexOf('currentAdapter()') < constructAt);
  assert.ok(inspectBody.indexOf('currentBasePath()') < constructAt);
  const vault = await mkdtemp(join(resolve(tmpdir()), 'kosmos-effects-preread-'));
  try {
    await writeFile(join(vault, 'marker'), 'unchanged');
    const binding = host(vault);
    binding.replaceAdapter({});
    const before = await snapshot(vault);
    const result = await binding.owner.inspect();
    assert.equal(result.artifactKind, 'kosmos.effect-host-unavailable');
    assert.deepEqual(await snapshot(vault), before);
  } finally { await rm(vault, { recursive: true, force: true }); }
});

test('throwing binding inspection returns only sanitized unavailability', async () => {
  const owner = new api.EffectsInspectionHost({ adapter: {}, basePath: 'unused',
    currentAdapter: () => { throw new Error('private adapter detail'); },
    currentBasePath: () => { throw new Error('private root detail'); } });
  const result = await owner.inspect();
  assert.equal(result.artifactKind, 'kosmos.effect-host-unavailable');
  assert.deepEqual(result.reasonCodes, ['ADAPTER_NOT_CONFIGURED']);
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('desktop host stays outside the Obsidian and browser bundles', async () => {
  const plugin = await build({ entryPoints: [resolve('src/plugin/main.ts')], bundle: true, write: false, format: 'cjs', metafile: true,
    platform: 'browser', target: 'es2020', external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*', 'node:*', '../../dist/kosmos-embed.html'],
    loader: { '.html': 'base64' } });
  assert.ok(Object.keys(plugin.metafile.inputs).every(path => !path.includes('plugin-inspection-host')
    && !path.includes('navigation-effects-node')));
  const Dummy = class {};
  const obsidian = new Proxy({ Platform: { isDesktopApp: false }, Plugin: Dummy, PluginSettingTab: Dummy,
    ItemView: Dummy, Modal: Dummy, Setting: Dummy, Notice: Dummy, TFile: Dummy, TFolder: Dummy, WorkspaceLeaf: Dummy },
  { get: (target, key) => target[key] ?? Dummy });
  const nodeRequests = [];
  const context = { module: { exports: {} }, exports: {}, console, Buffer, TextDecoder, TextEncoder,
    setTimeout, clearTimeout, window: {}, require(id) {
      if (id.startsWith('node:')) { nodeRequests.push(id); throw new Error(`mobile-node-import:${id}`); }
      if (id === 'obsidian') return obsidian;
      if (id === '../../dist/kosmos-embed.html') return '';
      return {};
    } };
  vm.runInNewContext(plugin.outputFiles[0].text, context);
  assert.deepEqual(nodeRequests, []);
  const browser = await build({ entryPoints: [resolve('src/navigation-effects/test-entry.ts')], bundle: true,
    write: false, format: 'esm', platform: 'browser', metafile: true });
  assert.ok(Object.keys(browser.metafile.inputs).every(path => !path.includes('plugin-inspection-host')
    && !path.includes('navigation-effects-node')));
  assert.ok(Object.values(browser.metafile.outputs).every(output => output.imports.every(entry => !entry.path.startsWith('node:'))));
});
