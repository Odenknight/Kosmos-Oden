import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

// Expected membership comes from the final 2026-07-28 schema, independently
// of the production set. Discovery is intentionally retained.
const output=await build({entryPoints:['src/plugin/agent-server.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {KosmosAgentServer,DEFAULT_AGENT_SETTINGS,MCP_CACHEABLE_RESULT_METHODS}=await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
test('final modern cache oracle includes all six complete-result methods',()=>{
  assert.deepEqual([...MCP_CACHEABLE_RESULT_METHODS].sort(),[
    'server/discover','tools/list','prompts/list','resources/list','resources/templates/list','resources/read',
  ].sort());
});
test('modern ping has no implemented RPC handler',async()=>{
  const server=new KosmosAgentServer(null,{...DEFAULT_AGENT_SETTINGS},{});
  const result=await server.mcpDispatch({jsonrpc:'2.0',id:1,method:'ping',params:{}});
  assert.equal(result.error?.code,-32601);
});
test('discovery retains private zero-TTL cache directives',async()=>{
  const server=new KosmosAgentServer(null,{...DEFAULT_AGENT_SETTINGS},{});
  const result=await server.mcpDispatch({jsonrpc:'2.0',id:2,method:'server/discover',params:{}});
  assert.equal(result.result.cacheScope,'private');
  assert.equal(result.result.ttlMs,0);
});
