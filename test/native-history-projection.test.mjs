import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {buildManagedGraphitiManifest} from 'gkos-engine/graphiti';
async function load(file){const result=await build({entryPoints:['src/workspace/'+file],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));}
const {prepareNativeHistoryProjection}=await load('native-history.ts');
const {SourceObservationLedger}=await load('source-observation-ledger.ts');
const hash=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
const uid='019b2d14-4230-7db7-87d4-7d81cfaec932',corpus='synthetic-history',time='2026-09-13T00:00:00.000Z';
async function fixture(t){
 const directory=mkdtempSync(join(tmpdir(),'kosmos-history-witness-')),path=join(directory,'history.sqlite');
 const state={allowed:true,corpus,witness:null},bytes=Buffer.from('Synthetic retained source.');
 const manifest=await buildManagedGraphitiManifest([{source_id:uid,raw:bytes,episode:{name:'Source',episode_body:'{}',source_description:'synthetic',reference_time:time}}]);
 const authority={configuration_digest:hash('configuration'),corpus_id:'synthetic-publication',policy_digest:hash('policy'),scope_digest:hash('scope')};
 const binding={...authority,source_snapshot_digest:manifest.source_snapshot_digest},projection_id='gkos_'+'a'.repeat(32);
 const mappings=manifest.manifest.map((m,i)=>({projection_episode_id:'episode-'+i,source_digest:m.source_digest,source_id:m.source_id}));
 const publication={binding:{...binding,projection_id},mappings,observation:hash(JSON.stringify({binding,mappings,milestone:'persistence-verified',projection_id,searchability:'unverified'})),sequence:1};
 const api={provider:{vaultIdentity:()=>state.corpus},prepareManagedGraphitiManifest:async()=>({...manifest,current:()=>state.allowed})};
 const retention={enabled:true,corpus,maxAgeMs:86400000,maxBytes:100000,maxObservations:10};
 const ledger=SourceObservationLedger.open(retention,()=>new DatabaseSync(path),{current:()=>state.allowed,now:()=>time,canRead:()=>true,supports:()=>true,projectionCurrent:input=>state.witness?.projectionCurrent(input)===true},true);
 t.after(()=>{ledger.close();assert.equal(dirname(directory),tmpdir());rmSync(directory,{recursive:true,force:true});});
 const source={operation:'source',corpus,source:uid,path:'Source.md',kind:'source_version',sourceDigest:hash(bytes),validAt:null,authorityDigest:hash('scope'),policyDigest:hash('policy'),parserVersion:'synthetic',schemaVersion:'synthetic'};
 ledger.append(source,bytes);
 const options={api,authority,publication,current:()=>state.allowed,historyCorpus:corpus,operation:'publication',references:[ledger.sourceReference(uid,1)]};
 return {state,path,ledger,options,source,bytes,async prepare(changes={}){return prepareNativeHistoryProjection({...options,...changes},new AbortController().signal);}};
}

test('native publication witness binds exact retained source receipts and preserves source time',async t=>{
 const f=await fixture(t),witness=await f.prepare();assert.ok(witness);f.state.witness=witness;
 assert.equal(witness.input.corpus,corpus);assert.equal(witness.input.publicationDigest,f.options.publication.observation);
 const receipt=f.ledger.append(witness.input,null);assert.equal(receipt.sequence,2);
 assert.deepEqual(f.ledger.append(witness.input,null),receipt);
 assert.equal(f.ledger.sourceReference(uid,1).sourceDigest,hash(f.bytes));
 assert.equal(witness.projectionCurrent({...witness.input,projectionId:'gkos_'+'b'.repeat(32)}),false);
 assert.throws(()=>witness.input.sources.push({}),TypeError);
});

test('native publication witness refuses missing, extra, reordered or mismatched source references',async t=>{
 const f=await fixture(t),ref=f.options.references[0];
 for(const references of [[],[ref,ref],[{...ref,sourceDigest:hash('wrong')}],[{...ref,sequence:0}],[{...ref,source:uid.toUpperCase()}],[{...ref,receiptDigest:'bad'}]])assert.equal(await f.prepare({references}),null);
 assert.equal(await f.prepare({historyCorpus:'other'}),null);
 assert.equal(await f.prepare({publication:{searchable:true}}),null);
 assert.equal(await f.prepare({publication:{...f.options.publication,observation:hash('forged')}}),null);
});

test('actual history append refuses a forged retained receipt even with a valid publication witness',async t=>{
 const f=await fixture(t),references=[{...f.options.references[0],receiptDigest:hash('forged')}];
 const witness=await f.prepare({references});assert.ok(witness);f.state.witness=witness;
 assert.throws(()=>f.ledger.append(witness.input,null),/REFERENCE/);
 const db=new DatabaseSync(f.path);try{assert.equal(db.prepare('SELECT count(*) AS n FROM observations').get().n,1);}finally{db.close();}
});

test('source or host revocation invalidates the witness permanently before append',async t=>{
 const f=await fixture(t),witness=await f.prepare();f.state.witness=witness;
 f.state.allowed=false;assert.equal(witness.projectionCurrent(witness.input),false);
 f.state.allowed=true;assert.equal(witness.projectionCurrent(witness.input),false);
 assert.throws(()=>f.ledger.append(witness.input,null),/PUBLICATION|PROJECTION/);
});

test('publication preparation detaches references and rejects corpus changes during manifest preparation',async t=>{
 const f=await fixture(t),ref=f.options.references[0],original=f.options.api.prepareManagedGraphitiManifest;
 f.options.references=[{...ref}];
 f.options.api.prepareManagedGraphitiManifest=async()=>{f.options.references[0].receiptDigest=hash('mutated');return original();};
 const witness=await f.prepare();assert.ok(witness);assert.equal(witness.input.sources[0].receiptDigest,ref.receiptDigest);
 f.options.api.prepareManagedGraphitiManifest=async()=>{f.state.corpus='changed';return original();};
 assert.equal(await f.prepare(),null);
});


test('native publication witness verifies the same detached observation it records',async t=>{
 const f=await fixture(t),publication={...f.options.publication};let calls=0;
 Object.defineProperty(publication,'observation',{enumerable:true,get(){calls++;return calls===1?hash('forged'):f.options.publication.observation;}});
 assert.equal(await f.prepare({publication}),null);assert.equal(calls,1);
});
