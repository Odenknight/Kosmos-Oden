import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync,renameSync,writeFileSync,unlinkSync,linkSync,existsSync,readFileSync,copyFileSync,appendFileSync,realpathSync,lstatSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
const bundle=await build({entryPoints:['src/workspace/native-history-database.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {openNativeHistoryDatabase:openDatabase}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const helper=process.env.KOSMOS_HISTORY_ACL_HELPER_PROFILE?JSON.parse(readFileSync(process.env.KOSMOS_HISTORY_ACL_HELPER_PROFILE,'utf8')):undefined;
const openNativeHistoryDatabase=(...args)=>openDatabase(args[0],args[1],args[2],args[3],helper);
const windows={skip:process.platform!=='win32'};
function reportAclRefusal(directory){
 if(process.env.KOSMOS_HISTORY_ACL_DIAGNOSTIC!=='reason-v1')return;
 let reason='diagnostic-error',directoryCanonical=null,filePresent=null,fileCanonical=null,fileSingleLink=null;
 try{
  directoryCanonical=realpathSync(directory)===directory;
  const file=join(directory,'observations.sqlite');filePresent=existsSync(file);
  if(filePresent){fileCanonical=realpathSync(file)===file;fileSingleLink=lstatSync(file).nlink===1;}
  // Reuse the actual checker in a read-only diagnostic; never print its ACL output.
  const source=readFileSync('src/workspace/native-history-database.ts','utf8');
  const checker=source.match(/const WINDOWS_PRIVATE = `([^`]+)`;/)?.[1];
  assert(checker && !checker.includes('${'));
  const script=`$env:KOSMOS_HISTORY_DIRECTORY=$env:KOSMOS_HISTORY_TEST_DIRECTORY;$file=Join-Path $env:KOSMOS_HISTORY_DIRECTORY 'observations.sqlite';$env:KOSMOS_HISTORY_FILE=if(Test-Path -LiteralPath $file){$file}else{''};try { & {${checker}} | Out-Null; 'ok' } catch { $known=@('remote','parent-owner','parent-access','owner','acl','shared','access');if($_.Exception.Message -cin $known){$_.Exception.Message}else{'diagnostic-error'} }`;
  const result=execFileSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:1024,stdio:['ignore','pipe','pipe'],env:{...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toLowerCase()!=='psmodulepath')),KOSMOS_HISTORY_TEST_DIRECTORY:directory}}).trim();
  if(['ok','remote','parent-owner','parent-access','owner','acl','shared','access'].includes(result))reason=result;
 }catch{}
 console.error('# history-acl-diagnostic '+JSON.stringify({schema:2,scope:'existing-fixture-and-ancestors',reason,directoryCanonical,filePresent,fileCanonical,fileSingleLink}));
}
function powershell(directory,script){return execFileSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,env:{...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toLowerCase()!=="psmodulepath")),KOSMOS_HISTORY_TEST_DIRECTORY:directory},stdio:['ignore','pipe','pipe']});}
function fixture(t){
 const directory=mkdtempSync(join(homedir(),'.kosmos-history-test-'));
 t.after(()=>{assert.equal(dirname(directory),homedir());rmSync(directory,{recursive:true,force:true});});
 powershell(directory,`$ErrorActionPreference='Stop';$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=[System.Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false);foreach($id in @($sid.Value,'S-1-5-18','S-1-5-32-544')){$rule=[System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new($id),'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule)};[System.IO.Directory]::SetAccessControl($env:KOSMOS_HISTORY_TEST_DIRECTORY,$acl)`);
 return {directory,path:join(directory,'observations.sqlite')};
}

test('Windows private database capability opens once and refuses implicit recreation',windows,t=>{
 const f=fixture(t);let cap;
 try{cap=openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>true,true);}catch(error){reportAclRefusal(f.directory);throw error;}
 const privateAcl=JSON.parse(powershell(f.directory,`$acl=Get-Acl -LiteralPath (Join-Path $env:KOSMOS_HISTORY_TEST_DIRECTORY 'observations.sqlite');[pscustomobject]@{ownerIsCurrent=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -eq [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value;protected=$acl.AreAccessRulesProtected}|ConvertTo-Json -Compress`));
 assert.equal(privateAcl.ownerIsCurrent,true);assert.equal(privateAcl.protected,true);
 const db=cap.openDatabase();try{db.exec('CREATE TABLE evidence (value TEXT); INSERT INTO evidence VALUES (\'synthetic\')');assert.equal(cap.current(),true);assert.throws(()=>cap.openDatabase(),/UNAVAILABLE/);}finally{db.close();cap.close();}
 assert.equal(cap.current(),false);assert.throws(()=>openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>true,true),/UNAVAILABLE/);
 const reopened=openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>true);const reader=reopened.openDatabase();try{assert.equal(reader.prepare('SELECT value FROM evidence').get().value,'synthetic');}finally{reader.close();reopened.close();}
});

test('Windows private creation is exclusive and preserves an existing file',windows,t=>{
 const f=fixture(t),original=Buffer.from('existing evidence');writeFileSync(f.path,original);
 assert.throws(()=>openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>true,true),/UNAVAILABLE/);
 assert.deepEqual(readFileSync(f.path),original);
});

test('Windows storage refuses absent authority, missing databases and invalid filenames before creation',windows,t=>{
 const f=fixture(t);
 for(const args of [['observations.sqlite',()=>false,true],['../escape.sqlite',()=>true,true],['observations.sqlite',()=>true,false]])assert.throws(()=>openNativeHistoryDatabase(f.directory,...args),/UNAVAILABLE/);
 assert.equal(existsSync(f.path),false);
});

test('Windows storage detects file replacement and cannot revive after restoration',windows,t=>{
 const f=fixture(t),cap=openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>true,true),old=join(f.directory,'old.sqlite');
 renameSync(f.path,old);writeFileSync(f.path,'replacement');assert.equal(cap.current(),false);
 unlinkSync(f.path);renameSync(old,f.path);assert.equal(cap.current(),false);
});

