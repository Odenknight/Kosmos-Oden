import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,copyFileSync,writeFileSync,readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
async function compile(file){return (await build({entryPoints:[fileURLToPath(new URL('../src/workspace/'+file,import.meta.url))],bundle:true,platform:'node',format:'esm',write:false})).outputFiles[0].text;}
const authorityText=await compile('history-deletion-authority.ts');
const {HistoryDeletionAuthority}=await import('data:text/javascript;base64,'+Buffer.from(authorityText).toString('base64'));
const historyText=await compile('source-observation-ledger.ts');
const {SourceObservationLedger}=await import('data:text/javascript;base64,'+Buffer.from(historyText).toString('base64'));
const uid='550e8400-e29b-41d4-a716-446655440001',other='550e8400-e29b-41d4-a716-446655440002';
const options={enabled:true,corpus:'synthetic-history',maxReceipts:10};
function fixture(t,changes={}){
 const directory=mkdtempSync(join(tmpdir(),'kosmos-deletion-')),path=join(directory,'deletion.sqlite'),config={...options,...changes};
 const state={current:true,now:'2026-09-13T00:00:00.000Z'};const host={current:()=>state.current,now:()=>state.now};
 let authority=HistoryDeletionAuthority.open(config,()=>new DatabaseSync(path),host,true);
 t.after(()=>{try{state.beforeClose?.();authority.close();}finally{assert.equal(dirname(directory),tmpdir());rmSync(directory,{recursive:true,force:true});}});
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

const historyRetention={enabled:true,corpus:options.corpus,maxAgeMs:86400000,maxBytes:100000,maxObservations:20};
const hash=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
function purgeFixture(t){
 const f=fixture(t),path=join(f.directory,'purge.sqlite');
 const bytes=Buffer.from('PURGE-PAYLOAD-SENTINEL-'+ 'dust'.repeat(2000));
 const input={operation:'retain-one',corpus:options.corpus,source:uid,path:'PURGE-PATH-SENTINEL.md',kind:'source_version',sourceDigest:hash(bytes),validAt:null,authorityDigest:hash('a'),policyDigest:hash('p'),parserVersion:'test',schemaVersion:'test'};
 const host=()=>f.authority.bindHistoryHost(options.corpus,nativeHost({now:()=>f.state.now,projectionCurrent:()=>true}));
 let ledger=SourceObservationLedger.open(historyRetention,()=>new DatabaseSync(path),host(),true);
 ledger.append(input,bytes);
 const otherBytes=Buffer.from('Keep this unrelated note.');
 ledger.append({...input,operation:'retain-other',source:other,path:'Keep.md',sourceDigest:hash(otherBytes)},otherBytes);
 ledger.append({version:1,operation:'publish-one',corpus:options.corpus,kind:'projection_published',projectionId:'PURGE-PROJECTION-SENTINEL',configurationDigest:hash('c'),publicationDigest:hash('pub'),authorityDigest:hash('a'),policyDigest:hash('p'),sources:[ledger.sourceReference(uid,1),ledger.sourceReference(other,2)]},null);
 f.state.beforeClose=()=>ledger.close();
 return {...f,path,bytes,input,get ledger(){return ledger;},deny(){f.authority.deny('purge-one',uid,()=>true);this.reopen();},reopen(afterUpdate){ledger.close();ledger=SourceObservationLedger.open(historyRetention,()=>{const raw=new DatabaseSync(path);if(!afterUpdate)return raw;return {exec:sql=>raw.exec(sql),close:()=>raw.close(),prepare:sql=>{const stmt=raw.prepare(sql);return sql.startsWith('UPDATE observations SET')?{run(...args){const result=stmt.run(...args);afterUpdate();return result;}}:stmt;}};},host());},rows(){const db=new DatabaseSync(path);try{return db.prepare('SELECT * FROM observations ORDER BY seq').all();}finally{db.close();}}};
}

test('purge needs a durable denial and current action; a hold preserves every row',t=>{
 const f=purgeFixture(t),before=f.rows();
 assert.throws(()=>f.ledger.purge(f.authority,'missing',()=>true,()=>false),/DENIAL_REQUIRED/);
 f.deny();assert.throws(()=>f.ledger.purge(f.authority,'purge-one',()=>false,()=>false),/AUTHORITY_STALE/);
 assert.equal(f.ledger.purge(f.authority,'purge-one',()=>true,()=>true).reason,'retention_hold');
 assert.deepEqual(f.rows(),before);
});

test('purge removes source and dependent projection content, preserves unrelated rows, and retries after reopen',t=>{
 const f=purgeFixture(t),before=f.rows();f.deny();
 const receipt=f.ledger.purge(f.authority,'purge-one',()=>true,()=>false);
 assert.equal(receipt.erasedRecords,2);const rows=f.rows();assert.deepEqual(rows[1],before[1]);
 for(const row of [rows[0],rows[2]]){const input=JSON.parse(row.input);assert.equal(input.kind,'purged');assert.equal(row.payload,null);assert.equal(row.parent,null);assert.equal(input.path,undefined);assert.equal(input.sourceDigest,undefined);assert.equal(input.sources,undefined);}
 f.reopen();assert.deepEqual(f.ledger.purge(f.authority,'purge-one',()=>true,()=>true),receipt);
 let visible='unset';f.ledger.knownBy(uid,f.state.now).publish(value=>visible=value);assert.equal(visible,null);
 assert.throws(()=>f.ledger.append({...f.input,operation:'resurrect',source:uid.toUpperCase()},f.bytes),/HOST_STALE|SOURCE_PURGED/);
});

for(const boundary of ['hold','action'])test('purge rolls back actual updates when '+boundary+' changes before commit',t=>{
 const f=purgeFixture(t);f.deny();const before=f.rows();let changed=false;
 f.reopen(()=>{changed=true;});
 const run=()=>f.ledger.purge(f.authority,'purge-one',()=>boundary!=='action'||!changed,()=>boundary==='hold'&&changed);
 if(boundary==='hold')assert.equal(run().reason,'retention_hold');else assert.throws(run,/AUTHORITY_STALE/);
 assert.equal(changed,true);assert.deepEqual(f.rows(),before);f.reopen();
 assert.equal(f.ledger.purge(f.authority,'purge-one',()=>true,()=>false).erasedRecords,2);
});


test('closed SQLite file no longer contains purged payload, path, or projection sentinels',t=>{
 const f=purgeFixture(t);f.ledger.close();
 const before=readFileSync(f.path);for(const marker of ['PURGE-PAYLOAD-SENTINEL','PURGE-PATH-SENTINEL','PURGE-PROJECTION-SENTINEL'])assert.equal(before.includes(Buffer.from(marker)),true);
 f.reopen();f.deny();f.ledger.purge(f.authority,'purge-one',()=>true,()=>false);f.ledger.close();
 const after=readFileSync(f.path);for(const marker of ['PURGE-PAYLOAD-SENTINEL','PURGE-PATH-SENTINEL','PURGE-PROJECTION-SENTINEL'])assert.equal(after.includes(Buffer.from(marker)),false,marker);
 assert.equal(after.includes(Buffer.from('Keep this unrelated note.')),true);
});

test('process death during purge rolls back updates; death after commit preserves retry receipt',t=>{
 const f=purgeFixture(t);f.deny();const before=f.rows();f.ledger.close();f.authority.close();
 const historyModule=join(f.directory,'history.mjs'),authorityModule=join(f.directory,'authority.mjs');writeFileSync(historyModule,historyText);writeFileSync(authorityModule,authorityText);
 const authorityPath=join(f.directory,'deletion.sqlite');
 for(const stage of ['before','after']){
  const code=`import {DatabaseSync} from 'node:sqlite';import {SourceObservationLedger} from ${JSON.stringify(pathToFileURL(historyModule).href)};import {HistoryDeletionAuthority} from ${JSON.stringify(pathToFileURL(authorityModule).href)};
  const now=()=> '2026-09-13T00:00:00.000Z';const authority=HistoryDeletionAuthority.open(${JSON.stringify(options)},()=>new DatabaseSync(${JSON.stringify(authorityPath)}),{current:()=>true,now});
  const raw=new DatabaseSync(${JSON.stringify(f.path)});const db={exec:sql=>raw.exec(sql),close:()=>raw.close(),prepare:sql=>{const stmt=raw.prepare(sql);return sql.startsWith('UPDATE observations SET')?{run(...args){const result=stmt.run(...args);if(${JSON.stringify(stage)}==='before')process.exit(77);return result;}}:stmt;}};
  const host=authority.bindHistoryHost(${JSON.stringify(options.corpus)},{current:()=>true,now,canRead:()=>true,supports:()=>true});const ledger=SourceObservationLedger.open(${JSON.stringify(historyRetention)},()=>db,host);
  ledger.purge(authority,'purge-one',()=>true,()=>false);process.exit(78);`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'});assert.equal(child.status,stage==='before'?77:78,child.stderr.slice(0,1000));
  if(stage==='before')assert.deepEqual(f.rows(),before);
  else{const authority=HistoryDeletionAuthority.open(options,()=>new DatabaseSync(authorityPath),f.host);const ledger=SourceObservationLedger.open(historyRetention,()=>new DatabaseSync(f.path),authority.bindHistoryHost(options.corpus,nativeHost()));try{assert.equal(ledger.purge(authority,'purge-one',()=>true,()=>false).erasedRecords,2);}finally{ledger.close();authority.close();}}
 }
});

test('purge removes case-variant versions and corrupt retained bytes without allowing unbound resurrection',t=>{
 const f=purgeFixture(t);
 f.ledger.append({...f.input,operation:'retain-alias',source:uid.toUpperCase()},f.bytes);
 f.ledger.append({...f.input,operation:'retain-delete',kind:'source_deleted',sourceDigest:null},null);
 f.ledger.close();const db=new DatabaseSync(f.path);db.prepare('UPDATE observations SET payload=? WHERE seq=1').run(Buffer.from('corrupt retained payload'));db.close();
 f.reopen();f.deny();assert.equal(f.ledger.purge(f.authority,'purge-one',()=>true,()=>false).erasedRecords,4);f.ledger.close();
 const unbound=SourceObservationLedger.open(historyRetention,()=>new DatabaseSync(f.path),nativeHost());
 try{
  assert.throws(()=>unbound.append({...f.input,operation:'resurrect',source:uid.toUpperCase()},f.bytes),/SOURCE_PURGED/);
  const marker=JSON.parse(f.rows()[0].input);assert.throws(()=>unbound.append(marker,null),/PURGE_INPUT_FORBIDDEN/);
  let visible='unset';unbound.knownBy(uid,f.state.now).publish(value=>visible=value);assert.equal(visible,null);
 }finally{unbound.close();}
});
