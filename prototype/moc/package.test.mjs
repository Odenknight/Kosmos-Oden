import test from "node:test";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { readFile, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("packaged plugin loads without Engine installation and requires explicit authority", async () => {
  const root = await mkdtemp(join(tmpdir(), "kosmos-plugin-package-"));
  await mkdir(join(root, "Notes"));
  await writeFile(join(root, "Notes/Example.md"), "# Example\n");
  class FileSystemAdapter { getBasePath() { return root; } }
  class Plugin {
    app = { vault: { adapter: new FileSystemAdapter() } };
    async loadData() { return null; }
    async saveData(value) { this.saved = value; }
    addCommand() {} addRibbonIcon() {}
  }
  const filename = resolve("dist/obsidian-prototype/kosmos-moc-prototype/main.js");
  const mod = new Module(filename);
  const nativeRequire = createRequire(import.meta.url);
  mod.require = name => {
    if (name === "obsidian") return { Plugin, FileSystemAdapter, Modal: class {}, Notice: class {}, Setting: class {} };
    assert.ok(name.startsWith("node:"), `Unexpected external dependency: ${name}`);
    return nativeRequire(name);
  };
  mod._compile(await readFile(filename, "utf8"), filename);
  const plugin = new mod.exports.default();
  await plugin.onload();
  assert.equal(plugin.enabled, false);
  await assert.rejects(plugin.start("Notes", ""), /COPY/);
  await plugin.start("Notes", "COPY");
  try {
    assert.match(await readFile(join(root, "Notes/Kosmos Index.md"), "utf8"), /Example/);
    assert.equal(plugin.saved.version, 2);
  } finally { await plugin.pause(); }
  assert.equal(plugin.enabled, false);
  assert.equal(plugin.runtime, null);
  await mkdir(join(root, "Second"));
  await writeFile(join(root, "Second/Other.md"), "# Other\n");
  await plugin.start("Second", "COPY");
  try { assert.match(await readFile(join(root, "Second/Kosmos Index.md"), "utf8"), /Other/); }
  finally { await plugin.pause(); }
  await plugin.start("Notes", "COPY");
  await plugin.pause();
  assert.equal(plugin.saved.records.length, 2);
  plugin.onunload();
  await assert.rejects(plugin.start("Notes", "COPY"), /unloading/);
});
