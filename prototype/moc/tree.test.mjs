import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rename, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createPrototypeHost } from "./tree-host.mjs";
const delay = ms => new Promise(done => setTimeout(done, ms));
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kosmos-tree-test-"));
  await mkdir(join(root, "Notes/Sub/Empty"), { recursive: true });
  await writeFile(join(root, "Notes/index.md"), "Human original\n");
  await writeFile(join(root, "Notes/Sub/Report.pdf"), Buffer.from([0, 1, 2, 255]));
  await writeFile(join(root, "Notes/Sub/Image.png"), Buffer.from([1, 2, 3]));
  await writeFile(join(root, "Notes/A.md"), "# A\n");
  let enabled = true;
  const options = { root, folder: "Notes", adoptionId: randomUUID(), isEnabled: () => enabled };
  return { root, options, disable: () => { enabled = false; } };
}
test("tree indexes folders, exact attachment extensions and empty scopes; watches changes and recovers", async () => {
  const { root, options, disable } = await fixture();
  let host = await createPrototypeHost(options);
  const preview = await host.preview();
  assert.ok(preview.includes("Documents: Notes/Sub/Report.pdf"));
  assert.ok(preview.includes("INDEX: Notes/Sub/Empty/Kosmos Index.md"));
  try {
    assert.equal(await host.runtime.start(), true);
    const top = await readFile(join(root, host.target), "utf8");
    assert.match(top, /Sub\/Kosmos%20Index.md/);
    const sub = await readFile(join(root, "Notes/Sub/Kosmos Index.md"), "utf8");
    assert.match(sub, /Report.pdf/); assert.match(sub, /## Images/); assert.match(sub, /\.\.\/Kosmos%20Index.md/);
    assert.match(await readFile(join(root, "Notes/Sub/Empty/Kosmos Index.md"), "utf8"), /no listed files/);
    await writeFile(join(root, "Notes/Sub/clip.mp4"), "video fixture");
    let found = false;
    for (let i = 0; i < 70; i++) { if ((await readFile(join(root, "Notes/Sub/Kosmos Index.md"), "utf8")).includes("clip.mp4")) { found = true; break; } await delay(100); }
    assert.ok(found, "automatic attachment update");
    await mkdir(join(root, "Notes/New"));
    await writeFile(join(root, "Notes/New/data.csv"), "a,b\n1,2\n");
    let added = false;
    for (let i = 0; i < 70; i++) {
      try { if ((await readFile(join(root, "Notes/New/Kosmos Index.md"), "utf8")).includes("data.csv")) { added = true; break; } } catch (e) { if (e.code !== "ENOENT") throw e; }
      await delay(100);
    }
    assert.ok(added, "new descendant is automatically cataloged");
    await rename(join(root, "Notes/A.md"), join(root, "Notes/B.md"));
    await host.runtime.reconcileNow(); await delay(400); await host.runtime.reconcileNow();
    assert.match(await readFile(join(root, host.target), "utf8"), /B.md/);
    await unlink(join(root, "Notes/Sub/Report.pdf"));
    await host.runtime.reconcileNow(); await delay(400); await host.runtime.reconcileNow();
    assert.doesNotMatch(await readFile(join(root, "Notes/Sub/Kosmos Index.md"), "utf8"), /Report.pdf/);
    assert.equal((await host.runtime.shutdown()).clean, true);
    host = await createPrototypeHost(options); assert.equal(await host.runtime.start(), true);
    assert.equal(await readFile(join(root, "Notes/index.md"), "utf8"), "Human original\n");
    assert.deepEqual(await readFile(join(root, "Notes/Sub/Image.png")), Buffer.from([1, 2, 3]));
  } finally { disable(); await host.runtime.shutdown(); }
});
test("existing unowned catalog blocks entire batch before any new catalog", async () => {
  const { root, options, disable } = await fixture();
  await writeFile(join(root, "Notes/Sub/Kosmos Index.md"), "Human content");
  const host = await createPrototypeHost(options);
  try {
    await assert.rejects(host.runtime.start(), /TREE_TARGET_CONFLICT/);
    await assert.rejects(readFile(join(root, host.target)), { code: "ENOENT" });
    assert.equal(await readFile(join(root, "Notes/Sub/Kosmos Index.md"), "utf8"), "Human content");
  } finally { disable(); await host.runtime.shutdown(); }
});
test("committed effect interrupted before ownership persistence recovers on restart", async () => {
  const { root, options, disable } = await fixture();
  let fail = true;
  let host = await createPrototypeHost({ ...options, faultInjector: () => { if (fail) { fail = false; throw new Error("TEST_INTERRUPTION"); } } });
  await assert.rejects(host.runtime.start(), /TEST_INTERRUPTION/);
  await host.runtime.shutdown();
  host = await createPrototypeHost(options);
  try { assert.equal(await host.runtime.start(), true); assert.match(await readFile(join(root, host.target), "utf8"), /Markdown notes/); }
  finally { disable(); await host.runtime.shutdown(); }
});
test("revoked session cannot update catalogs and hidden folders stay excluded", async () => {
  const { root, options, disable } = await fixture();
  await mkdir(join(root, "Notes/.private"));
  await writeFile(join(root, "Notes/.private/hidden.txt"), "hidden");
  const host = await createPrototypeHost(options);
  assert.ok(!(await host.preview()).some(p => p.includes(".private")));
  try {
    assert.equal(await host.runtime.start(), true);
    const before = await readFile(join(root, host.target), "utf8");
    disable(); await writeFile(join(root, "Notes/new.txt"), "new");
    await assert.rejects(host.runtime.reconcileNow(), /AUTHORIZATION_PAUSED_OR_EXPIRED/);
    assert.equal(await readFile(join(root, host.target), "utf8"), before);
  } finally { disable(); await host.runtime.shutdown(); }
});
