/* Live functional tests for the Vault Kosmos Agent API v0.5.1 (hardening + traversal + Graphiti export). */
const http = require('http');
const { AgentApiServer, DEFAULT_AGENT_SETTINGS, buildEpisodes, buildAgentGuide } = require('./agent-api.cjs');

// ---- mock vault ------------------------------------------------------------
const mk = (path, content, ctime, fm) => ({
  path, basename: path.split('/').pop().replace(/\.md$/, ''), extension: 'md',
  stat: { ctime }, __content: content, __fm: fm || {}
});
const T0 = Date.parse('2026-01-01T00:00:00Z'), T1 = Date.parse('2026-03-01T00:00:00Z'), T2 = Date.parse('2026-05-01T00:00:00Z');
const files = [
  mk('Home.md', '# Home\n[[Engine v2]]', T0, {}),
  mk('Ideas/Engine v1.md', '---\n---\nOld design.', T0, { type: 'design', timestamp: '2026-01-01T00:00:00Z', superseded_by: 'Engine v2' }),
  mk('Ideas/Engine v2.md', '---\n---\nNew design.\n\n**Related:** [[Turbo]]', T1, { type: 'design', timestamp: '2026-03-01T00:00:00Z', supersedes: 'Engine v1' }),
  mk('Ideas/Turbo.md', 'Turbocharger notes.', T2, { tags: ['engine'] }),
];
const app = {
  vault: {
    getMarkdownFiles: () => files,
    getFiles: () => files,
    cachedRead: async (f) => f.__content,
    getName: () => 'Test Vault',
    adapter: { write: async () => {} },
  },
  metadataCache: {
    getFileCache: (f) => ({ frontmatter: f.__fm }),
    resolvedLinks: { 'Home.md': { 'Ideas/Engine v2.md': 1 }, 'Ideas/Engine v2.md': { 'Ideas/Turbo.md': 1 } },
  },
};
const PORT = 4899, TOKEN = 'aaaabbbbccccddddeeeeffff';
const plugin = { app, agentSettings: { ...DEFAULT_AGENT_SETTINGS, agentEnabled: true, agentPort: PORT, agentToken: TOKEN, agentRequireToken: true, agentBindMode: 'localhost' } };

// ---- helpers ---------------------------------------------------------------
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name, extra ?? ''); } };
function req(path, { method = 'GET', headers = {}, body = null, host } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path, method, headers: { ...(host ? { Host: host } : {}), ...headers } }, (res) => {
      let b = ''; res.on('data', (c) => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('error', reject); if (body) r.write(body); r.end();
  });
}
const J = (s) => { try { return JSON.parse(s); } catch (_) { return null; } };

