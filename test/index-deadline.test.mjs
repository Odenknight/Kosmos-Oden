import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['src/plugin/vault-provider.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {VaultDataProvider}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
test('synchronous indexing overrun cannot publish its candidate or clear pending edits',async()=>{
 const file={path:'one.md',name:'one.md',extension:'md',stat:{size:5,mtime:1,ctime:1}};
 const vault={getMarkdownFiles:()=>[file],getFiles:()=>[file],cachedRead:async()=> '# one'};
 const provider=new VaultDataProvider({vault},{defaultSensitivity:'internal'},{readMs:1000,buildMs:1000});
 const oldIndex=provider.index, originalNow=performance.now;
 let clock=0;performance.now=()=>clock;
 const create=provider.adapter.createIndex.bind(provider.adapter);
 provider.adapter={createIndex:()=>{const candidate=create();return {setFiles:(...args)=>{const value=candidate.setFiles(...args);clock=1001;return value;}};}};
 try {
  await assert.rejects(provider.getGraph(),e=>e.reason==='timeout');
  assert.equal(provider.index,oldIndex);assert.equal(provider.fullDirty,true);
 }finally{performance.now=originalNow;}
});
