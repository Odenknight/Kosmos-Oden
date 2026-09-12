import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {build} from 'esbuild';
const output=await build({entryPoints:['src/plugin/agent-server.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {KosmosAgentServer,DEFAULT_AGENT_SETTINGS}=await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
const core=await build({stdin:{contents:'export {buildGraph} from "gkos-engine";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {buildGraph}=await import(`data:text/javascript;base64,${Buffer.from(core.outputFiles[0].text).toString('base64')}`);
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
const tick=()=>new Promise(r=>setImmediate(r));
async function start(provider,timeout=70){
 const server=new KosmosAgentServer(http,{...DEFAULT_AGENT_SETTINGS,defaultSensitivity:"internal",agentEnabled:true,agentPort:0,agentBindMode:'loopback',agentRequireToken:false},provider,timeout);
 server.start();await once(server.server,'listening');
 const port=server.server.address().port;
 return{server,port,close(){server.server?.closeAllConnections();server.stop();}};
}
function request(port,path,method='GET',body){return new Promise((resolve,reject)=>{
 const req=http.request({host:'127.0.0.1',port,path,method},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text),headers:res.headers}));});req.on('error',reject);req.end(body);
});}

test('whole-operation deadline responds and releases slots while the provider remains unsettled',async()=>{
 const pending=deferred(), graph=buildGraph([], []);
 const h=await start({getGraph:()=>pending.promise,vaultName:()=> 'Synthetic',lanAddresses:()=>[]});
 try{
  const response=await request(h.port,'/overview');
  assert.equal(response.status,504);assert.equal(response.body.error,'timeout');
  assert.equal(response.headers.connection,'close');
  assert.equal(h.server.inFlight,0);assert.equal(h.server.perAgentInFlight.size,0);
  assert.equal((await request(h.port,'/health')).status,200);
  pending.resolve(graph);await tick();await tick();assert.equal(h.server.inFlight,0);
 }finally{pending.resolve(graph);h.close();}
});

test('a late note read cannot emit traversal after the request deadline',async()=>{
 const pending=deferred();const graph=buildGraph([{relativePath:'one.md',content:'---\nsensitivity: public\n---\n# one'}], [], undefined, {defaultSensitivity:'internal'});
 const h=await start({getGraph:async()=>graph,getNoteContent:()=>pending.promise,vaultName:()=> 'Synthetic',lanAddresses:()=>[]});
 const seen=[];h.server.onTraversal=(...args)=>seen.push(args);
 try{
  assert.equal((await request(h.port,'/note?path=one.md')).status,504);
  pending.resolve('late content');await tick();await tick();assert.deepEqual(seen,[]);
 }finally{pending.resolve('late content');h.close();}
});

test('partial request body receives a bounded transport error and cannot resume dispatch',async()=>{
 const h=await start({vaultName:()=> 'Synthetic',lanAddresses:()=>[]});
 let req;
 try{
  const response=await new Promise((resolve,reject)=>{
   req=http.request({host:'127.0.0.1',port:h.port,path:'/mcp',method:'POST',headers:{'Content-Length':'100','Content-Type':'application/json'}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));});
   req.on('error',reject);req.write('{"jsonrpc":');
  });
  assert.equal(response.status,504);assert.equal(response.body.error.code,-33001);assert.equal(response.body.id,null);
  assert.equal(h.server.inFlight,0);assert.equal(h.server.perAgentInFlight.size,0);
 }finally{req?.destroy();h.close();}
});

test('authorization change during a read prevents late content and traversal',async()=>{
 const pending=deferred();const graph=buildGraph([{relativePath:'one.md',content:'---\nsensitivity: public\n---\n# one'}], [], undefined, {defaultSensitivity:'internal'});
 let started;const reached=new Promise(r=>{started=r;});
 const h=await start({getGraph:async()=>graph,getNoteContent:()=>{started();return pending.promise;},vaultName:()=> 'Synthetic',lanAddresses:()=>[]});
 const seen=[];h.server.onTraversal=(...args)=>seen.push(args);
 try{
  const response=request(h.port,'/note?path=one.md');await Promise.race([reached,new Promise((_,reject)=>setTimeout(()=>reject(new Error('read not reached')),1000))]);
  h.server.settings.agentRequireToken=true;h.server.settings.agentToken='synthetic-rotated-token';
  pending.resolve('must not be returned');const result=await response;
  assert.equal(result.status,503);assert.equal(result.body.error,'provider_unavailable');assert.deepEqual(seen,[]);
 }finally{pending.resolve('cleanup');h.close();}
});




test('listener failure finalizes active work and fences old callbacks across restart',async()=>{
 const pending=deferred(),graph=buildGraph([],[]);
 let started;const reached=new Promise(r=>{started=r;});
 const h=await start({getGraph:()=>{started();return pending.promise;},vaultName:()=> 'Synthetic',lanAddresses:()=>[]},1000);
 try {
  const response=request(h.port,'/overview');await reached;
  const old=h.server.server;old.emit('error',new Error('synthetic listener failure'));
  assert.equal((await response).status,503);assert.equal(h.server.inFlight,0);
  h.server.start();await once(h.server.server,'listening');
  old.emit('error',new Error('late error'));
  assert.equal(h.server.status,'running');assert.ok(h.server.server);
  pending.resolve(graph);await tick();assert.equal(h.server.inFlight,0);
 }finally{pending.resolve(graph);h.close();}
});