test('Windows storage detects new hard links and owner withdrawal',windows,t=>{
 const f=fixture(t);let allowed=true;const cap=openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>allowed,true);
 const alias=join(f.directory,'alias.sqlite');linkSync(f.path,alias);assert.equal(cap.current(),false);unlinkSync(alias);assert.equal(cap.current(),false);
 const g=fixture(t),second=openNativeHistoryDatabase(g.directory,'observations.sqlite',()=>allowed,true);
 allowed=false;assert.equal(second.current(),false);allowed=true;assert.equal(second.current(),false);
});

test('Windows storage rejects changed ACLs before opening SQLite',windows,t=>{
 const f=fixture(t),cap=openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>true,true);
 powershell(f.directory,`$ErrorActionPreference='Stop';$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=[System.Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false);foreach($id in @($sid.Value,'S-1-5-18','S-1-5-32-544')){$own=[System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new($id),'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($own)};$rule=[System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new('S-1-1-0'),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule);[System.IO.Directory]::SetAccessControl($env:KOSMOS_HISTORY_TEST_DIRECTORY,$acl)`);
 assert.equal(cap.current(),false);assert.throws(()=>cap.openDatabase(),/UNAVAILABLE/);
 assert.throws(()=>openNativeHistoryDatabase(f.directory,'denials.sqlite',()=>true,true),/UNAVAILABLE/);
 assert.equal(existsSync(join(f.directory,'denials.sqlite')),false);
});


test('Windows storage refuses linked journals before opening the database',windows,t=>{
 const f=fixture(t),cap=openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>true,true);
 const target=join(f.directory,'sentinel');writeFileSync(target,'synthetic');linkSync(target,f.path+'-journal');
 assert.equal(cap.current(),false);assert.throws(()=>cap.openDatabase(),/UNAVAILABLE/);
});


test('Windows storage verifies helper bytes before creation and refuses a changed executable',windows,t=>{
 const f=fixture(t),path=join(f.directory,'checker.exe');writeFileSync(path,'synthetic non-executable');
 assert.throws(()=>openDatabase(f.directory,'observations.sqlite',()=>true,true,{path,sha256:'sha256:'+'0'.repeat(64)}),/UNAVAILABLE/);
 assert.equal(existsSync(f.path),false);
 if(helper && helper.kind!=='node-api'){
  copyFileSync(helper.path,path);const profile={path,sha256:helper.sha256};
  const cap=openDatabase(f.directory,'observations.sqlite',()=>true,true,profile);
  profile.sha256='sha256:'+'0'.repeat(64);assert.equal(cap.current(),true);
  appendFileSync(path,'changed');assert.equal(cap.current(),false);assert.throws(()=>cap.openDatabase(),/UNAVAILABLE/);
 }
});


