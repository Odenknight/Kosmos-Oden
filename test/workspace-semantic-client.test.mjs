import test from 'node:test';
import assert from 'node:assert/strict';
import {createSemanticQueryClient} from '../dist/kosmos-workspace-host.mjs';
const binding={corpus_id:'fixture',scope_digest:`sha256:${'a'.repeat(64)}`,policy_digest:`sha256:${'b'.repeat(64)}`,source_snapshot_digest:`sha256:${'c'.repeat(64)}`,projection_id:'projection',configuration_digest:`sha256:${'d'.repeat(64)}`};
const version='gkos-graphiti-query/1.0.0-draft.1';
const context=()=>({status:{contract_version:version,mode:'managed',searchable:true,binding},decision:'allow',complete_dependency_scope:true,authorized_episodes:new Map()});
const result=()=>({contract_version:version,request_id:'one',binding,hits:[]});
const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const config={endpoint:'http://127.0.0.1:1/graphiti/query',token:'x'.repeat(64)};

test('semantic client sends only query fields and accepts an exact bound response',async()=>{
  const client=createSemanticQueryClient({...config,current:context,fetcher:async(url,options)=>{
    assert.equal(options.redirect,'error');
    assert.deepEqual(JSON.parse(options.body),{query:'relay',request_id:'one',limit:10});
    return response(result());
  }});
  assert.deepEqual(await client.search('relay','one',new AbortController().signal),result());
});

test('semantic client denies revoked scope and changed response binding',async()=>{
  for(const scenario of ['revoked','forged','oversize']) {
    let allowed=true;
    const client=createSemanticQueryClient({...config,current:()=>({...context(),decision:allowed?'allow':'deny'}),fetcher:async()=>{
      if(scenario==='revoked') allowed=false;
      if(scenario==='oversize') return new Response('x'.repeat(131073),{headers:{'Content-Type':'application/json'}});
      return response(scenario==='forged'?{...result(),binding:{...binding,corpus_id:'other'}}:result());
    }});
    assert.equal(await client.search('relay','one',new AbortController().signal),null);
  }
});

test('cancelled transports retain physical slots until they settle',async()=>{
  const resolvers=[];
  const client=createSemanticQueryClient({...config,current:context,fetcher:()=>new Promise(resolve=>resolvers.push(resolve))});
  for(let i=0;i<2;i++) {
    const controller=new AbortController();
    const pending=client.search('relay','one',controller.signal);
    controller.abort();
    assert.equal(await pending,null);
  }
  assert.equal(await client.search('relay','one',new AbortController().signal),null);
  assert.equal(resolvers.length,2);
  for(const resolve of resolvers) resolve(response(result()));
  await new Promise(resolve=>setTimeout(resolve,0));
  const controller=new AbortController();
  const pending=client.search('relay','one',controller.signal);
  assert.equal(resolvers.length,3);
  resolvers[2](response(result()));
  assert.deepEqual(await pending,result());
});