// ---- run -------------------------------------------------------------------
(async () => {
  const api = new AgentApiServer(plugin);
  const traversals = [];
  api.onTraversal = (paths, tool) => traversals.push({ tool, paths });
  api.start();
  await new Promise((r) => setTimeout(r, 250));
  console.log('server status:', api.status);

  console.log('\n[auth]');
  ok((await req('/health')).status === 401, 'no token -> 401');
  ok((await req('/health?token=WRONGWRONGWRONGWRONGWRON')).status === 401, 'wrong token (same length) -> 401');
  ok((await req('/health?token=short')).status === 401, 'wrong token (short) -> 401');
  const h = await req('/health?token=' + TOKEN);
  ok(h.status === 200 && J(h.body).version === '0.5.1', 'query token -> 200, v0.5.1', h.body);
  ok((await req('/health', { headers: { Authorization: 'Bearer ' + TOKEN } })).status === 200, 'bearer token -> 200');
  ok((await req('/health', { headers: { 'x-api-key': TOKEN } })).status === 200, 'x-api-key -> 200');

  console.log('\n[dns-rebinding guard]');
  ok((await req('/health?token=' + TOKEN, { host: 'evil.example.com' })).status === 403, 'Host: evil.example.com -> 403');
  ok((await req('/health?token=' + TOKEN, { host: 'localhost:' + PORT })).status === 200, 'Host: localhost -> 200');
  ok((await req('/health?token=' + TOKEN, { host: '127.0.0.1:' + PORT })).status === 200, 'Host: 127.0.0.1 -> 200');
  ok((await req('/health?token=' + TOKEN, { headers: { Origin: 'https://evil.example.com' } })).status === 403, 'Origin: evil -> 403');
  ok((await req('/health?token=' + TOKEN, { headers: { Origin: 'http://localhost:5173' } })).status === 200, 'Origin: localhost -> 200');

  console.log('\n[rest queries + traversal events]');
  traversals.length = 0;
  const note = await req('/note?title=Engine%20v2&token=' + TOKEN);
  const noteJ = J(note.body);
  ok(note.status === 200 && noteJ.path === 'Ideas/Engine v2.md' && noteJ.content.includes('New design'), 'GET /note by title');
  ok(noteJ.okf.supersedes.includes('Engine v1') && noteJ.links.semantic.includes('Ideas/Turbo.md'), 'OKF+ fields + semantic link resolved');
  const lin = await req('/lineage?title=Engine%20v1&token=' + TOKEN);
  const linJ = J(lin.body);
  ok(lin.status === 200 && linJ.chainLength === 2 && linJ.chain[1].path === 'Ideas/Engine v2.md', 'GET /lineage chain oldest->newest');
  const at = await req('/at?time=2026-02-01&token=' + TOKEN);
  const atJ = J(at.body);
  ok(at.status === 200 && atJ.counts.valid === 2 && atJ.counts.superseded === 0, 'GET /at bi-temporal snapshot (Feb: v1+Home valid)', at.body.slice(0, 200));
  const at2 = J((await req('/at?time=2026-04-01&token=' + TOKEN)).body);
  ok(at2.counts.superseded === 1 && at2.superseded[0].path === 'Ideas/Engine v1.md', 'GET /at later: v1 superseded');
  ok(traversals.some(t => t.tool === 'get_note' && t.paths.includes('Ideas/Engine v2.md')), 'traversal event: get_note');
  ok(traversals.some(t => t.tool === 'get_lineage' && t.paths.join()==='Ideas/Engine v1.md,Ideas/Engine v2.md'), 'traversal event: get_lineage chain');
  ok(traversals.some(t => t.tool === 'graph_at_time'), 'traversal event: graph_at_time');

  console.log('\n[mcp]');
  const mcp = (payload) => req('/mcp?token=' + TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const init = J((await mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } })).body);
  ok(init.result.serverInfo.version === '0.5.1', 'initialize -> serverInfo 0.5.1');
  const tools = J((await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).body);
  ok(tools.result.tools.length === 7, 'tools/list -> 7 tools');
  traversals.length = 0;
  const call = J((await mcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_notes', arguments: { query: 'engine' } } })).body);
  const callText = call.result.content[0].text;
  ok(!call.result.isError && callText.includes('Engine v2'), 'tools/call search_notes');
  ok(traversals.some(t => t.tool === 'search_notes' && t.paths.length >= 2), 'traversal event via MCP');
  ok((await req('/mcp?token=' + TOKEN)).status === 405, 'GET /mcp -> 405');

  console.log('\n[graphiti episodes]');
  const eps = await buildEpisodes(app);
  ok(eps.length === 4, 'four episodes');
  ok(eps.every(e => e.group_id === 'test-vault'), 'per-vault group_id = test-vault');
  ok(eps.every(e => e.source === 'json' && e.name && e.episode_body && e.source_description && e.reference_time), 'add_episode fields present (graphiti-core 0.29.x shape)');
  const sorted = [...eps].every((e, i, a) => i === 0 || a[i-1].reference_time <= e.reference_time);
  ok(sorted, 'episodes chronological');
  const body0 = JSON.parse(eps.find(e => e.name === 'Engine v2').episode_body);
  ok(body0.supersedes.includes('Engine v1') && body0.related.includes('Turbo'), 'OKF+ chains ride inside episode_body');

  console.log('\n[guide]');
  const guide = buildAgentGuide(4816, 'YOUR-TOKEN-HERE');
  ok(guide.includes('v0.5.1') && guide.includes('graphiti-core 0.29.x') && guide.includes('DNS-rebinding'), 'guide mentions v0.5.1 + compat + hardening');
  require('fs').writeFileSync(__dirname + '/AGENT-API.generated.md', guide);

  console.log('\n[misc]');
  ok((await req('/nope?token=' + TOKEN)).status === 404, 'unknown route -> 404');
  ok((await req('/overview', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN } })).status === 405, 'POST to REST -> 405 (read-only)');
  const graph = J((await req('/graph?token=' + TOKEN)).body);
  ok(graph.nodes.length === 4 && graph.links.some(l => l.kind === 'lineage'), '/graph nodes+lineage links');

  api.stop();
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
