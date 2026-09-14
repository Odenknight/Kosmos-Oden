import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('v3 companion binds its bytes and distinguishes all three span coordinate units', () => {
  const root=new URL('./fixtures/workspace-v3/',import.meta.url);
  const raw=readFileSync(new URL('reconciliation.json',root));
  const manifest=readFileSync(new URL('SHA256SUMS',root),'utf8');
  assert.equal(manifest,`${createHash('sha256').update(raw).digest('hex')}  reconciliation.json\n`);
  const fixture=JSON.parse(raw);
  assert.equal(fixture.standing,'review-candidate-not-accepted');
  for(const row of fixture.coordinate_cases) {
    assert.equal(row.offset_base,0);
    const bytes=Buffer.from(row.text,'utf8'), points=Array.from(row.text);
    assert.equal(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(row.utf8.offset,row.utf8.offset+row.utf8.length)),row.literal);
    assert.equal(row.text.slice(row.utf16_code_units.offset,row.utf16_code_units.offset+row.utf16_code_units.length),row.literal);
    assert.equal(points.slice(row.unicode_code_points.offset,row.unicode_code_points.offset+row.unicode_code_points.length).join(''),row.literal);
    assert.equal(new Set([row.utf8.offset,row.utf16_code_units.offset,row.unicode_code_points.offset]).size,3);
  }
});
