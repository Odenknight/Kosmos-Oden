import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import { build } from "esbuild";
import {buildManagedGraphitiManifest} from 'gkos-engine/graphiti';
import {prepareNativeSemanticClient,NativeSemanticConnection,readNativeSemanticProfile} from '../dist/kosmos-workspace-host.mjs';
import { KosmosAgentServer, DEFAULT_AGENT_SETTINGS, MAX_SOURCE_EVIDENCE_BYTES } from "../dist/kosmos-agent-server.mjs";

const compiled = await build({ entryPoints: ["src/plugin/vault-provider.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { VaultDataProvider } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);

function fixture(relationships = "", privateUid = "") {
  const raw = "---\r\ntype: semantic\r\nsensitivity: internal\r\n" + relationships + "---\r\nExact café 🌌\r\n" + "tail ".repeat(3000);
  const settings = { ...DEFAULT_AGENT_SETTINGS, defaultSensitivity: "internal", agentSensitivityCeiling: "internal" };
  const file = { path: "note.md", name: "note.md", extension: "md", stat: { size: Buffer.byteLength(raw), mtime: 1, ctime: 1 } };
  const privateRaw = "---\ntype: semantic\n" + (privateUid ? `uid: "${privateUid}"\n` : "") + "sensitivity: secret\n---\nPrivate";
  const privateFile = { ...file, path: "private.md", name: "private.md", stat: { ...file.stat, size: Buffer.byteLength(privateRaw) } };
  const reads = [];
  let binary = Buffer.from(raw), hook = () => {};
  const vault = {
    getMarkdownFiles: () => [file, privateFile], getFiles: () => [file, privateFile],
    getAbstractFileByPath: path => path === file.path ? file : path === privateFile.path ? privateFile : null,
    getName: () => "Synthetic evidence", adapter: {},
    cachedRead: async f => f === file ? raw : privateRaw,
    readBinary: async f => { reads.push(f.path); await hook(); return Uint8Array.from(binary).buffer; },
  };
  const provider = new VaultDataProvider({ vault }, settings);
  const server = new KosmosAgentServer(http, settings, provider);
  return { raw, settings, file, vault, provider, server, reads, setBinary: value => { binary = value; }, onRead: fn => { hook = fn; } };
}

test("opt-in export hashes full original bytes including CRLF/frontmatter beyond truncation; denied notes are never read", async () => {
  const f = fixture();
  const ordinary = await f.server.callTool("export_graphiti_episodes", { limit: 10 });
  assert.equal(f.reads.length, 0);
  assert.ok(ordinary.episodes.every(e => !JSON.parse(e.episode_body).source_evidence));
  const page = await f.server.callTool("export_graphiti_episodes", { limit: 10, include_source_evidence: true });
  const bodies = page.episodes.filter(e => e.source === "json").map(e => JSON.parse(e.episode_body));
  assert.equal(bodies.length, 1);
  assert.deepEqual(f.reads, ["note.md"]);
  const evidence = bodies[0].source_evidence;
  assert.equal(evidence.sha256, createHash("sha256").update(Buffer.from(f.raw)).digest("hex"));
  assert.equal(evidence.byte_length, Buffer.byteLength(f.raw));
  assert.equal(evidence.semantic_support, "unverified");
  assert.equal(evidence.revision, `sha256:${evidence.sha256}`);
  assert.ok(bodies[0].content.length < f.raw.length);
});

test("source evidence option rejects non-boolean values and unsupported providers", async () => {
  const f = fixture();
  await assert.rejects(f.server.callTool("export_graphiti_episodes", { include_source_evidence: "true" }), /must be a boolean/);
  f.provider.getIndexedSourceBytes = undefined;
  await assert.rejects(f.server.callTool("export_graphiti_episodes", { include_source_evidence: true }), /unavailable from this provider/);
  assert.equal(f.reads.length, 0);
});

test('native manifest uses readable original bytes and invalidates before a pending rebuild',async()=>{
  const uid='019b2d14-4230-7db7-87d4-7d81cfaec932';
  const f=fixture(`uid: "${uid}"\r\n`);
  const result=await f.server.prepareManagedGraphitiManifest(new AbortController().signal);
  assert.equal(result.current(),true);
  assert.deepEqual(f.reads,['note.md']);
  const expected=await buildManagedGraphitiManifest(result.episodes.map(episode=>({source_id:uid,raw:Buffer.from(f.raw),episode})));
  assert.deepEqual(result.manifest,expected.manifest);
  assert.equal(result.source_snapshot_digest,expected.source_snapshot_digest);
  f.provider.markChanged('note.md');
  assert.equal(result.current(),false);
  await f.provider.getGraph();
  assert.equal(result.current(),false);
  const fresh=await f.server.prepareManagedGraphitiManifest(new AbortController().signal);
  f.settings.graphitiSagaMapping=true;
  assert.equal(fresh.current(),false);
  f.settings.graphitiSagaMapping=false;
  assert.equal(fresh.current(),false);
});

test('native manifest refuses missing identity, cancellation and configuration changes during source reads',async()=>{
  const missing=fixture();
  await assert.rejects(missing.server.prepareManagedGraphitiManifest(new AbortController().signal),e=>e.reason==='provider_unavailable');
  assert.deepEqual(missing.reads,[]);
  for(const action of ['abort','configuration','source']) {
    const f=fixture('uid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\r\n');
    const controller=new AbortController();
    f.onRead(()=>{
      if(action==='abort') controller.abort();
      if(action==='configuration') f.settings.graphitiSagaMapping=true;
      if(action==='source') f.provider.markChanged('note.md');
    });
    await assert.rejects(f.server.prepareManagedGraphitiManifest(controller.signal),e=>e.reason==='provider_unavailable');
  }
});

test('native manifest can reproduce the published projection time after provider restart',async()=>{
  const uid='uid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\r\n';
  const projectionTime='2026-09-13T00:00:00.000Z';
  const first=await fixture(uid).server.prepareManagedGraphitiManifest(new AbortController().signal,projectionTime);
  await new Promise(resolve=>setTimeout(resolve,20));
  const second=await fixture(uid).server.prepareManagedGraphitiManifest(new AbortController().signal,projectionTime);
  assert.equal(first.manifest[0].source_digest,second.manifest[0].source_digest);
  assert.equal(first.source_snapshot_digest,second.source_snapshot_digest);
  assert.equal(first.projection_time,projectionTime);
  const changed=await fixture(uid).server.prepareManagedGraphitiManifest(new AbortController().signal,'2026-09-13T00:00:01.000Z');
  assert.notEqual(first.source_snapshot_digest,changed.source_snapshot_digest);
  const invalid=fixture(uid);
  await assert.rejects(invalid.server.prepareManagedGraphitiManifest(new AbortController().signal,'invalid'),e=>e.reason==='provider_unavailable');
  assert.deepEqual(invalid.reads,[]);
});

test('native semantic client binds the real provider manifest and rejects stale host or source state',async()=>{
  const f=fixture('uid: "019b2d14-4230-7db7-87d4-7d81cfaec932"\r\n');
  const source=await f.server.prepareManagedGraphitiManifest(new AbortController().signal);
  const hash=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
  const authority={configuration_digest:hash('configuration'),corpus_id:'native-fixture',policy_digest:hash('policy'),scope_digest:hash('scope')};
  const binding={...authority,source_snapshot_digest:source.source_snapshot_digest};
  const projection_id=`gkos_${'a'.repeat(32)}`;
  const mappings=source.manifest.map((item,i)=>({projection_episode_id:`episode-${i}`,source_digest:item.source_digest,source_id:item.source_id}));
  const observation=hash(JSON.stringify({binding,mappings,milestone:'persistence-verified',projection_id,searchability:'unverified'}));
  const publication={binding:{...binding,projection_id},mappings,observation,sequence:1};
  let allowed=true,calls=0,revoke=false;
  const options={api:f.server,endpoint:'http://127.0.0.1:1/graphiti/query',token:'x'.repeat(64),authority,publication,current:()=>allowed,
    fetcher:async(_url,init)=>{
      calls++; if(revoke) allowed=false;
      return new Response(JSON.stringify({contract_version:'gkos-graphiti-query/1.0.0-draft.1',request_id:JSON.parse(init.body).request_id,
        binding:publication.binding,hits:[{fact:'Synthetic fact',semantic_support:'unverified',citations:[mappings[0]]}]}),{headers:{'Content-Type':'application/json'}});
    }};
  const signal=new AbortController().signal;
  const client=await prepareNativeSemanticClient(options,signal);
  assert.ok(client);
  const result=await client.search('fact','one',signal);
  assert.equal(result.hits[0].fact,'Synthetic fact');
  assert.equal(client.isCurrent('fact','one',result),true);
  const connection=new NativeSemanticConnection();
  assert.equal(await connection.connect(options),true);
  const prior=await connection.search('fact','connection',signal);
  assert.equal(connection.isCurrent('fact','connection',prior),true);
  assert.equal(await connection.connect(options),true);
  assert.equal(connection.isCurrent('fact','connection',prior),false);
  const original=f.server.prepareManagedGraphitiManifest.bind(f.server);
  let release,started;
  const didStart=new Promise(resolve=>{started=resolve;});
  f.server.prepareManagedGraphitiManifest=async s=>{started();await new Promise(resolve=>{release=resolve;});return original(s);};
  const stale=connection.connect(options);
  await didStart;
  f.server.prepareManagedGraphitiManifest=original;
  assert.equal(await connection.connect(options),true);
  release(); assert.equal(await stale,false);
  assert.ok(await connection.search('fact','new-connection',signal));
  connection.disconnect();
  assert.equal(await connection.search('fact','disconnected',signal),null);
  const beforeRevocation=calls;
  revoke=true;
  assert.equal(await client.search('fact','two',signal),null);
  allowed=true; revoke=false;
  assert.equal(await client.search('fact','three',signal),null);
  assert.equal(calls,beforeRevocation+1);
  const fresh=await prepareNativeSemanticClient(options,signal);
  f.provider.markChanged('note.md');
  assert.equal(await fresh.search('fact','four',signal),null);
  assert.equal(calls,beforeRevocation+1);
  const reads=f.reads.length;
  assert.equal(await prepareNativeSemanticClient({...options,publication:{searchable:true}},signal),null);
  assert.equal(await prepareNativeSemanticClient({...options,current:async()=>true},signal),null);
  assert.equal(f.reads.length,reads);
  const profile={endpoint:options.endpoint,token:options.token,authority,publication,vaultIdentity:f.provider.vaultIdentity(),projectionTime:source.projection_time};
  assert.deepEqual(readNativeSemanticProfile(profile),profile);
  for(const invalid of [{...profile,endpoint:'https://name:secret@example.invalid/query'}, {...profile,extra:true}, {...profile,token:'short'}, {...profile,vaultIdentity:''}, {...profile,projectionTime:'yesterday'}])
    assert.equal(readNativeSemanticProfile(invalid),null);
});

for (const scenario of ["unannounced edit", "revision change", "revocation", "invalid UTF-8", "file replacement", "metadata change"]) {
  test(`evidence export refuses ${scenario} without returning stale evidence`, async () => {
    const f = fixture();
    await f.provider.getGraph();
    if (scenario === "unannounced edit") f.setBinary(Buffer.from(f.raw.replace("Exact", "Other")));
    if (scenario === "invalid UTF-8") { const bytes = Buffer.from(f.raw); bytes[bytes.length - 1] = 0xff; f.setBinary(bytes); }
    f.onRead(() => {
      if (scenario === "revision change") f.provider.markChanged(f.file.path);
      if (scenario === "revocation") f.settings.agentSensitivityCeiling = "public";
      if (scenario === "file replacement") f.vault.getAbstractFileByPath = () => ({ ...f.file });
      if (scenario === "metadata change") f.file.stat.mtime++;
    });
    await assert.rejects(f.server.callTool("export_graphiti_episodes", { include_source_evidence: true }), e => e.reason === "provider_unavailable");
  });
}

for (const field of ['vaultName', 'vaultIdentity', 'agentGraphNamespace', 'graphitiCombinedExtraction', 'graphitiSagaMapping']) {
  for (const boundary of ['source read', 'page return']) {
    test(`export refuses changed ${field} at ${boundary}`, async () => {
      const f = fixture();
      const change = () => {
        if (field === 'vaultName' || field === 'vaultIdentity') f.provider[field] = () => 'changed-corpus';
        else f.settings[field] = field === 'agentGraphNamespace' ? 'changed-namespace' : !f.settings[field];
      };
      if (boundary === 'source read') f.onRead(change);
      else {
        const original = f.server.qEpisodes.bind(f.server);
        f.server.qEpisodes = async (...args) => { const result = await original(...args); change(); return result; };
      }
      await assert.rejects(f.server.qEpisodePage(0, 10, true), e => e.reason === 'provider_unavailable');
    });
  }
}

test("evidence budget rejects oversized metadata before I/O and oversized actual reads before hashing", async () => {
  const f = fixture();
  const graph = await f.provider.getGraph();
  f.file.stat.size = MAX_SOURCE_EVIDENCE_BYTES + 1;
  await assert.rejects(f.provider.getIndexedSourceBytes(f.file.path, graph, MAX_SOURCE_EVIDENCE_BYTES), e => e.reason === "provider_unavailable");
  assert.equal(f.reads.length, 0);
  f.file.stat.size = Buffer.byteLength(f.raw);
  f.setBinary(new Uint8Array(MAX_SOURCE_EVIDENCE_BYTES + 1));
  await assert.rejects(f.provider.getIndexedSourceBytes(f.file.path, graph, MAX_SOURCE_EVIDENCE_BYTES), e => e.reason === "provider_unavailable");
});

test("one export rejects a provider that exceeds its byte budget", async () => {
  const f = fixture();
  const budgets = [];
  f.provider.getIndexedSourceBytes = async (_path, _graph, budget) => { budgets.push(budget); return new Uint8Array(budget + 1); };
  await assert.rejects(f.server.callTool("export_graphiti_episodes", { include_source_evidence: true }), e => e.reason === "provider_unavailable");
  assert.deepEqual(budgets, [MAX_SOURCE_EVIDENCE_BYTES]);
});

test("the page budget declines across distinct files and page metadata refuses policy changes", async () => {
  const f = fixture();
  f.settings.agentSensitivityCeiling = "secret";
  const budgets = [];
  f.provider.getIndexedSourceBytes = async (_path, _graph, budget) => { budgets.push(budget); return new Uint8Array(8); };
  await f.server.callTool("export_graphiti_episodes", { limit: 10, include_source_evidence: true });
  assert.deepEqual(budgets, [MAX_SOURCE_EVIDENCE_BYTES, MAX_SOURCE_EVIDENCE_BYTES - 8]);
  const original = f.server.qEpisodes.bind(f.server);
  f.server.qEpisodes = async (...args) => {
    const episodes = await original(...args);
    f.settings.agentSensitivityCeiling = "public";
    return episodes;
  };
  await assert.rejects(f.server.qEpisodePage(), e => e.reason === "provider_unavailable");
});

test("evidence reads refuse an old graph and operational paths before I/O", async () => {
  const f = fixture();
  const old = await f.provider.getGraph();
  f.provider.markChanged(f.file.path);
  const current = await f.provider.getGraph();
  assert.equal(await f.provider.getIndexedSourceBytes(f.file.path, old, MAX_SOURCE_EVIDENCE_BYTES), null);
  assert.equal(await f.provider.getIndexedSourceBytes(".gkx/private.md", current, MAX_SOURCE_EVIDENCE_BYTES), null);
  assert.equal(f.reads.length, 0);
});

test('relationship-only export pages attach the originating source byte evidence',async()=>{
  const f=fixture('supersedes:\r\n  - "[[private]]"\r\n');
  f.settings.agentSensitivityCeiling = "secret";
  const all=await f.server.qEpisodes();
  const offset=all.findIndex(e=>e.source==='fact_triple');
  assert.ok(offset>=0,'fixture must produce a relationship episode');
  const page=await f.server.qEpisodePage(offset,1,true);
  assert.equal(page.episodes.length,1);
  assert.equal(page.episodes[0].source,'fact_triple');
  const body=JSON.parse(page.episodes[0].episode_body);
  assert.equal(body.source_path,'note.md');
  assert.equal(body.source_evidence.sha256,createHash('sha256').update(Buffer.from(f.raw)).digest('hex'));
  assert.equal(body.content,undefined);
  assert.deepEqual(f.reads,['note.md']);
});


test('native manifest rejects a hidden UUID case alias before reading source bytes',async()=>{
 const uid='019b2d14-4230-7db7-87d4-7d81cfaec932';
 const f=fixture(`uid: "${uid}"\r\n`,uid.toUpperCase());
 await assert.rejects(f.server.prepareManagedGraphitiManifest(new AbortController().signal),e=>e.reason==='provider_unavailable');
 assert.deepEqual(f.reads,[]);
});

test('native history capture keeps exact bytes and Engine provenance in a one-use capability',async()=>{
 const uid='019b2d14-4230-7db7-87d4-7d81cfaec932',f=fixture(`uid: "${uid}"\r\n`);
 const capture=await f.server.prepareHistorySource(uid.toUpperCase(),new AbortController().signal,100000);
 assert.deepEqual(Object.keys(capture).sort(),['current','publish']);assert.equal(capture.current(),true);
 const graph=await f.provider.getGraph();
 const result=capture.publish(value=>value);
 assert.equal(result.source,uid);assert.equal(result.path,'note.md');assert.equal(result.corpus,f.provider.vaultIdentity());
 assert.equal(Buffer.from(result.bytes).toString(),f.raw);
 assert.equal(result.sourceDigest,'sha256:'+createHash('sha256').update(Buffer.from(f.raw)).digest('hex'));
 assert.deepEqual(result.projection,graph.nodes.find(node=>node.path==='note.md').gkx.projection);
 assert.equal(Object.hasOwn(result,'knownAt'),false);assert.equal(Object.hasOwn(result,'validAt'),false);
 assert.throws(()=>capture.publish(()=>assert.fail('second use')),e=>e.reason==='provider_unavailable');
 f.provider.markChanged('note.md');assert.equal(result.current(),false);
});

test('native history capture refuses hidden or duplicate identities and invalid budgets before byte reads',async()=>{
 const uid='019b2d14-4230-7db7-87d4-7d81cfaec932';
 for(const [frontmatter,hidden] of [['',uid],[`uid: "${uid}"\r\n`,uid.toUpperCase()]]){
  const f=fixture(frontmatter,hidden);
  await assert.rejects(f.server.prepareHistorySource(uid,new AbortController().signal,100000),e=>e.reason==='provider_unavailable');
  assert.deepEqual(f.reads,[]);
 }
 for(const budget of [0,-1,Infinity,64*1024*1024+1]){
  const f=fixture(`uid: "${uid}"\r\n`);
  await assert.rejects(f.server.prepareHistorySource(uid,new AbortController().signal,budget),e=>e.reason==='provider_unavailable');
  assert.deepEqual(f.reads,[]);
 }
});

test('native history capture rejects changes during reads and before publication',async()=>{
 const uid='019b2d14-4230-7db7-87d4-7d81cfaec932';
 for(const phase of ['read','publish'])for(const change of ['source','policy','corpus','abort']){
  const f=fixture(`uid: "${uid}"\r\n`),controller=new AbortController();
  const mutate=()=>{if(change==='source')f.provider.markChanged('note.md');if(change==='policy')f.settings.agentSensitivityCeiling='public';if(change==='corpus')f.provider.vaultIdentity=()=> 'another-corpus';if(change==='abort')controller.abort();};
  if(phase==='read')f.onRead(mutate);
  const prepare=()=>f.server.prepareHistorySource(uid,controller.signal,100000);
  if(phase==='read')await assert.rejects(prepare(),e=>e.reason==='provider_unavailable');
  else{const capture=await prepare();mutate();assert.throws(()=>capture.publish(()=>assert.fail('stale bytes')),e=>e.reason==='provider_unavailable');assert.equal(capture.current(),false);}
 }
});
