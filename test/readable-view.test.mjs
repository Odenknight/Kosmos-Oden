import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundled=await build({entryPoints:['src/plugin/readable-view.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{
  name:'native-view-stub',setup(builder){
    builder.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'stub'}));
    builder.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export class ItemView { async setState() {} } export class TFile {}'}));
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

test('readable pop-out owns its elements, message listener, and visibility', async () => {
  const f=fixture(), listeners=[], elements=[], messages=[];
  const ownerWindow={};
  const ownerDocument={visibilityState:'visible',defaultView:ownerWindow,createElement(tag){
    elements.push(tag);
    return {style:{},setAttribute(){},addEventListener(){},contentWindow:{postMessage:m=>messages.push(m)}};
  }};
  f.view.contentEl={ownerDocument,offsetParent:{},style:{},classList:{add(){}},replaceChildren(){},append(){}};
  f.view.containerEl=f.view.contentEl;
  f.view.app={vault:{on(){return {};}},workspace:{on(){return {};}}};
  f.view.registerEvent=()=>{};
  f.view.registerDomEvent=(...args)=>listeners.push(args);
  await f.view.onOpen();
  assert.deepEqual(elements,['p','button','iframe']);
  assert.equal(listeners.find(([,event])=>event==='message')[0],ownerWindow);
  const visibility=listeners.find(([,event])=>event==='visibilitychange');
  assert.equal(visibility[0],ownerDocument);
  ownerDocument.visibilityState='hidden';visibility[2]();
  assert.equal(messages.at(-1).payload.visible,false);
  ownerDocument.visibilityState='visible';visibility[2]();
  assert.equal(messages.at(-1).payload.visible,true);
  f.view.containerEl.offsetParent=null;visibility[2]();
  assert.equal(messages.at(-1).payload.visible,false);
});
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


test('spatial saved UID follows renamed identity and refuses replacement or ambiguity', async () => {
  const f=fixture(), opened=[];
  const uid='019b2d14-4230-7db7-87d4-7d81cfaec932';
  f.view.openNotes=path=>opened.push(path);
  await f.view.setState({selectedPath:'A.md',selectedUid:uid},{});
  assert.deepEqual(f.view.getState(),{selectedPath:'A.md',selectedUid:uid});
  f.view.snapshot.value.nodes=[{id:'file:A.md',path:'A.md'},{id:'file:Moved.md',path:'Moved.md',uid}];
  await f.view.returnToNotes();assert.deepEqual(opened,['Moved.md']);
  f.view.snapshot.value.nodes=[{id:'file:A.md',path:'A.md'}];
  await f.view.returnToNotes();assert.equal(opened.length,1);assert.match(f.view.status.textContent,/unavailable/);
  f.view.snapshot.value.nodes=[{id:'file:One.md',path:'One.md',uid},{id:'file:Two.md',path:'Two.md',uid}];
  await f.view.returnToNotes();assert.equal(opened.length,1);
  f.view.recordSelection('file:One.md',4);
  assert.deepEqual(f.view.getState(),{selectedPath:'One.md',selectedUid:uid});
  f.view.recordSelection(null,4);assert.deepEqual(f.view.getState(),{selectedPath:null});
});


test('cross-mode UID lookup rejects an old-path replacement and forwards identity to Notes', async () => {
  const f=fixture(), uid='019b2d14-4230-7db7-87d4-7d81cfaec932', opened=[];
  f.view.snapshot.value.nodes=[{id:'file:A.md',path:'A.md'},{id:'file:Moved.md',path:'Moved.md',uid}];
  f.view.openNotes=(path,identity)=>opened.push({path,uid:identity});
  await f.view.locate('A.md',uid);
  assert.equal(f.messages.at(-1).payload.id,'file:Moved.md');
  await f.view.returnToNotes();assert.deepEqual(opened,[{path:'Moved.md',uid}]);
  f.view.snapshot.value.nodes=[{id:'file:A.md',path:'A.md'}];
  await f.view.locate('A.md',uid);assert.equal(f.messages.length,1);
  assert.match(f.view.status.textContent,/unavailable/);
  assert.throws(()=>f.view.locate('A.md','invalid'),/UID_INVALID/);
});


test('saved spatial UUID resolves case variants and refuses duplicate aliases',async()=>{
 const f=fixture(),uid='019b2d14-4230-7db7-87d4-7d81cfaec932',opened=[];
 f.view.openNotes=path=>opened.push(path);
 await f.view.setState({selectedPath:'Old.md',selectedUid:uid},{});
 f.view.snapshot.value.nodes=[{id:'file:Moved.md',path:'Moved.md',uid:uid.toUpperCase()}];
 await f.view.returnToNotes();assert.deepEqual(opened,['Moved.md']);
 f.view.snapshot.value.nodes.push({id:'file:Other.md',path:'Other.md',uid});
 await f.view.returnToNotes();assert.deepEqual(opened,['Moved.md']);
});
