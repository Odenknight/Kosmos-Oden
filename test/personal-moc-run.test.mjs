/**
 * Personal Notes (0.9.5) — one folder run: plan, then write only when needed.
 *
 * The in-memory host below behaves like the plugin's writer host: exact-text
 * compare-and-write, never overwrite on create, a backup before an update.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { runFolderMoc, MocError } from "../dist/kosmos-personal-notes.mjs";

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

function memoryHost(files, meta = {}) {
  const store = new Map(Object.entries(files));
  const backups = [];
  return {
    store,
    backups,
    writes: 0,
    listMarkdown: () => [...store.keys()].filter((p) => /\.md$/i.test(p)).sort(),
    meta: (path) => meta[path] ?? {},
    readRaw: async (path) => (store.has(path) ? store.get(path) : null),
    writeRaw: async (path, text, expectedRaw) => {
      if (!store.has(path) || store.get(path) !== expectedRaw) return false;
      store.set(path, text);
      return true;
    },
    createFile: async (path, text) => {
      if (store.has(path)) return false;
      store.set(path, text);
      return true;
    },
    saveBackup: async (path, beforeText) => {
      const ref = `${path}.bak-${backups.length}`;
      backups.push({ ref, beforeText });
      return ref;
    },
    sha256: async (text) => sha256(text),
  };
}

const FILES = {
  "Projects/Build plan 2025.md": "# Build plan 2025\n\nTwo servers.\n",
  "Projects/Build plan 2024.md": "---\nsuperseded_by: Build plan 2025\n---\n# Build plan 2024\n",
  "Projects/Notes/Sub task.md": "# Sub task\n",
  "Elsewhere/Not this folder.md": "# Elsewhere\n",
};

test("run: a folder without an index gets one, and a second run changes nothing", async () => {
  const host = memoryHost(FILES, { "Projects/Build plan 2025.md": { title: "Build plan 2025", summary: "Two servers." } });
  const first = await runFolderMoc("Projects", host);
  assert.equal(first.plan.action, "create");
  assert.equal(first.plan.target, "Projects/index.md");
  assert.equal(first.applied.written.length, 1);
  assert.equal(first.applied.written[0].action, "create");
  const created = host.store.get("Projects/index.md");
  assert.match(created, /\[\[Build plan 2025\]\] - Two servers\./);
  assert.ok(!created.includes("Elsewhere"), "another folder is not listed");
  assert.ok(!created.includes("Sub task"), "subfolders are not listed without recursive");

  const second = await runFolderMoc("Projects", host);
  assert.equal(second.plan.action, "unchanged");
  assert.equal(second.applied, null);
  assert.equal(host.store.get("Projects/index.md"), created);
});

test("run: an update preserves everything outside the managed block and saves one backup", async () => {
  const host = memoryHost(FILES);
  await runFolderMoc("Projects", host);
  const withPreface = `My own words.\n\n${host.store.get("Projects/index.md")}\nand a closing line.\n`;
  host.store.set("Projects/index.md", withPreface);
  const before = host.backups.length;
  host.store.set("Projects/Build plan 2023.md", "# Build plan 2023\n");
  const run = await runFolderMoc("Projects", host);
  assert.equal(run.plan.action, "update");
  const updated = host.store.get("Projects/index.md");
  assert.ok(updated.startsWith("My own words.\n\n"));
  assert.ok(updated.endsWith("\nand a closing line.\n"));
  assert.equal(host.backups.length, before + 1);
  assert.equal(host.backups.at(-1).beforeText, withPreface);
});

test("run: a file without a managed block is refused, not adopted", async () => {
  const host = memoryHost({ ...FILES, "Projects/index.md": "# Hand-written index\n\nNo markers here.\n" });
  const run = await runFolderMoc("Projects", host);
  assert.equal(run.plan.action, "refuse");
  assert.equal(run.plan.reason, "unmanaged_file");
  assert.equal(run.applied, null);
  assert.equal(host.store.get("Projects/index.md"), "# Hand-written index\n\nNo markers here.\n");
});

test("run: the target is never listed, and a bad folder is an error", async () => {
  const host = memoryHost({ ...FILES, "Projects/index.md": "<!-- kosmos-moc:begin v1 -->\n<!-- kosmos-moc:end -->\n" });
  const run = await runFolderMoc("Projects", host);
  assert.ok(!run.plan.entries.some((e) => e.path === "Projects/index.md"));
  await assert.rejects(runFolderMoc("", host), (e) => e instanceof MocError && e.code === "invalid_folder");
});

test("run: the same input in a different order gives the same bytes", async () => {
  const one = memoryHost(FILES);
  const two = memoryHost(Object.fromEntries(Object.entries(FILES).reverse()));
  const a = await runFolderMoc("Projects", one);
  const b = await runFolderMoc("Projects", two);
  assert.equal(a.plan.proposedRaw, b.plan.proposedRaw);
  assert.equal(a.applied.written[0].afterHash, b.applied.written[0].afterHash);
});

test("run: recursive grouping lists a subfolder under its own heading", async () => {
  const host = memoryHost(FILES);
  const run = await runFolderMoc("Projects", host, { recursive: true });
  assert.equal(run.plan.action, "create");
  assert.ok(run.plan.proposedRaw.includes("## Notes"));
  assert.ok(run.plan.proposedRaw.includes("Sub task"));
});