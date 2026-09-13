import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, stripFrontmatter } from '../dist/kosmos-core.mjs';
import { KosmosAgentServer, DEFAULT_AGENT_SETTINGS } from '../dist/kosmos-agent-server.mjs';
import { NotesWorkspaceHost, readableSpatialGraph } from '../dist/kosmos-workspace-host.mjs';
import { positionCosmos } from '../dist/kosmos-layout.mjs';

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

test('readable spatial conversion uses existing layout without leaking hidden graph metadata', async () => {
  const f=fixture([{relativePath:'Links.md',content:'---\ngkx_version: "2.2"\nuid: links\ntype: semantic\nsensitivity: public\n---\n[[Public]] [[Hidden]]'}]);
  const snapshot=await f.host.spatialGraph();
  const projected=snapshot.value;
  assert.equal(projected.nodes.length,2);
  assert.equal(projected.links.length,1);
  assert.equal(JSON.stringify(projected).includes('Hidden'),false);
  assert.ok(projected.nodes.every(n=>!('gkx' in n)));
  assert.equal(projected.nodes.reduce((sum,n)=>sum+n.outgoing,0),1);
  const positioned=positionCosmos(structuredClone(projected));
  for(const node of projected.nodes) assert.ok(positioned.nodes.some(n=>n.id===node.id));
  assert.ok(positioned.nodes.every(n=>n.position.every(Number.isFinite)));
  f.changeGraph();
  assert.equal(await snapshot.publish(()=>assert.fail('stale projection'),()=>true),false);
  assert.throws(()=>readableSpatialGraph({builtAt:'',nodes:[],links:[{source:'missing',target:'missing'}]}),/WORKSPACE_SPATIAL_ENDPOINT/);
  assert.throws(()=>readableSpatialGraph({builtAt:'',nodes:Array(20_001),links:[]}),/WORKSPACE_SPATIAL_BUDGET/);
});

test('spatial graph shares readable query semantics and rejects stale publication', async () => {
  for (const change of [f=>f.changeGraph(),f=>f.changeCorpus(),f=>{f.api.settings.agentSensitivityCeiling='internal';}]) {
    const f=fixture([{relativePath:'Linked.md',content:'---\ngkx_version: "2.2"\nuid: linked-fixture\ntype: semantic\nsensitivity: public\n---\n[[Public]] [[Hidden]]'}]);
    const snapshot=await f.host.graph();
    assert.deepEqual(snapshot.value,await f.api.qGraph());
    assert.equal(JSON.stringify(snapshot.value).includes('Hidden.md'),false);
    const ids=new Set(snapshot.value.nodes.map(n=>n.id));
    assert.ok(snapshot.value.links.length > 0);
    assert.ok(snapshot.value.links.every(link=>ids.has(link.source)&&ids.has(link.target)));
    let count=0;
    assert.equal(await snapshot.publish(()=>count++,()=>true),true);
    change(f);
    assert.equal(await snapshot.publish(()=>count++,()=>true),false);
    assert.equal(count,1);
  }
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

test('Notes lineage matches the shared query and excludes confidential successors', async () => {
  const f=fixture([
    {relativePath:'Successor.md',content:'---\ntype: semantic\nsensitivity: public\nsupersedes: [Public]\n---\nReadable successor'},
    {relativePath:'PrivateSuccessor.md',content:'---\ntype: semantic\nsensitivity: confidential\nsupersedes: [Public]\n---\nPrivate successor'},
  ]);
  const snapshot=await f.host.read('Public.md');
  assert.deepEqual(snapshot.value.lineage,await f.api.qLineage({path:'Public.md'}));
  assert.equal(snapshot.value.lineage.chainLength,2);
  assert.ok(snapshot.value.lineage.chain.some(n=>n.path==='Successor.md'));
  assert.equal(JSON.stringify(snapshot.value.lineage).includes('PrivateSuccessor'),false);
  f.changeGraph();
  assert.equal(await snapshot.publish(()=>assert.fail('stale lineage published'),()=>true),false);
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

test('native search pages traverse all readable matches once and retain the original binding',async()=>{
  const extra=Array.from({length:105},(_,i)=>({relativePath:`Page-${i}.md`,content:'---\ntype: semantic\nsensitivity: public\n---\nReadable.'}));
  const f=fixture(extra), paths=[];
  let page=await f.host.search('',{limit:20});
  const first=page;
  while(page) {
    assert.equal(page.value.total,106);
    assert.equal(page.offset,paths.length);
    paths.push(...page.value.results.map(n=>n.path));
    page=page.next?await page.next():null;
  }
  assert.equal(paths.length,106);assert.equal(new Set(paths).size,106);
  assert.equal(paths.includes('Hidden.md'),false);
  f.changeGraph();
  await assert.rejects(first.next(),/SEARCH_SNAPSHOT_CHANGED/);
});

test('search continuation rejects revocation before or during the next page',async()=>{
  for(const during of [false,true]) {
    const f=fixture([{relativePath:'Other.md',content:'---\ntype: semantic\nsensitivity: public\n---\nOther.'}]);
    const first=await f.host.search('',{limit:1});
    if(during) {
      const original=f.api.qSearch.bind(f.api);
      f.api.qSearch=async(...args)=>{const result=await original(...args);f.changeCorpus();return result;};
    } else f.api.settings.agentSensitivityCeiling='internal';
    await assert.rejects(first.next());
  }
});

test('Notes exposes only readable neighbors and keeps navigation tags out of effective labels',async()=>{
  const f=fixture([{relativePath:'Links.md',content:'---\ngkx_version: "2.2"\nuid: links-fixture\ntype: semantic\nsensitivity: public\ntags: [navigation-only]\n---\n[[Public]] and [[Hidden]]'}]);
  const {note,projection,related}=(await f.host.read('Links.md')).value;
  assert.deepEqual(note.tags,['navigation-only']);
  assert.equal(projection.effective.labels.includes('navigation-only'),false);
  assert.deepEqual(related.outgoing.map(n=>n.path),['Public.md']);
  assert.equal(JSON.stringify(related).includes('Hidden.md'),false);
  // The author-written reference stays in permitted source content; it is not
  // resolved into hidden neighbor metadata or a navigation result.
  assert.ok(note.content.includes('[[Hidden]]'));
});

test('assessment and diagnostics retain the shared Engine-backed API semantics',async()=>{
  const f=fixture(),value=(await f.host.read('Public.md')).value;
  assert.deepEqual(value.assessment,await f.api.qAssessment({path:'Public.md'}));
  assert.deepEqual(value.diagnostics,await f.api.qGkxDiagnostics({path:'Public.md'}));
  assert.equal(value.assessment.interpretation,'documentation-and-support-quality-not-truth');
  f.api.qGkxNote=async()=>({error:'projection unavailable'});
  const missing=(await f.host.read('Public.md')).value;
  assert.equal(missing.assessment,null);assert.equal(missing.diagnostics,null);
});