test('Windows Node-API helper binds its profile and refuses untrusted module kinds',windows,t=>{
 const f=fixture(t);
 assert.throws(()=>openDatabase(f.directory,'observations.sqlite',()=>true,true,{path:join(f.directory,'missing.node'),sha256:'sha256:'+'0'.repeat(64),kind:'unknown'}),/UNAVAILABLE/);
 assert.equal(existsSync(f.path),false);
 if(helper?.kind==='node-api'){
  const profile={...helper},cap=openDatabase(f.directory,'observations.sqlite',()=>true,true,profile);
  profile.kind=undefined;profile.sha256='sha256:'+'0'.repeat(64);profile.path='changed';
  assert.equal(cap.current(),true);cap.close();assert.equal(cap.current(),false);
 }
});


test('Windows Node-API module replacement invalidates the live capability',windows,t=>{
 if(helper?.kind!=='node-api')return;
 const f=fixture(t),modulePath=join(f.directory,basename(helper.path)),storage=join(f.directory,'storage.mjs'),runner=join(f.directory,'check.mjs');
 copyFileSync(helper.path,modulePath);writeFileSync(storage,bundle.outputFiles[0].text);
 writeFileSync(runner,`
  import assert from 'node:assert/strict';
  import {renameSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
  import {join} from 'node:path';
  import {openNativeHistoryDatabase} from './storage.mjs';
  const profile=JSON.parse(process.argv[2]),directory=process.argv[3];
  const cap=openNativeHistoryDatabase(directory,'observations.sqlite',()=>true,true,profile);
  assert.equal(cap.current(),true);
  renameSync(profile.path,profile.path+'.old');writeFileSync(profile.path,'changed');
  assert.equal(cap.current(),false);
  assert.throws(()=>openNativeHistoryDatabase(directory,'denials.sqlite',()=>true,true,profile),/UNAVAILABLE/);
  assert.equal(existsSync(join(directory,'denials.sqlite')),false);
  unlinkSync(profile.path);renameSync(profile.path+'.old',profile.path);
  assert.equal(cap.current(),false);assert.throws(()=>cap.openDatabase(),/UNAVAILABLE/);
 `);
 execFileSync(process.execPath,[runner,JSON.stringify({...helper,path:modulePath}),f.directory],{windowsHide:true,timeout:15000,stdio:['ignore','pipe','pipe']});
});


test('Windows Node-API checker refuses malformed arguments and matches the executable',windows,t=>{
 if(helper?.kind!=='node-api')return;
 const f=fixture(t);writeFileSync(f.path,'synthetic');
 const module={exports:{}};process.dlopen(module,helper.path);const check=module.exports.check;
 for(const args of [[],[f.directory],[f.directory,f.path,'extra'],[null,f.path],[7,f.path],[f.directory+String.fromCharCode(0),f.path],['x'.repeat(32768),f.path],['',f.path],[f.directory,join(f.directory,'absent')]])assert.throws(()=>check(...args),/UNAVAILABLE/);
 const executable=JSON.parse(readFileSync('dist/native/history-acl.json','utf8'));
 const expected=execFileSync(executable.path,[],{encoding:'utf8',windowsHide:true,env:{...process.env,KOSMOS_HISTORY_DIRECTORY:f.directory,KOSMOS_HISTORY_FILE:f.path}}).trim();
 assert.equal(check(f.directory,f.path),expected);
});


test('Windows Node-API loader refuses a shared installation before creating storage',windows,t=>{
 if(helper?.kind!=='node-api')return;
 const f=fixture(t),storage=fixture(t),path=join(f.directory,basename(helper.path));copyFileSync(helper.path,path);
 powershell(f.directory,`$ErrorActionPreference='Stop';$acl=Get-Acl -LiteralPath $env:KOSMOS_HISTORY_TEST_DIRECTORY;$rule=[System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new('S-1-1-0'),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule);[System.IO.Directory]::SetAccessControl($env:KOSMOS_HISTORY_TEST_DIRECTORY,$acl)`);
 assert.throws(()=>openDatabase(storage.directory,'observations.sqlite',()=>true,true,{...helper,path}),/UNAVAILABLE/);
 assert.equal(existsSync(storage.path),false);
});
