import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceSelection } from '../dist/kosmos-workspace-selection.mjs';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };

test('late preparation cannot replace a newer selection and releases its resources', async () => {
  const selection = new WorkspaceSelection(), first = deferred(), shown=[], discarded=[];
  let oldSignal;
  const publish = async (value, current) => { if (!current()) return false; shown.push(value); return true; };
  const old = selection.select(signal => { oldSignal=signal; return first.promise; }, publish, value=>discarded.push(value));
  assert.equal(await selection.select(async()=> 'new', publish, value=>discarded.push(value)), true);
  assert.equal(oldSignal.aborted,true);
  first.resolve('old'); assert.equal(await old,false);
  assert.deepEqual(shown,['new']); assert.deepEqual(discarded,['old']);
});

test('selection changes during authority refresh prevent the final publish', async () => {
  const selection = new WorkspaceSelection(), authority = deferred(), entered = deferred();
  const shown=[], discarded=[];
  const pending = selection.select(async()=> 'prepared', async(value,current)=>{
    entered.resolve(); await authority.promise;
    if (!current()) return false;
    shown.push(value); return true;
  }, value=>discarded.push(value));
  await entered.promise; selection.invalidate(); authority.resolve();
  assert.equal(await pending,false); assert.deepEqual(shown,[]); assert.deepEqual(discarded,['prepared']);
});

test('closing suppresses late errors and prevents further host work', async () => {
  const selection = new WorkspaceSelection(), read = deferred(); let calls=0;
  const pending = selection.select(()=>read.promise,async()=>true,()=>{});
  selection.close(); read.reject(new Error('late provider failure'));
  assert.equal(await pending,false);
  assert.equal(await selection.select(async()=>{calls++;return 1;},async()=>true,()=>{}),false);
  assert.equal(calls,0);
});

test('current failures remain visible and failed publication releases prepared components', async () => {
  const selection = new WorkspaceSelection(); const discarded=[];
  await assert.rejects(selection.select(async()=>{throw new Error('read unavailable');},async()=>true,()=>{}),/read unavailable/);
  await assert.rejects(selection.select(async()=> 'preview',async()=>{throw new Error('policy unavailable');},value=>discarded.push(value)),/policy unavailable/);
  assert.deepEqual(discarded,['preview']);
});


test('late authority errors cannot replace the current selection with an error', async () => {
  const selection = new WorkspaceSelection(), authority = deferred(), entered = deferred(), discarded=[];
  const pending = selection.select(async()=> 'old',async()=>{entered.resolve();await authority.promise;return true;},value=>discarded.push(value));
  await entered.promise; selection.invalidate(); authority.reject(new Error('obsolete authority failure'));
  assert.equal(await pending,false); assert.deepEqual(discarded,['old']);
});
