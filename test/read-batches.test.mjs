import test from 'node:test';
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
const bundle = await esbuild.build({ entryPoints: ['src/plugin/read-batches.ts'], bundle: true, write: false, format: 'esm' });
const { readBatches } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('vault reads overlap within a bound and retain source order', async () => {
  let active = 0, peak = 0;
  const items = Array.from({ length: 37 }, (_, i) => i);
  const result = await readBatches(items, async i => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, i % 3));
    active--;
    return i;
  });
  assert.deepEqual(result, items);
  assert.ok(peak > 1 && peak <= 16);
});

test('a failed read rejects the snapshot without starting another batch', async () => {
  const started = [];
  await assert.rejects(readBatches(Array.from({ length: 20 }, (_, i) => i), async i => {
    started.push(i);
    if (i === 3) throw new Error('unreadable note');
    return i;
  }), /unreadable note/);
  assert.ok(started.every(i => i < 16));
});
