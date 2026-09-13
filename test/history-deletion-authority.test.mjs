import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,copyFileSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
async function compile(file){return (await build({entryPoints:[fileURLToPath(new URL('../src/workspace/'+file,import.meta.url))],bundle:true,platform:'node',format:'esm',write:false})).outputFiles[0].text;}
const authorityText=await compile('history-deletion-authority.ts');
const {HistoryDeletionAuthority}=await import('data:text/javascript;base64,'+Buffer.from(authorityText).toString('base64'));
const {SourceObservationLedger}=await import('data:text/javascript;base64,'+Buffer.from(await compile('source-observation-ledger.ts')).toString('base64'));
const uid='550e8400-e29b-41d4-a716-446655440001',other='550e8400-e29b-41d4-a716-446655440002';
const options={enabled:true,corpus:'synthetic-history',maxReceipts:10};
function fixture(t,changes={}){
 const directory=mkdtempSync(join(tmpdir(),'kosmos-deletion-')),path=join(directory,'deletion.sqlite'),config={...options,...changes};
 const state={current:true,now:'2026-09-13T00:00:00.000Z'};const host={current:()=>state.current,now:()=>state.now};
 let authority=HistoryDeletionAuthority.open(config,()=>new DatabaseSync(path),host,true);
 t.after(()=>{try{authority.close();}finally{assert.equal(dirname(directory),tmpdir());rmSync(directory,{recursive:true,force:true});}});
 return {directory,path,state,host,config,get authority(){return authority;},reopen(){authority.close();authority=HistoryDeletionAuthority.open(config,()=>new DatabaseSync(path),host);return authority;}};
}
test('deletion authority defaults off and requires explicit bounds and current owner authority',()=>{
 assert.equal(HistoryDeletionAuthority.open(undefined,()=>assert.fail('opened'),null),null);
 assert.equal(HistoryDeletionAuthority.open({enabled:false},()=>assert.fail('opened'),null),null);
 for(const maxReceipts of [0,-1,Infinity,10001])assert.throws(()=>HistoryDeletionAuthority.open({...options,maxReceipts},()=>assert.fail('opened'),{current:()=>true,now:()=>''}));
 assert.throws(()=>HistoryDeletionAuthority.open(options,()=>assert.fail('opened'),{current:()=>false,now:()=>''}),/AUTHORITY_UNAVAILABLE/);
});
test('durable denial invalidates old snapshots and covers UUID case variants without storing content',t=>{
 const f=fixture(t),before=f.authority.capture();assert.equal(before.isDenied(uid),false);
 const receipt=f.authority.deny('deny-one',uid.toUpperCase(),()=>true);assert.equal(receipt.source,uid);assert.equal(before.current(),false);assert.throws(()=>before.isDenied(uid),/AUTHORITY_UNAVAILABLE/);
 const after=f.authority.capture();assert.equal(after.isDenied(uid),true);assert.equal(after.isDenied(uid.toUpperCase()),true);assert.equal(after.isDenied(other),false);
 f.reopen();assert.equal(after.current(),false);assert.equal(f.authority.capture().isDenied(uid),true);
 const db=new DatabaseSync(f.path);const body=JSON.parse(db.prepare('SELECT body FROM denials').get().body);db.close();assert.deepEqual(Object.keys(body).sort(),['deniedAt','operation','priorDigest','sequence','source']);
});
test('retry keeps original receipt; conflicting input and clock regression cannot append',t=>{
 const f=fixture(t),receipt=f.authority.deny('deny-one',uid,()=>true);f.state.now='2026-09-14T00:00:00.000Z';assert.deepEqual(f.authority.deny('deny-one',uid.toUpperCase(),()=>true),receipt);
 assert.throws(()=>f.authority.deny('deny-one',other,()=>true),/RETRY_CONFLICT/);f.state.now='2026-09-12T00:00:00.000Z';assert.throws(()=>f.authority.deny('deny-two',other,()=>true),/CLOCK_REGRESSED/);
 f.state.now=receipt.deniedAt;assert.equal(f.authority.deny('deny-two',other,()=>true).sequence,2);
});
test('action withdrawal at the final boundary and receipt capacity refuse without partial denial',t=>{
 const f=fixture(t,{maxReceipts:1});let calls=0;assert.throws(()=>f.authority.deny('withdrawn',uid,()=>++calls<2),/ACTION_STALE/);assert.equal(f.authority.capture().isDenied(uid),false);
 f.authority.deny('one',uid,()=>true);assert.throws(()=>f.authority.deny('two',other,()=>true),/CAPACITY/);assert.equal(f.authority.capture().isDenied(other),false);
});
test('unknown schemas, broken receipt chains and corrupt JSON cannot activate denial state',t=>{
 const f=fixture(t);f.authority.deny('one',uid,()=>true);const db=new DatabaseSync(f.path);db.prepare('UPDATE denials SET body=?').run('{PRIVATE-SENTINEL');db.close();assert.throws(()=>f.authority.capture(),error=>error.message==='HISTORY_DELETION_STORE_INVALID');
 const db2=new DatabaseSync(f.path);db2.exec('PRAGMA user_version=99');db2.close();assert.throws(()=>f.reopen(),/SCHEMA_UNSUPPORTED/);
});
test('observed owner failure cannot revive a captured deletion authority',t=>{
 const f=fixture(t),snapshot=f.authority.capture();f.state.current=false;assert.equal(snapshot.current(),false);f.state.current=true;assert.equal(snapshot.current(),false);assert.throws(()=>f.authority.capture(),/AUTHORITY_UNAVAILABLE/);
});
test('restoring only source history cannot restore access denied by the independent authority',t=>{
 const f=fixture(t),history=join(f.directory,'history.sqlite'),backup=join(f.directory,'history-before-denial.sqlite');
 const retention={enabled:true,corpus:options.corpus,maxAgeMs:86400000,maxBytes:10000,maxObservations:10};const bytes=Buffer.from('Retained synthetic note.');const hash=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
 const sourceInput={operation:'source-one',corpus:options.corpus,source:uid,path:'Source.md',kind:'source_version',sourceDigest:hash(bytes),validAt:null,authorityDigest:hash('a'),policyDigest:hash('p'),parserVersion:'synthetic',schemaVersion:'gkx-2.3'};
 const historyHost=()=>f.authority.bindHistoryHost(options.corpus,{current:()=>true,now:()=>f.state.now,canRead:()=>true,supports:()=>true});
 let ledger=SourceObservationLedger.open(retention,()=>new DatabaseSync(history),historyHost(),true);
 try{
  ledger.append(sourceInput,bytes);ledger.close();copyFileSync(history,backup);
  ledger=SourceObservationLedger.open(retention,()=>new DatabaseSync(history),historyHost());const pending=ledger.knownBy(uid,f.state.now);
  f.authority.deny('delete-source',uid,()=>true);assert.throws(()=>pending.publish(()=>assert.fail('revoked data published')),/HOST_STALE/);ledger.close();
  copyFileSync(backup,history);ledger=SourceObservationLedger.open(retention,()=>new DatabaseSync(history),historyHost());let visible='unset';ledger.knownBy(uid,f.state.now).publish(value=>visible=value);assert.equal(visible,null);
  assert.throws(()=>ledger.append({...sourceInput,operation:'resurrect'},bytes),/HOST_STALE/);
  f.authority.close();assert.throws(()=>ledger.knownBy(uid,f.state.now),/HOST_STALE/);
 }finally{ledger.close();}
});
test('process death after deny insert rolls back before commit and preserves a committed deny after restart',t=>{
 const f=fixture(t);f.authority.close();const module=join(f.directory,'authority.mjs');writeFileSync(module,authorityText);
 for(const stage of ['before','after']){
  const code=`import {DatabaseSync} from 'node:sqlite';import {HistoryDeletionAuthority} from ${JSON.stringify(pathToFileURL(module).href)};const raw=new DatabaseSync(${JSON.stringify(f.path)});
  const db={exec:sql=>raw.exec(sql),close:()=>raw.close(),prepare:sql=>{const stmt=raw.prepare(sql);return sql.startsWith('INSERT INTO denials')?{run(...args){const result=stmt.run(...args);if(${JSON.stringify(stage)}==='before')process.exit(77);return result;}}:stmt;}};
  const authority=HistoryDeletionAuthority.open(${JSON.stringify(options)},()=>db,{current:()=>true,now:()=> '2026-09-13T00:00:00.000Z'});authority.deny('crash-operation',${JSON.stringify(uid)},()=>true);process.exit(78);`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'});assert.equal(child.status,stage==='before'?77:78,child.stderr);
  const reopened=HistoryDeletionAuthority.open(options,()=>new DatabaseSync(f.path),f.host);try{assert.equal(reopened.capture().isDenied(uid),stage==='after');if(stage==='after')assert.equal(reopened.deny('crash-operation',uid,()=>true).sequence,1);}finally{reopened.close();}
 }
});


