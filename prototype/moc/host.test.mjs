import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rename, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createPrototypeHost, validateFolder } from "./host.mjs";

test("prototype scope rejects root, traversal and hidden state", () => {
  for (const value of ["", "../notes", ".gkx", "x/../y", "C:/notes", "x\\y"]) assert.throws(() => validateFolder(value));
});

test("real prototype runtime creates, updates, pauses, recovers and refuses external edits", async () => {
  const root = await mkdtemp(join(tmpdir(), "kosmos-obsidian-prototype-"));
  await mkdir(join(root, "Notes"));
  await writeFile(join(root, "Notes/Alpha.md"), "# Alpha\nKeep these bytes.\n");
  let enabled = true; let writes = 0;
  const options = { root, folder: "Notes", adoptionId: randomUUID(), isEnabled: () => enabled, onCommitted: () => { writes++; } };
  let host = await createPrototypeHost(options);
  const settles = async (predicate, request = true) => {
    for (let i = 0; i < 60; i++) {
      if (request) await host.runtime.reconcileNow();
      if (predicate(await readFile(join(root, host.target), "utf8"))) return;
      await new Promise(done => setTimeout(done, 100));
    }
    assert.fail("Reconciliation did not settle within six seconds.");
  };
  assert.deepEqual(await host.preview(), ["Notes/Alpha.md"]);
  try {
    assert.equal(await host.runtime.start(), true);
    assert.match(await readFile(join(root, host.target), "utf8"), /Alpha/);
    assert.equal(writes, 1);
    await host.runtime.reconcileNow(); assert.equal(writes, 1);
    await writeFile(join(root, "Notes/Beta.md"), "# Beta\n");
    await settles(text => text.includes("Beta"), false);
    assert.match(await readFile(join(root, host.target), "utf8"), /Beta/);
    await rename(join(root, "Notes/Beta.md"), join(root, "Notes/Gamma.md"));
    await settles(text => text.includes("Gamma"));
    assert.match(await readFile(join(root, host.target), "utf8"), /Gamma/);
    await unlink(join(root, "Notes/Gamma.md"));
    await settles(text => !text.includes("Gamma"));
    assert.doesNotMatch(await readFile(join(root, host.target), "utf8"), /Gamma/);
    enabled = false; assert.equal((await host.runtime.shutdown()).clean, true);
    enabled = true; host = await createPrototypeHost(options);
    assert.equal(await host.runtime.start(), true);
    enabled = false; assert.equal((await host.runtime.shutdown()).clean, true);
    await writeFile(join(root, host.target), "Human conflict\n");
    enabled = true; host = await createPrototypeHost(options);
    try { await host.runtime.start(); } catch {}
    assert.equal(await readFile(join(root, host.target), "utf8"), "Human conflict\n");
    assert.equal(await readFile(join(root, "Notes/Alpha.md"), "utf8"), "# Alpha\nKeep these bytes.\n");
  } finally { enabled = false; await host.runtime.shutdown(); }
});
