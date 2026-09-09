/** Read-only installed-server qualification. Never prints credentials or note bodies. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const [settingsPath, endpoint = 'http://127.0.0.1:4816/mcp', selectorsPath] = process.argv.slice(2);
if (!settingsPath) throw new Error('Usage: node scripts/smoke-live-mcp.mjs <plugin data.json> [endpoint]');
const { agentToken } = JSON.parse(readFileSync(settingsPath, 'utf8'));
assert.ok(agentToken, 'Configured token required');
const version = '2026-07-28';
let id = 0;
async function rpc(method, params = {}, options = {}) {
  const headers = { Authorization: `Bearer ${agentToken}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': options.version ?? version, 'Mcp-Method': method };
  if (params.name) headers['Mcp-Name'] = params.name;
  Object.assign(headers, options.headers);
  const response = await fetch(endpoint, { method: 'POST', headers, signal: AbortSignal.timeout(120000), body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params: { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': options.version ?? version, 'io.modelcontextprotocol/clientCapabilities': {}, 'io.modelcontextprotocol/clientInfo': { name: 'kosmos-live-qualification', version: '1' } } } }) });
  return { status: response.status, body: await response.json() };
}
for (const authorization of ['', 'Bearer deliberately-invalid']) {
  assert.equal((await rpc('tools/list', {}, { headers: { Authorization: authorization } })).status, 401);
}
console.log('PASS missing and invalid authentication rejected');
const discovery = await rpc('server/discover');
assert.equal(discovery.status, 200);
assert.deepEqual(discovery.body.result.supportedVersions, [version]);
console.log('PASS modern discovery', discovery.body.result._meta['io.modelcontextprotocol/serverInfo']);
const listing = await rpc('tools/list');
assert.equal(listing.status, 200);
assert.ok(listing.body.result.tools.some(t => t.name === 'get_note'));
console.log('PASS tool listing');
for (const [method, options, status, code] of [
  ['tools/list', { version: '1900-01-01' }, 400, -32022],
  ['tools/list', { headers: { 'Mcp-Method': 'wrong' } }, 400, -32020],
  ['not/a-method', {}, 404, -32601],
]) {
  const result = await rpc(method, {}, options);
  assert.equal(result.status, status);
  assert.equal(result.body.error.code, code);
}
console.log('PASS protocol, header and unknown-method errors');
const search = await rpc('tools/call', { name: 'search_notes', arguments: { query: '', limit: 1 } });
assert.equal(search.status, 200);
assert.ok(!search.body.result.isError);
const hit = search.body.result.structuredContent.results[0];
assert.ok(hit, 'At least one authorized note is required');
const note = await rpc('tools/call', { name: 'get_note', arguments: { path: hit.path } });
assert.equal(note.status, 200);
assert.ok(!note.body.result.isError);
assert.equal(typeof note.body.result.structuredContent.content, 'string');
console.log('PASS authorized note retrieval (body omitted)');
const uid = note.body.result.structuredContent.gkx?.uid;
if (uid) {
  const byUid = await rpc('tools/call', { name: 'get_note', arguments: { uid } });
  assert.equal(byUid.body.result.structuredContent.content, note.body.result.structuredContent.content);
  console.log('PASS UID retrieves the same note');
} else console.log('Selected search result has no UID');
if (selectorsPath) {
  const selectors = JSON.parse(readFileSync(selectorsPath, 'utf8'));
  assert.ok(selectors.uid, 'Public UID fixture required');
  assert.ok(selectors.restrictedPath, 'Restricted fixture required');
  const byUid = await rpc('tools/call', { name: 'get_note', arguments: { uid: selectors.uid } });
  assert.equal(byUid.status, 200);
  assert.ok(!byUid.body.result.isError);
  assert.equal(typeof byUid.body.result.structuredContent.content, 'string');
  assert.equal(byUid.body.result.structuredContent.gkx.uid, selectors.uid);
  console.log('PASS public UID retrieval');
  const denied = await rpc('tools/call', { name: 'get_note', arguments: { path: selectors.restrictedPath } });
  assert.equal(denied.status, 200);
  assert.equal(denied.body.result.isError, true);
  assert.equal(denied.body.result.structuredContent.content, undefined);
  console.log('PASS restricted note denied without body');
} else console.log('NOT QUALIFIED: no restricted-note selectors supplied');
