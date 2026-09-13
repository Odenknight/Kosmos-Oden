import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

async function bundle(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", write: false });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

const ops = await bundle("src/plugin/vault-operations.ts");
const providerApi = await bundle("src/plugin/vault-provider.ts");
const { ProviderError, physicalReadState, readVaultText } = ops;
const { VaultDataProvider } = providerApi;

test("binary evidence reads share text admission and retain ownership after timeout", async () => {
  const gate = deferred();
  const vault = { readBinary: () => gate.promise, cachedRead: async () => "text" };
  await assert.rejects(ops.readVaultBytes(vault, file("same.md"), 5), e => e.reason === "timeout");
  assert.equal(physicalReadState(vault).outstanding, 1);
  await assert.rejects(readVaultText(vault, file("same.md")), e => e.reason === "provider_unavailable");
  gate.resolve(new ArrayBuffer(0));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(physicalReadState(vault).outstanding, 0);
  assert.equal(await readVaultText(vault, file("same.md")), "text");
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function file(path, content = "# Note") {
  return { path, name: path.split("/").at(-1), extension: "md", stat: { size: content.length, mtime: 1, ctime: 1 }, content };
}

test("physical read pool is 16 across independent consumers", async () => {
  const gates = new Map(Array.from({ length: 16 }, (_, i) => [`n${i}.md`, deferred()]));
  const vault = { cachedRead: (f) => gates.get(f.path).promise };
  const pending = Array.from(gates, ([path]) => readVaultText(vault, file(path), 1000));
  pending.forEach((promise) => promise.catch(() => {}));
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(physicalReadState(vault).outstanding, 16);
    await assert.rejects(readVaultText(vault, file("overflow.md"), 1000), (e) => e instanceof ProviderError && e.reason === "provider_unavailable");
    // A duplicate path is refused independently of remaining pool capacity.
    await assert.rejects(readVaultText(vault, file("n0.md"), 1000), (e) => e instanceof ProviderError && e.reason === "provider_unavailable");
    assert.equal(physicalReadState(vault).outstanding, 16);
  } finally {
    gates.forEach((gate) => gate.resolve("contents"));
    await Promise.allSettled(pending);
  }
  assert.equal(physicalReadState(vault).outstanding, 0);
});

test("unsettled duplicate remains refused after a separately loaded module", async () => {
  const gate = deferred();
  const vault = { cachedRead: () => gate.promise };
  const first = readVaultText(vault, file("same.md"), 1000);
  first.catch(() => {});
  await new Promise((resolve) => setImmediate(resolve));
  try {
    const reloaded = await bundle("src/plugin/vault-operations.ts");
    await assert.rejects(reloaded.readVaultText(vault, file("same.md"), 1000), (e) => e.reason === "provider_unavailable");
    assert.equal(reloaded.physicalReadState(vault).outstanding, 1);
  } finally {
    gate.resolve("contents");
    await first;
  }
  assert.equal(physicalReadState(vault).outstanding, 0);
});

test("a rejected sibling releases only itself while an unsettled sibling retains its permit", async () => {
  const slow = deferred();
  const vault = { cachedRead(f) { return f.path === "slow.md" ? slow.promise : Promise.reject(new Error("disk failure")); } };
  const pSlow = readVaultText(vault, file("slow.md"), 1000);
  const pBad = readVaultText(vault, file("bad.md"), 1000);
  await assert.rejects(pBad, (e) => e instanceof ProviderError && e.reason === "provider_unavailable");
  assert.equal(physicalReadState(vault).outstanding, 1);
  slow.resolve("slow");
  assert.equal(await pSlow, "slow");
  assert.equal(physicalReadState(vault).outstanding, 0);
});

test("release uses the original path when a host renames the file object", async () => {
  const read = deferred();
  const vault = { cachedRead: () => read.promise };
  const f = file("old.md");
  const result = readVaultText(vault, f, 1000);
  await new Promise((resolve) => setImmediate(resolve));
  f.path = "new.md";
  read.resolve("contents");
  assert.equal(await result, "contents");
  assert.deepEqual(physicalReadState(vault), { outstanding: 0, oldestAgeMs: 0 });
});

test("late physical read rejection after logical timeout is observed without an unhandled rejection", async () => {
  const gate = deferred();
  const vault = { cachedRead: () => gate.promise };
  let unhandled;
  const onUnhandled = (reason) => { unhandled = reason; };
  process.once("unhandledRejection", onUnhandled);
  const result = readVaultText(vault, file("late.md"), 1);
  await assert.rejects(result, (e) => e?.reason === "timeout");
  gate.reject(new Error("late disk failure"));
  await new Promise((resolve) => setImmediate(resolve));
  process.removeListener("unhandledRejection", onUnhandled);
  assert.equal(unhandled, undefined);
  assert.equal(physicalReadState(vault).outstanding, 0);
});

test("timed-out build cannot publish a stale graph or consume newer edits", async () => {
  const oldRead = deferred();
  let files = [file("old.md", "# Old")];
  const vault = {
    getMarkdownFiles: () => [...files],
    getFiles: () => [...files],
    cachedRead: () => oldRead.promise,
  };
  const settings = { defaultSensitivity: "internal" };
  const provider = new VaultDataProvider({ vault }, settings, { readMs: 1000, buildMs: 10 });
  const first = provider.getGraph();
  await new Promise((resolve) => setImmediate(resolve));
  files = [file("new.md", "# New")];
  provider.markChanged("old.md");
  provider.markChanged("new.md");
  await assert.rejects(first, (e) => e?.reason === "timeout" || e?.message === "Vault operation timed out");
  oldRead.resolve("# Old");
  // The timeout rejects the caller first; wait for the captured physical read
  // to settle and for the fenced rebuild to clear its in-flight slot.
  await new Promise((resolve) => setImmediate(resolve));
  provider.limits.buildMs = 1000; // Recovery is not the deliberately tiny deadline under test.
  const latest = await provider.getGraph();
  assert.equal(latest.nodes.some((node) => node.path === "old.md"), false);
  assert.equal(latest.nodes.some((node) => node.path === "new.md"), true);
});

test("sensitivity reprojection during a build does not publish the old projection", async () => {
  const read = deferred();
  const note = file("unlabeled.md", "# Unlabeled");
  const vault = { getMarkdownFiles: () => [note], getFiles: () => [note], cachedRead: () => read.promise };
  const settings = { defaultSensitivity: "internal" };
  const provider = new VaultDataProvider({ vault }, settings, { readMs: 1000, buildMs: 1000 });
  const building = provider.getGraph();
  await new Promise((resolve) => setImmediate(resolve));
  settings.defaultSensitivity = "secret";
  read.resolve(note.content);
  const graph = await building;
  const node = graph.nodes.find((candidate) => candidate.path === "unlabeled.md");
  assert.ok(node);
  assert.equal(graph.nodes.filter((candidate) => candidate.path === "unlabeled.md").length, 1);
});
