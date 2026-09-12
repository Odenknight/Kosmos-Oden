import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { build } from 'esbuild';

async function load(entry) {
  const output = await build({entryPoints:[entry], bundle:true, platform:'node', format:'esm', write:false});
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
}
const { VaultDataProvider } = await load('src/plugin/vault-provider.ts');
const { KosmosAgentServer, DEFAULT_AGENT_SETTINGS } = await load('src/plugin/agent-server.ts');
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise,resolve}; }

test('note read infrastructure failure stays distinct from not found', async () => {
  const file = {path:'note.md',stat:{size:1,mtime:1,ctime:1}};
  const provider = new VaultDataProvider({vault:{getAbstractFileByPath:()=>file,cachedRead:async()=>{throw new Error('host unavailable');}}},{defaultSensitivity:'internal'});
  await assert.rejects(provider.getNoteContent('note.md'));
});

test('operational rename does not invalidate an already dirty graph', () => {
  const provider = new VaultDataProvider({vault:{}},{defaultSensitivity:'internal'});
  const revision = provider.revision;
  provider.markRenamed('.gkx/old.md','.gkx/new.md');
  assert.equal(provider.revision,revision);
});

function harness() {
  const server = new KosmosAgentServer(null,{...DEFAULT_AGENT_SETTINGS,agentRequireToken:false},{});
  const operations=[];
  server.dispatch=async(_req,_res,claim)=>{claim('test-client');const op=deferred();operations.push(op);await op.promise;};
  const req=()=>Object.assign(new EventEmitter(),{headers:{},socket:{remoteAddress:'127.0.0.1'}});
  const res=()=>Object.assign(new EventEmitter(),{writeHead(){},end(){this.writableEnded=true;},writableEnded:false});
  return {server,operations,req,res};
}

test('client disconnect releases logical admission before physical work settles', async () => {
  const h=harness(), response=h.res();
  const pending=h.server.handle(h.req(),response);
  try {
    assert.equal(h.server.inFlight,1);
    response.emit('close');
    assert.equal(h.server.inFlight,0);
    assert.equal(h.server.perAgentInFlight.size,0);
  } finally { h.operations[0].resolve(); await pending; }
});

test('an old server lifetime cannot release a new request admission', async () => {
  const h=harness();
  const old=h.server.handle(h.req(),h.res());
  h.server.stop();
  const current=h.server.handle(h.req(),h.res());
  try {
    h.operations[0].resolve(); await old;
    assert.equal(h.server.inFlight,1);
    assert.equal(h.server.perAgentInFlight.get('test-client'),1);
  } finally { h.operations[1].resolve(); await current; }
});
