import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {chmodSync,existsSync,linkSync,lstatSync,mkdtempSync,readFileSync,renameSync,rmSync,statfsSync,symlinkSync,unlinkSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';

const linux={skip:process.platform!=='linux'};
const hasPosixAcl=process.platform==='linux'&&['setfacl','getfacl'].every(command=>{
  try { execFileSync(command,['--version'],{stdio:'ignore'});return true; } catch { return false; }
});
let openNativeHistoryDatabase;
if (process.platform==='linux') {
  const bundle=await build({entryPoints:[resolve('src/workspace/native-history-database.ts')],bundle:true,platform:'node',format:'esm',write:false});
  ({openNativeHistoryDatabase}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64')));
}

function fixture(t,parent=homedir()) {
  const directory=mkdtempSync(join(parent,'.kosmos-history-linux-'));
  chmodSync(directory,0o700);
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  return {directory,path:join(directory,'observations.sqlite')};
}

test('Linux private database creates, writes, reopens, and preserves existing state',linux,t=>{
  const f=fixture(t),cap=openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>true,true);
  assert.equal(lstatSync(f.path).mode&0o7777,0o600);
  const db=cap.openDatabase();
  db.exec("CREATE TABLE evidence (value TEXT); INSERT INTO evidence VALUES ('synthetic')");
  assert.equal(cap.current(),true);db.close();cap.close();
  const reopened=openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>true),reader=reopened.openDatabase();
  assert.equal(reader.prepare('SELECT value FROM evidence').get().value,'synthetic');reader.close();reopened.close();
  const original=readFileSync(f.path);
  assert.throws(()=>openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>true,true),/UNAVAILABLE/);
  assert.deepEqual(readFileSync(f.path),original);
});

test('Linux storage refuses invalid authority, names, helper profiles, and implicit creation',linux,t=>{
  const f=fixture(t);
  assert.throws(()=>openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>false,true),/UNAVAILABLE/);
  assert.throws(()=>openNativeHistoryDatabase(f.directory,'../escape.sqlite',()=>true,true),/UNAVAILABLE/);
  assert.throws(()=>openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>true),/UNAVAILABLE/);
  assert.throws(()=>openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>true,true,{path:'/missing',sha256:'sha256:'+'0'.repeat(64)}),/UNAVAILABLE/);
  assert.equal(existsSync(f.path),false);
});

test('Linux capability permanently invalidates on authority, mode, link, or identity changes',linux,t=>{
  let allowed=true;
  const authority=fixture(t),a=openNativeHistoryDatabase(authority.directory,'observations.sqlite',()=>allowed,true);
  allowed=false;assert.equal(a.current(),false);allowed=true;assert.equal(a.current(),false);

  const mode=fixture(t),m=openNativeHistoryDatabase(mode.directory,'observations.sqlite',()=>true,true);
  chmodSync(mode.path,0o640);assert.equal(m.current(),false);chmodSync(mode.path,0o600);assert.equal(m.current(),false);

  const linked=fixture(t),l=openNativeHistoryDatabase(linked.directory,'observations.sqlite',()=>true,true),alias=join(linked.directory,'alias.sqlite');
  linkSync(linked.path,alias);assert.equal(l.current(),false);unlinkSync(alias);assert.equal(l.current(),false);

  const replaced=fixture(t),r=openNativeHistoryDatabase(replaced.directory,'observations.sqlite',()=>true,true),old=join(replaced.directory,'old.sqlite');
  renameSync(replaced.path,old);writeFileSync(replaced.path,'replacement',{mode:0o600});assert.equal(r.current(),false);
  unlinkSync(replaced.path);renameSync(old,replaced.path);assert.equal(r.current(),false);
});

