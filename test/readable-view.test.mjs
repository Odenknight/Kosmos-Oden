import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundled=await build({entryPoints:['src/plugin/readable-view.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{
  name:'native-view-stub',setup(builder){
    builder.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'stub'}));
    builder.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export class ItemView {} export class TFile {}'}));
  },
}]});
const {KosmosReadableView}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
function fixture(){
  let graphReads=0,refreshes=0;
  const messages=[];
  const view=new KosmosReadableView({}, {graph:()=>{graphReads++;throw Error('unexpected graph read');}},()=> '');
  view.frame={contentWindow:{postMessage:message=>messages.push(message)}};
  view.status={textContent:''};view.generation=4;
  view.refresh=()=>{refreshes++;};
  view.snapshot={value:{nodes:[{id:'file:A.md',path:'A.md'},{id:'file:B.md',path:'B.md'}]},publish:async function(apply,current){if(!current())return false;apply(this.value);return true;}};
  return {view,messages,graphReads:()=>graphReads,refreshes:()=>refreshes};
}
test('native locate reuses authorized snapshot without rebuilding the graph',async()=>{
  const f=fixture();await f.view.locate('A.md');await f.view.locate('B.md');
  assert.deepEqual(f.messages.map(m=>m.payload),[{generation:4,id:'file:A.md'},{generation:4,id:'file:B.md'}]);
  assert.equal(f.graphReads(),0);assert.equal(f.refreshes(),0);
  await f.view.locate('missing.md');assert.equal(f.messages.length,2);assert.match(f.view.status.textContent,/unavailable/);
});
test('refused publication refreshes; superseded selection cannot post or trigger refresh',async()=>{
  const f=fixture();f.view.snapshot.publish=async()=>false;await f.view.locate('A.md');assert.equal(f.refreshes(),1);
  const g=fixture(),pending=[];
  g.view.snapshot.publish=(apply,current)=>new Promise(resolve=>pending.push(()=>{const valid=current();if(valid)apply(g.view.snapshot.value);resolve(valid);}));
  const first=g.view.locate('A.md'),second=g.view.locate('B.md');
  pending[1]();await second;pending[0]();await first;
  assert.equal(g.messages.length,1);assert.equal(g.messages[0].payload.id,'file:B.md');assert.equal(g.refreshes(),0);
});


test('return to Notes follows only current readable selections and rechecks publication', async () => {
  const f=fixture(),opened=[];f.view.openNotes=path=>opened.push(path);
  await f.view.locate('A.md');
  f.view.recordSelection('file:B.md',3);
  await f.view.returnToNotes();assert.deepEqual(opened,['A.md']);
  f.view.recordSelection('file:missing.md',4);
  await f.view.returnToNotes();assert.deepEqual(opened,['A.md','A.md']);
  f.view.recordSelection('file:B.md',4);
  await f.view.returnToNotes();assert.equal(opened.at(-1),'B.md');
  f.view.snapshot.publish=async()=>false;
  await f.view.returnToNotes();assert.equal(opened.length,3);assert.match(f.view.status.textContent,/scope changed/);
});

test('return to Notes cannot publish after another selection or closing', async () => {
  const f=fixture(),opened=[],pending=[];f.view.openNotes=path=>opened.push(path);
  f.view.recordSelection('file:A.md',4);
  f.view.snapshot.publish=(apply,current)=>new Promise(resolve=>pending.push(()=>{const valid=current();if(valid)apply(f.view.snapshot.value);resolve(valid);}));
  const first=f.view.returnToNotes();f.view.recordSelection('file:B.md',4);pending.shift()();await first;
  assert.deepEqual(opened,[]);
  const second=f.view.returnToNotes();f.view.frame=undefined;pending.shift()();await second;
  assert.deepEqual(opened,[]);
});


test('explicit spatial deselection clears the Notes target only in the current generation', async () => {
  const f=fixture(),opened=[];f.view.openNotes=path=>opened.push(path);
  f.view.recordSelection('file:A.md',4);f.view.recordSelection(null,3);
  await f.view.returnToNotes();assert.deepEqual(opened,['A.md']);
  f.view.recordSelection(null,4);await f.view.returnToNotes();assert.deepEqual(opened,['A.md',null]);
});
