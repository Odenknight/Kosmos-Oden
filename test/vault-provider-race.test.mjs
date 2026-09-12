import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({ entryPoints: ["src/plugin/vault-provider.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { VaultDataProvider } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);

test("body search snapshot tracks edits and rejects a replaced graph without extra reads", async () => {
  const file = { path: "note.md", name: "note.md", extension: "md", stat: { size: 30, mtime: 1, ctime: 1 } };
  let body = "---\ntype: semantic\n---\nOld body", reads = 0;
  const vault = { getMarkdownFiles: () => [file], getFiles: () => [file], cachedRead: async () => { reads++; return body; } };
  const provider = new VaultDataProvider({ vault }, { defaultSensitivity: "internal" });
  const before = await provider.getGraph();
  assert.equal(provider.getIndexedBody(file.path, before), "Old body");
  assert.equal(reads, 1);
  body = "New body"; provider.markChanged(file.path);
  const after = await provider.getGraph();
  assert.equal(provider.getIndexedBody(file.path, before), null);
  assert.equal(provider.getIndexedBody(file.path, after), "New body");
  assert.equal(provider.getIndexedBody(".gkx/private.md", after), null);
  assert.equal(reads, 2);
});

for (const incremental of [false, true]) {
  test(`vault changes during ${incremental ? "incremental" : "initial"} reads survive the scan`, async () => {
    const file = { path: "note.md", name: "note.md", extension: "md", stat: { size: 10, mtime: 1, ctime: 1 } };
    let files = [file], onRead = null;
    const vault = { getMarkdownFiles: () => [...files], getFiles: () => [...files], cachedRead: async () => { onRead?.(); return "# Note"; } };
    const provider = new VaultDataProvider({ vault }, { defaultSensitivity: "internal" });
    if (incremental) { await provider.getGraph(); provider.markChanged(file.path); }
    onRead = () => { files = []; provider.markRemoved(file.path); onRead = null; };
    await provider.getGraph();
    const graph = await provider.getGraph();
    assert.equal(graph.nodes.some(node => node.path === file.path), false);
  });
}
