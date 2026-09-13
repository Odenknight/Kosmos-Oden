import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, stripFrontmatter } from '../dist/kosmos-core.mjs';
import { KosmosAgentServer, DEFAULT_AGENT_SETTINGS } from '../dist/kosmos-agent-server.mjs';
import { NotesWorkspaceHost } from '../dist/kosmos-workspace-host.mjs';

function fixture(extra = [], defaults = 'internal') {
  const files=[
    {relativePath:'Public.md',content:'---\ngkx_version: "2.2"\nuid: public-fixture\ntype: semantic\nsensitivity: public\ntags: [visible]\n---\nPublic **body**.'},
    {relativePath:'Hidden.md',content:'---\ntype: semantic\nsensitivity: confidential\ntags: [hidden-canary]\n---\nSecret body.'},
    ...extra,
  ];
  let graph=buildGraph(files,[],undefined,{defaultSensitivity:defaults}), reads=0, corpus='fixture';
  const bodies=new Map(files.map(f=>[f.relativePath,stripFrontmatter(f.content)]));
  const provider={getGraph:async()=>graph,getIndexedBody:path=>{reads++;return bodies.get(path)??null;},
    getNoteContent:async()=>{throw new Error('unexpected live read');},vaultIdentity:()=>corpus,vaultName:()=>corpus,lanAddresses:()=>[]};
  const api=new KosmosAgentServer({}, {...DEFAULT_AGENT_SETTINGS,agentSensitivityCeiling:'public',defaultSensitivity:defaults},provider);
  return {api,provider,host:new NotesWorkspaceHost(api),reads:()=>reads,changeGraph:()=>{graph=structuredClone(graph);},changeCorpus:()=>{corpus='other';}};
}

test('workspace search shares MCP visibility and excludes hidden paths and totals',async()=>{
  const {api,host}=fixture();
  const snapshot=await host.search('');
  assert.deepEqual(snapshot.value,await api.qSearch(''));
  assert.equal(snapshot.value.total,1); assert.equal(JSON.stringify(snapshot.value).includes('Hidden.md'),false);
});

test('workspace reads preserve Engine origins and committed continuation',async()=>{
  const {host}=fixture(); const snapshot=await host.read('Public.md',{page_size:4});
  assert.equal(snapshot.value.note.content,'Publ'); assert.equal(snapshot.value.note.continuation.complete,false);
  for(const origin of ['authored','derived','proposed','approved','effective']) assert.ok(origin in snapshot.value.projection);
  let shown;assert.equal(await snapshot.publish(value=>shown=value,()=>true),true);assert.equal(shown,snapshot.value);
});

test('denied note never reads a body or reveals a projection',async()=>{
  const {host,reads}=fixture();const snapshot=await host.read('Hidden.md');
  assert.deepEqual(snapshot.value,{note:{error:'note not found'},projection:null});assert.equal(reads(),0);
  assert.throws(()=>host.read('../Hidden.md'),/WORKSPACE_PATH_INVALID/);
});

test('publication rejects changed corpus, graph, provider, policy and selection',async()=>{
  for(const change of [f=>f.changeCorpus(),f=>f.changeGraph(),f=>{f.api.provider={...f.provider};},f=>{f.api.settings.agentSensitivityCeiling='internal';}]) {
    const f=fixture(),snapshot=await f.host.read('Public.md');change(f);
    let commits=0;assert.equal(await snapshot.publish(()=>commits++,()=>true),false);assert.equal(commits,0);
  }
  const f=fixture(),snapshot=await f.host.read('Public.md');
  assert.equal(await snapshot.publish(()=>{throw new Error('must not publish');},()=>false),false);
});

test('policy changes during final graph refresh cannot publish an earlier read',async()=>{
  const f=fixture(),snapshot=await f.host.read('Public.md'),original=f.provider.getGraph;
  f.provider.getGraph=async()=>{const graph=await original();f.api.settings.agentSensitivityCeiling='confidential';return graph;};
  assert.equal(await snapshot.publish(()=>{throw new Error('must not publish');},()=>true),false);
});


test('unresolved reads retain both physical slots until they settle',async()=>{
  const f=fixture(),graph=await f.provider.getGraph();let release;
  const pending=new Promise(resolve=>release=resolve);f.provider.getGraph=()=>pending;
  const first=f.host.search(''),second=f.host.search('');
  await assert.rejects(f.host.search(''),/WORKSPACE_BUSY/);
  release(graph);await Promise.all([first,second]);
  assert.equal((await f.host.search('')).value.total,1);
});

test('unlabeled defaults and invalid sensitivity preserve Engine policy in Notes',async()=>{
  const extra=[
    {relativePath:'Unlabeled.md',content:'---\ngkx_version: "2.2"\nuid: unlabeled-fixture\ntype: semantic\n---\nUnlabeled.'},
    {relativePath:'Invalid.md',content:'---\ngkx_version: "2.2"\nuid: invalid-fixture\ntype: semantic\nsensitivity: unclassified\n---\nInvalid.'},
  ];
  for(const defaults of ['internal','public']) {
    const f=fixture(extra,defaults), result=(await f.host.search('')).value;
    assert.equal(result.results.some(n=>n.path==='Unlabeled.md'),defaults==='public');
    assert.equal(result.results.some(n=>n.path==='Invalid.md'),false);
    assert.deepEqual((await f.host.read('Invalid.md')).value,{note:{error:'note not found'},projection:null});
  }
});

test('missing projection remains unavailable instead of fabricating origins',async()=>{
  const f=fixture();
  f.api.qGkxNote=async()=>({error:'note has no GKX validating projection',path:'Public.md'});
  const result=(await f.host.read('Public.md')).value;
  assert.equal(result.note.content,'Public **body**.');
  assert.equal(result.projection,null);
});
