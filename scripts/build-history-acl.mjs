import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
if(process.platform!=='win32')throw Error('The history ACL helper requires a Windows C++ build host.');
const root=resolve(import.meta.dirname,'..'),output=join(root,'dist/native');mkdirSync(output,{recursive:true});
const vswhere=join(process.env['ProgramFiles(x86)'],'Microsoft Visual Studio/Installer/vswhere.exe');
const vs=execFileSync(vswhere,['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],{encoding:'utf8',windowsHide:true}).trim();
if(!vs || /["%!\r\n]/.test(vs))throw Error('A supported Visual C++ build installation is required.');
const vcvars=join(vs,'VC/Auxiliary/Build/vcvars64.bat');
// Capture the compiler environment privately; never print environment values.
const command='""'+vcvars+'" >nul && set"';
const environment=execFileSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c',command],{encoding:'utf8',windowsHide:true,windowsVerbatimArguments:true});
const env={...process.env};for(const line of environment.split(/\r?\n/)){const split=line.indexOf('=');if(split>0)env[line.slice(0,split)]=line.slice(split+1);}
const compiler=(env.Path||env.PATH).split(';').map(folder=>join(folder,'cl.exe')).find(existsSync);if(!compiler)throw Error('Visual C++ compiler unavailable.');
const source=join(root,'native/windows/history-acl.cpp'),binary=join(output,'history-acl.exe');
execFileSync(compiler,['/nologo','/std:c++17','/O2','/MT','/EHsc','/W4','/WX',source,'/Fo'+join(output,'history-acl.obj'),'/Fe'+binary,'/link','Advapi32.lib'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
const sha=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
writeFileSync(join(output,'history-acl.json'),JSON.stringify({version:1,path:binary,sha256:sha(readFileSync(binary)),sourceSha256:sha(readFileSync(source))},null,2)+'\n');
const headers=join(root,'native/windows/node-api-v22.22.1');
const provenance=JSON.parse(readFileSync(join(headers,'sources.json'),'utf8'));
for(const item of provenance)if(sha(readFileSync(join(headers,item.file)))!=='sha256:'+item.sha256)throw Error('Node-API header provenance mismatch.');
const addonSource=join(root,'native/windows/history-acl-addon.cpp'),addon=join(output,'history-acl.node');
execFileSync(compiler,['/nologo','/std:c++17','/O2','/MT','/EHsc','/W4','/WX','/LD',addonSource,'/Fo'+join(output,'history-acl-addon.obj'),'/Fe'+addon,'/link','Advapi32.lib'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
const addonHash=sha(readFileSync(addon)),installedName=join(output,'history-acl-'+addonHash.slice(7)+'.node');
if(existsSync(installedName)){if(sha(readFileSync(installedName))!==addonHash)throw Error('Existing content-addressed module changed.');}
else copyFileSync(addon,installedName);
writeFileSync(join(output,'history-acl-addon.json'),JSON.stringify({version:1,kind:'node-api',path:installedName,sha256:addonHash,sourceSha256:sha(readFileSync(source)),adapterSha256:sha(readFileSync(addonSource)),nodeApiVersion:8,headers:provenance},null,2)+'\n');
console.log('Built Windows history ACL executable and Node-API module with artifact hash manifests.');