test('interior denial-chain corruption invalidates an existing capability even when the last row is unchanged',t=>{
 const f=fixture(t);f.authority.deny('one',uid,()=>true);f.authority.deny('two',other,()=>true);const snapshot=f.authority.capture();
 const db=new DatabaseSync(f.path);const body=JSON.parse(db.prepare('SELECT body FROM denials WHERE seq=1').get().body);body.priorDigest='sha256:'+ '0'.repeat(64);db.prepare('UPDATE denials SET body=? WHERE seq=1').run(JSON.stringify(body));db.close();
 assert.equal(snapshot.current(),false);assert.throws(()=>snapshot.isDenied(other),/AUTHORITY_UNAVAILABLE/);
});


const nativeHost = changes => ({current:()=>true,now:()=> '2026-09-13T00:00:00.000Z',canRead:()=>true,supports:()=>true,...changes});
test('history binding rejects another corpus and requires an independent live authority',t=>{
 const f=fixture(t);assert.throws(()=>f.authority.bindHistoryHost('another-corpus',nativeHost()),/CORPUS_MISMATCH/);
 assert.throws(()=>f.authority.bindHistoryHost(options.corpus,nativeHost({current:()=>false})),/AUTHORITY_UNAVAILABLE/);
 assert.throws(()=>f.authority.bindHistoryHost(options.corpus,nativeHost({canRead:true})),/HOST_INVALID/);
 f.authority.close();assert.throws(()=>f.authority.bindHistoryHost(options.corpus,nativeHost()),/AUTHORITY_UNAVAILABLE/);
});
test('denial absence never substitutes for a current native read grant',t=>{
 const f=fixture(t);const bound=f.authority.bindHistoryHost(options.corpus,nativeHost({canRead:source=>source===other}));
 assert.equal(bound.canRead(uid),false);assert.equal(bound.canRead(other),true);assert.equal(bound.canRead('invalid'),false);assert.equal(bound.current(),true);
 const asyncGrant=f.authority.bindHistoryHost(options.corpus,nativeHost({canRead:async()=>true}));assert.equal(asyncGrant.canRead(uid),false);
});
test('a native epoch change permanently invalidates an existing binding',t=>{
 const f=fixture(t);let valid=true;const bound=f.authority.bindHistoryHost(options.corpus,nativeHost({current:()=>valid}));
 valid=false;assert.equal(bound.current(),false);valid=true;assert.equal(bound.current(),false);assert.equal(bound.canRead(uid),false);
});
test('native authorization revocation during a read check cannot publish a true grant',t=>{
 const f=fixture(t);let valid=true;const bound=f.authority.bindHistoryHost(options.corpus,nativeHost({current:()=>valid,canRead:()=>{valid=false;return true;}}));
 assert.equal(bound.canRead(uid),false);valid=true;assert.equal(bound.current(),false);
});
test('a new denial invalidates bound hosts; a fresh host still refuses the denied UID',t=>{
 const f=fixture(t);const old=f.authority.bindHistoryHost(options.corpus,nativeHost());assert.equal(old.canRead(uid),true);
 f.authority.deny('one',uid,()=>true);assert.equal(old.current(),false);assert.equal(old.canRead(uid),false);
 const fresh=f.authority.bindHistoryHost(options.corpus,nativeHost());assert.equal(fresh.canRead(uid.toUpperCase()),false);assert.equal(fresh.canRead(other),true);
});
test('binding captures native function identities and preserves parser, clock and publication callbacks',t=>{
 const f=fixture(t);const host=nativeHost({canRead:()=>false,supports:(p,s)=>p==='parser'&&s==='schema',projectionCurrent:p=>p.version===1});const bound=f.authority.bindHistoryHost(options.corpus,host);
 host.canRead=()=>true;host.current=()=>false;assert.equal(bound.current(),true);assert.equal(bound.canRead(uid),false);assert.equal(bound.now(),'2026-09-13T00:00:00.000Z');
 assert.equal(bound.supports('parser','schema'),true);assert.equal(bound.supports('other','schema'),false);assert.equal(bound.projectionCurrent({version:1}),true);assert.equal(Object.isFrozen(bound),true);
});
