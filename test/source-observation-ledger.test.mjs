import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';
import {stableJson} from 'gkos-engine/retrieval';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
const compiled=await build({entryPoints:[fileURLToPath(new URL('../src/workspace/source-observation-ledger.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const moduleText=compiled.outputFiles[0].text;
const {SourceObservationLedger}=await import('data:text/javascript;base64,'+Buffer.from(moduleText).toString('base64'));
const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const source='550e8400-e29b-41d4-a716-446655440001';
const config={enabled:true,corpus:'synthetic-history',maxAgeMs:86400000,maxBytes:10000,maxObservations:10};
const bytes=Buffer.from('First observation.');
const input=(operation='one',payload=bytes)=>({operation,corpus:config.corpus,source,path:'Source.md',kind:'source_version',sourceDigest:digest(payload),validAt:null,authorityDigest:digest('authority'),policyDigest:digest('policy'),parserVersion:'synthetic-parser-1',schemaVersion:'gkx-2.3'});
function fixture(t,retention=config) {
 const directory=mkdtempSync(join(tmpdir(),'kosmos-history-')),path=join(directory,'history.sqlite');
 const state={time:'2026-09-13T00:00:00.000Z',current:true,read:true};
 const host={now:()=>state.time,current:()=>state.current,canRead:()=>state.read,supports:(parser,schema)=>parser==='synthetic-parser-1'&&schema==='gkx-2.3'};
 let ledger=SourceObservationLedger.open(retention,()=>new DatabaseSync(path),host,true);
 t.after(()=>{try{ledger?.close();}finally{assert.equal(dirname(directory),tmpdir());rmSync(directory,{recursive:true,force:true});}});
 return {directory,path,state,host,get ledger(){return ledger;},reopen(){ledger.close();ledger=SourceObservationLedger.open(retention,()=>new DatabaseSync(path),host);return ledger;}};
}
function read(ledger,time='2026-09-13T23:59:00.000Z') {let result='not-published';ledger.knownBy(source,time).publish(value=>{result=value;});return result;}
test('disabled storage never opens a database; explicit finite limits and owner authority are required',()=>{
 assert.equal(SourceObservationLedger.open({enabled:false},()=>assert.fail('opened'),null),null);
 for(const change of [{maxAgeMs:0},{maxBytes:Infinity},{maxObservations:-1},{extra:true}]) assert.throws(()=>SourceObservationLedger.open({...config,...change},()=>assert.fail('opened'),{current:()=>true,now:()=>'',canRead:()=>true,supports:()=>true}));
 assert.throws(()=>SourceObservationLedger.open(config,()=>assert.fail('opened'),{current:()=>false,now:()=>'',canRead:()=>true,supports:()=>true}),/HOST_STALE/);
});
test('retained versions survive restart and distinguish known time from unknown validity',t=>{
 const f=fixture(t);assert.equal(f.ledger.append(input(),bytes).sequence,1);assert.equal(read(f.ledger,'2026-09-12T23:59:59.999Z'),null);
 const next=Buffer.from('Second observation.');f.state.time='2026-09-13T01:00:00.000Z';f.ledger.append(input('two',next),next);f.reopen();
 assert.equal(Buffer.from(read(f.ledger,'2026-09-13T00:30:00.000Z').bytes).toString(),bytes.toString());assert.equal(read(f.ledger).input.validAt,null);assert.equal(read(f.ledger).knownAt,f.state.time);
});
test('retry preserves receipt; changed input conflicts; regressing clock refuses append',t=>{
 const f=fixture(t),receipt=f.ledger.append(input(),bytes);f.state.time='2026-09-14T00:00:00.000Z';assert.deepEqual(f.ledger.append(input(),bytes),receipt);
 assert.throws(()=>f.ledger.append({...input(),path:'Other.md'},bytes),/RETRY_CONFLICT/);f.state.time='2026-09-12T00:00:00.000Z';assert.throws(()=>f.ledger.append(input('two'),bytes),/CLOCK_REGRESSED/);
 f.state.time=receipt.knownAt;assert.equal(f.ledger.append(input('two'),bytes).sequence,2);
});
test('source deletion blocks later cutoffs without erasing explicitly retained earlier versions',t=>{
 const f=fixture(t);f.ledger.append(input(),bytes);f.state.time='2026-09-13T01:00:00.000Z';f.ledger.append({...input('delete'),kind:'source_deleted',sourceDigest:null},null);
 assert.equal(read(f.ledger),null);assert.equal(read(f.ledger,'2026-09-13T00:00:00.000Z').sequence,1);
});
test('age and capacity limits refuse coverage without silently deleting retained data',t=>{
 const f=fixture(t,{...config,maxObservations:1});f.ledger.append(input(),bytes);assert.throws(()=>f.ledger.append(input('two'),bytes),/CAPACITY/);
 f.state.time='2026-09-15T00:00:00.000Z';assert.equal(read(f.ledger),null);
});
test('revocation, changed watermark and hidden source prevent pending publication',t=>{
 const f=fixture(t);f.ledger.append(input(),bytes);const result=f.ledger.knownBy(source,f.state.time);f.state.current=false;assert.throws(()=>result.publish(()=>assert.fail('published')),/HOST_STALE/);f.state.current=true;f.reopen();
 const stale=f.ledger.knownBy(source,f.state.time);f.ledger.append(input('two'),bytes);assert.throws(()=>stale.publish(()=>assert.fail('published')),/SNAPSHOT_STALE/);
 const hidden=f.ledger.knownBy(source,f.state.time);f.state.read=false;let value;hidden.publish(v=>value=v);assert.equal(value,null);assert.equal(read(f.ledger),null);assert.throws(()=>f.ledger.append(input('three'),bytes),/HOST_STALE/);
});
test('malformed identity, metadata, digest and missing payload are refused without executing accessors',t=>{
 const f=fixture(t);for(const item of [{...input(),source:'ambiguous'},{...input(),path:'../escape.md'},{...input(),sourceDigest:digest('wrong')},{...input(),extra:true},{...input(),validAt:'yesterday'}]) assert.throws(()=>f.ledger.append(item,bytes));
 assert.throws(()=>f.ledger.append(input(),null),/PAYLOAD_INVALID/);assert.throws(()=>f.ledger.append({...input(),get parserVersion(){assert.fail('getter invoked');}},bytes));
});
test('payload and envelope corruption make history unavailable',t=>{
 const f=fixture(t);f.ledger.append(input(),bytes);const db=new DatabaseSync(f.path);db.prepare('UPDATE observations SET payload=?').run(Buffer.from('corrupt'));db.close();assert.throws(()=>read(f.ledger),/PAYLOAD_INVALID/);
 const db2=new DatabaseSync(f.path);db2.prepare('UPDATE observations SET known_at=?').run('2026-09-13T00:00:01.000Z');db2.close();assert.throws(()=>read(f.ledger),/STORE_INVALID/);
});
test('unsupported schema refuses activation',t=>{
 const f=fixture(t);f.ledger.close();const db=new DatabaseSync(f.path);db.exec('PRAGMA user_version=99');db.close();assert.throws(()=>SourceObservationLedger.open(config,()=>new DatabaseSync(f.path),f.host),/SCHEMA_UNSUPPORTED/);
});
test('process death before commit rolls back; death after commit retains retry identity',t=>{
 const f=fixture(t);f.ledger.close();const modulePath=join(f.directory,'ledger.mjs');writeFileSync(modulePath,moduleText);
 for(const stage of ['before','after']) {
  const code=`import {DatabaseSync} from 'node:sqlite';import {SourceObservationLedger} from ${JSON.stringify(pathToFileURL(modulePath).href)};let clockRead=false,checksAfterClock=0;
   const host={current:()=>{if(clockRead&&++checksAfterClock===3&&${JSON.stringify(stage)}==='before')process.exit(77);return true;},now:()=>{clockRead=true;return '2026-09-13T00:00:00.000Z';},canRead:()=>true,supports:()=>true};
   const ledger=SourceObservationLedger.open(${JSON.stringify(config)},()=>new DatabaseSync(${JSON.stringify(f.path)}),host);ledger.append(${JSON.stringify(input())},Buffer.from(${JSON.stringify([...bytes])}));process.exit(78);`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'});assert.equal(child.status,stage==='before'?77:78,child.stderr);
  const ledger=SourceObservationLedger.open(config,()=>new DatabaseSync(f.path),f.host);try{if(stage==='before')assert.equal(read(ledger),null);else assert.deepEqual(ledger.append(input(),bytes),{sequence:1,knownAt:f.state.time});}finally{ledger.close();}
 }
});


test('default-off, retention changes and unexpected triggers cannot activate a store',t=>{
 assert.equal(SourceObservationLedger.open(undefined,()=>assert.fail('opened'),null),null);
 const f=fixture(t);f.ledger.close();
 assert.throws(()=>SourceObservationLedger.open({...config,maxObservations:11},()=>new DatabaseSync(f.path),f.host),/RETENTION_CHANGED/);
 const db=new DatabaseSync(f.path);db.exec("CREATE TRIGGER unexpected AFTER INSERT ON observations BEGIN UPDATE observations SET known_at='2026-09-13T23:00:00.000Z'; END");db.close();
 assert.throws(()=>SourceObservationLedger.open(config,()=>new DatabaseSync(f.path),f.host),/SCHEMA_UNSUPPORTED/);
});
test('retry does not acknowledge missing retained payload',t=>{
 const f=fixture(t);f.ledger.append(input(),bytes);const db=new DatabaseSync(f.path);db.exec('UPDATE observations SET payload=NULL');db.close();assert.throws(()=>f.ledger.append(input(),bytes),/PAYLOAD_INVALID/);
});
test('a hidden source payload neither loads nor changes readable history; paths do not grant identity',t=>{
 const f=fixture(t);f.ledger.append(input(),bytes);const other='550e8400-e29b-41d4-a716-446655440002';
 f.ledger.append({...input('hidden'),source:other,path:'Source.md'},bytes);f.ledger.close();
 const db=new DatabaseSync(f.path);db.prepare('UPDATE observations SET payload=? WHERE seq=2').run(Buffer.from('corrupt hidden payload'));db.close();
 const ledger=SourceObservationLedger.open(config,()=>new DatabaseSync(f.path),{...f.host,canRead:id=>id===source});
 try{assert.equal(read(ledger).sequence,1);let hidden;ledger.knownBy(other,f.state.time).publish(v=>hidden=v);assert.equal(hidden,null);}finally{ledger.close();}
 const denied=SourceObservationLedger.open(config,()=>new DatabaseSync(f.path),{...f.host,canRead:id=>id===other});
 try{assert.equal(read(denied),null);}finally{denied.close();}
});
test('revocation during the last read-authority callback prevents payload publication',t=>{
 const f=fixture(t);f.ledger.append(input(),bytes);f.ledger.close();let checks=0,active=true;
 const ledger=SourceObservationLedger.open(config,()=>new DatabaseSync(f.path),{...f.host,current:()=>active,canRead:()=>{if(++checks===4)active=false;return true;}});
 try{const snapshot=ledger.knownBy(source,f.state.time);assert.throws(()=>snapshot.publish(()=>assert.fail('published after revocation')),/HOST_STALE/);}finally{ledger.close();}
});


test('byte retention accounts for envelope metadata even when source payload is tiny',t=>{
 const f=fixture(t,{...config,maxBytes:100});assert.throws(()=>f.ledger.append(input(),bytes),/CAPACITY/);assert.equal(read(f.ledger),null);
});


test('schema changes after opening and malformed stored JSON fail without exposing hidden metadata',t=>{
 const f=fixture(t);f.ledger.append(input(),bytes);const db=new DatabaseSync(f.path);db.exec('PRAGMA user_version=99');db.close();
 assert.throws(()=>read(f.ledger),/SCHEMA_UNSUPPORTED/);
 const db2=new DatabaseSync(f.path);db2.exec('PRAGMA user_version=1');db2.prepare('UPDATE observations SET input=?').run('{PRIVATE-HIDDEN-SENTINEL');db2.close();
 assert.throws(()=>read(f.ledger),error=>error.message==='OBSERVATION_STORE_INVALID');
});


test('unsupported parser interpretation cannot be retained or published',t=>{
 const f=fixture(t);assert.throws(()=>f.ledger.append({...input(),schemaVersion:'unknown'},bytes),/INTERPRETATION_UNSUPPORTED/);
 f.ledger.append(input(),bytes);f.ledger.close();const ledger=SourceObservationLedger.open(config,()=>new DatabaseSync(f.path),{...f.host,supports:()=>false});
 try{assert.throws(()=>read(ledger),/INTERPRETATION_UNSUPPORTED/);}finally{ledger.close();}
});


test('an observed authority failure permanently invalidates outstanding ledger capabilities',t=>{
 const f=fixture(t);f.ledger.append(input(),bytes);const pending=f.ledger.knownBy(source,f.state.time);
 f.state.current=false;assert.throws(()=>f.ledger.knownBy(source,f.state.time),/HOST_STALE/);f.state.current=true;
 assert.throws(()=>pending.publish(()=>assert.fail('revoked capability revived')),/HOST_STALE/);
});
test('the publication watermark binds every committed envelope, not just row count',t=>{
 const f=fixture(t);f.ledger.append(input(),bytes);const other='550e8400-e29b-41d4-a716-446655440002';
 f.ledger.append({...input('two'),source:other},bytes);const pending=f.ledger.knownBy(source,f.state.time);
 const db=new DatabaseSync(f.path);const row=db.prepare('SELECT * FROM observations WHERE seq=2').get();const changed=JSON.parse(row.input);changed.path='Renamed.md';
 const receipt=digest(stableJson({sequence:row.seq,operation:row.operation,knownAt:row.known_at,parent:row.parent,input:changed}));
 db.prepare('UPDATE observations SET input=?, receipt_digest=? WHERE seq=2').run(stableJson(changed),receipt);db.close();
 assert.throws(()=>pending.publish(()=>assert.fail('changed watermark published')),/SNAPSHOT_STALE/);
});
