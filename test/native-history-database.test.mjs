import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync,renameSync,writeFileSync,unlinkSync,linkSync,existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
const bundle=await build({entryPoints:['src/workspace/native-history-database.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {openNativeHistoryDatabase}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const windows={skip:process.platform!=='win32'};
function powershell(directory,script){return execFileSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,env:{...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toLowerCase()!=="psmodulepath")),KOSMOS_HISTORY_TEST_DIRECTORY:directory},stdio:['ignore','pipe','pipe']});}
function fixture(t){
 const directory=mkdtempSync(join(homedir(),'.kosmos-history-test-'));
 t.after(()=>{assert.equal(dirname(directory),homedir());rmSync(directory,{recursive:true,force:true});});
 powershell(directory,`$ErrorActionPreference='Stop';$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=[System.Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false);foreach($id in @($sid.Value,'S-1-5-18','S-1-5-32-544')){$rule=[System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new($id),'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule)};[System.IO.Directory]::SetAccessControl($env:KOSMOS_HISTORY_TEST_DIRECTORY,$acl)`);
 return {directory,path:join(directory,'observations.sqlite')};
}

test('Windows private database capability opens once and refuses implicit recreation',windows,t=>{
 const f=fixture(t),cap=openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>true,true);
 const db=cap.openDatabase();try{db.exec('CREATE TABLE evidence (value TEXT); INSERT INTO evidence VALUES (\'synthetic\')');assert.equal(cap.current(),true);assert.throws(()=>cap.openDatabase(),/UNAVAILABLE/);}finally{db.close();cap.close();}
 assert.equal(cap.current(),false);assert.throws(()=>openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>true,true),/UNAVAILABLE/);
 const reopened=openNativeHistoryDatabase(f.directory,'observations.sqlite',()=>true);const reader=reopened.openDatabase();try{assert.equal(reader.prepare('SELECT value FROM evidence').get().value,'synthetic');}finally{reader.close();reopened.close();}
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
