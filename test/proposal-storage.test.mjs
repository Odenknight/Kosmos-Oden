import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["src/plugin/gkx-proposal-storage.ts"], bundle: true, write: false, format: "esm", platform: "node", plugins: [{ name: "native-require", setup(b) {
  b.onResolve({ filter: /vault-provider$/ }, () => ({ path: "native", namespace: "native-stub" }));
  b.onLoad({ filter: /.*/, namespace: "native-stub" }, () => ({ loader: "js", contents: "export const nodeRequire = name => globalThis.__proposalRequire(name);" }));
} }] });
const { proposalStorageAdapter } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

test("desktop audit publication never replaces a racing destination and rejects escaping junctions", async () => {
  const root = await mkdtemp(join(tmpdir(), "kosmos-exclusive-"));
  const oldRequire = globalThis.__proposalRequire;
  globalThis.__proposalRequire = createRequire(import.meta.url);
  try {
    const vault = join(root, "vault"), outside = join(root, "outside");
    await mkdir(vault); await mkdir(outside);
    const store = proposalStorageAdapter({ vault: { adapter: { getBasePath: () => vault } } });
    await store.mkdir(".gkx"); await store.mkdir(".gkx/proposals");
    await store.write(".gkx/proposals/first.tmp", "first");
    await store.write(".gkx/proposals/second.tmp", "second");
    await store.rename(".gkx/proposals/first.tmp", ".gkx/proposals/record.yaml");
    await assert.rejects(store.rename(".gkx/proposals/second.tmp", ".gkx/proposals/record.yaml"), { code: "EEXIST" });
    assert.equal(await store.read(".gkx/proposals/record.yaml"), "first");
    await assert.rejects(store.write(".gkx/proposals/record.yaml", "overwrite"), /temporary/);
    await assert.rejects(store.remove(".gkx/proposals/record.yaml"), /cannot be removed/);
    await assert.rejects(store.write("../escape.tmp", "outside"), /Invalid proposal/);
    await symlink(outside, join(vault, ".gkx", "decisions"), "junction");
    await assert.rejects(store.write(".gkx/decisions/escaped.tmp", "outside"), /escapes vault/);
    assert.equal(await readFile(join(vault, ".gkx/proposals/record.yaml"), "utf8"), "first");
  } finally {
    globalThis.__proposalRequire = oldRequire;
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unexpected cleanup root");
    await rm(root, { recursive: true, force: true });
  }
});