test('Linux storage enforces directory and ancestor permissions and canonical paths',linux,t=>{
  const badRoot=fixture(t);chmodSync(badRoot.directory,0o750);
  assert.throws(()=>openNativeHistoryDatabase(badRoot.directory,'observations.sqlite',()=>true,true),/UNAVAILABLE/);

  const parent=mkdtempSync(join(homedir(),'.kosmos-history-parent-'));t.after(()=>rmSync(parent,{recursive:true,force:true}));
  const child=fixture(t,parent);chmodSync(parent,0o777);
  assert.throws(()=>openNativeHistoryDatabase(child.directory,'observations.sqlite',()=>true,true),/UNAVAILABLE/);

  const liveParent=mkdtempSync(join(homedir(),'.kosmos-history-live-parent-'));t.after(()=>rmSync(liveParent,{recursive:true,force:true}));
  chmodSync(liveParent,0o700);
  const liveChild=fixture(t,liveParent),live=openNativeHistoryDatabase(liveChild.directory,'observations.sqlite',()=>true,true);
  chmodSync(liveParent,0o755);assert.equal(live.current(),false);
  chmodSync(liveParent,0o700);assert.equal(live.current(),false);

  const target=fixture(t),alias=join(homedir(),`.kosmos-history-symlink-${process.pid}-${Date.now()}`);
  symlinkSync(target.directory,alias,'dir');t.after(()=>rmSync(alias,{force:true}));
  assert.throws(()=>openNativeHistoryDatabase(alias,'observations.sqlite',()=>true,true),/UNAVAILABLE/);

  const fileLink=fixture(t),sentinel=join(fileLink.directory,'sentinel');
  writeFileSync(sentinel,'sentinel',{mode:0o600});symlinkSync(sentinel,fileLink.path);
  assert.throws(()=>openNativeHistoryDatabase(fileLink.directory,'observations.sqlite',()=>true,true),/UNAVAILABLE/);
});

test('Linux validates live rollback-journal privacy and refuses WAL/SHM sidecars',linux,t=>{
  const f=fixture(t),cap=openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>true,true),db=cap.openDatabase();
  try {
    db.exec("CREATE TABLE evidence (value TEXT); BEGIN IMMEDIATE; INSERT INTO evidence VALUES ('synthetic')");
    const journal=f.path+'-journal';assert.equal(existsSync(journal),true);assert.equal(lstatSync(journal).mode&0o7777,0o600);
    assert.equal(cap.current(),true);chmodSync(journal,0o640);assert.equal(cap.current(),false);
  } finally { try{db.exec('ROLLBACK')}catch{} db.close();cap.close(); }

  const wal=fixture(t),walCap=openNativeHistoryDatabase(wal.directory,'observations.sqlite',()=>true,true);
  writeFileSync(wal.path+'-wal','synthetic',{mode:0o600});assert.equal(walCap.current(),false);
});

test('Linux ACL masks preserve private effective access and invalidate grants',linux,t=>{
  if (!hasPosixAcl) return t.skip('setfacl/getfacl unavailable');
  const set=(path,entry)=>execFileSync('setfacl',['-n','-m',entry,path],{stdio:'ignore'});
  const acl=path=>execFileSync('getfacl',['--numeric','--absolute-names',path],{encoding:'utf8'});

  const file=fixture(t),fileCap=openNativeHistoryDatabase(file.directory,'observations.sqlite',()=>true,true);
  set(file.path,'u:65534:rw-,m::---');
  assert.equal(lstatSync(file.path).mode&0o7777,0o600);
  assert.match(acl(file.path),/^user:65534:rw-\s+#effective:---$/m);
  assert.equal(fileCap.current(),true);
  set(file.path,'m::r--');assert.equal(fileCap.current(),false);
  set(file.path,'m::---');assert.equal(fileCap.current(),false);

  const directory=fixture(t),directoryCap=openNativeHistoryDatabase(directory.directory,'observations.sqlite',()=>true,true);
  set(directory.directory,'u:65534:rwx,m::---');
  assert.equal(lstatSync(directory.directory).mode&0o7777,0o700);
  assert.match(acl(directory.directory),/^user:65534:rwx\s+#effective:---$/m);
  assert.equal(directoryCap.current(),true);
  set(directory.directory,'m::r-x');assert.equal(directoryCap.current(),false);
  set(directory.directory,'m::---');assert.equal(directoryCap.current(),false);
});

test('Linux refuses a non-ext-family filesystem when one is writable',linux,t=>{
  const home=homedir(),mounts=readFileSync('/proc/self/mountinfo','utf8').trim().split('\n').map(line=>line.split(' ')[4]?.replace(/\\040/g,' '));
  const candidate=mounts.find(path=>path?.startsWith(home+'/') && existsSync(path) && statfsSync(path,{bigint:true}).type!==0xef53n);
  if (!candidate) return t.skip('no non-ext mount beneath the native home is available');
  let f;
  try { f=fixture(t,candidate); } catch { return t.skip('non-ext fixture root is not writable'); }
  assert.throws(()=>openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>true,true),/UNAVAILABLE/);
});
