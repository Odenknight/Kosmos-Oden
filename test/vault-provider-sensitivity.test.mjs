import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({ entryPoints: ["src/plugin/vault-provider.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { VaultDataProvider } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);

function fixture(defaultSensitivity) {
  const settings = defaultSensitivity === undefined ? {} : { defaultSensitivity };
  const contents = new Map([
    ["unlabeled.md", "---\ngkx_version: '2.3'\nuid: '019b2d14-4230-7db7-87d4-7d81cfaec9aa'\n---\n# Unlabeled"],
    ["public.md", "---\ngkx_version: 2.3\nsensitivity: public\n---\n# Public"],
    ["invalid.md", "---\ngkx_version: 2.3\nsensitivity: unclassified\n---\n# Invalid"],
  ]);
  const files = [...contents.keys()].map(path => ({ path, name: path, extension: "md", stat: { size: 100, mtime: 1, ctime: 1 } }));
  let reads = 0;
  const vault = { getMarkdownFiles: () => files, getFiles: () => files, cachedRead: async f => { reads++; return contents.get(f.path); } };
  return { provider: new VaultDataProvider({ vault }, settings), settings, contents, reads: () => reads };
}
function sensitivity(graph, path) { return graph.nodes.find(n => n.path === path).gkx.projection.effective.sensitivity; }

test("provider fails closed when its default is absent or secret", async () => {
  for (const initial of [undefined, "secret"]) {
    const { provider } = fixture(initial);
    const graph = await provider.getGraph();
    assert.equal(sensitivity(graph, "unlabeled.md"), "secret");
    assert.equal(sensitivity(graph, "invalid.md"), "secret");
    assert.equal(sensitivity(graph, "public.md"), "public");
  }
});

test("provider threads changed defaults through adapter reconstruction and preserves explicit labels", async () => {
  const { provider, settings, reads } = fixture("internal");
  const first = await provider.getGraph();
  assert.equal(sensitivity(first, "unlabeled.md"), "internal");
  assert.equal(sensitivity(first, "invalid.md"), "secret");
  const count = reads();
  assert.equal(await provider.getGraph(), first);
  assert.equal(reads(), count, "unchanged policy should reuse snapshot");
  for (const value of ["secret", "internal"]) {
    settings.defaultSensitivity = value;
    const graph = await provider.getGraph(); // exercises the safety net without a UI call
    assert.notEqual(graph, first);
    assert.equal(sensitivity(graph, "unlabeled.md"), value);
    assert.equal(sensitivity(graph, "public.md"), "public");
    assert.equal(sensitivity(graph, "invalid.md"), "secret");
  }
});

test("incremental provider updates retain the configured projection policy", async () => {
  const { provider, contents } = fixture("internal");
  await provider.getGraph();
  contents.set("unlabeled.md", contents.get("unlabeled.md") + "\nEdited");
  provider.markChanged("unlabeled.md");
  assert.equal(sensitivity(await provider.getGraph(), "unlabeled.md"), "internal");
});
