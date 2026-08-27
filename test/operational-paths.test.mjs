import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  KOSMOS_OPERATIONAL_ROOTS,
  isKosmosOperationalPath,
} from "../dist/kosmos-operational-paths.mjs";

test("only the exact Kosmos operational roots and descendants are excluded", () => {
  assert.deepEqual([...KOSMOS_OPERATIONAL_ROOTS], [".gkx", "_archive/moc-runs"]);
  for (const path of [
    ".gkx",
    ".gkx/effects/journal.json",
    ".GKX/PROPOSALS/pending.md",
    ".\\.gkx\\effects\\receipt.json",
    "_archive/moc-runs",
    "_archive/moc-runs/2026-08-27/run/before/index.md",
    "_ARCHIVE\\MOC-RUNS\\run\\after\\index.md",
    "./_archive//moc-runs//run//manifest.json",
  ]) assert.equal(isKosmosOperationalPath(path), true, path);

  for (const path of [
    "Notes/.gkx-explained.md",
    ".gkx-notes/index.md",
    "_archive/history/index.md",
    "_archive/moc-runs-old/index.md",
    "MOCs/index.md",
    "",
    null,
  ]) assert.equal(isKosmosOperationalPath(path), false, String(path));
});

test("every corpus and timestamp boundary uses the central predicate", async () => {
  const expectations = new Map([
    ["../src/plugin/vault-provider.ts", /isKosmosOperationalPath/],
    ["../src/plugin/main.ts", /isKosmosOperationalPath/],
    ["../src/standalone/directory-source.ts", /isKosmosOperationalPath/],
    ["../src/plugin/gkx-migration.ts", /isKosmosOperationalPath/],
    ["../src/plugin/gkx-enrichment.ts", /isKosmosOperationalPath/],
  ]);
  for (const [relativePath, pattern] of expectations) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, pattern, relativePath);
  }
  const pluginMain = await readFile(new URL("../src/plugin/main.ts", import.meta.url), "utf8");
  assert.match(pluginMain, /scheduleTimestamp[\s\S]*isKosmosOperationalPath\(file\?\.path\)/);
  assert.match(pluginMain, /stampNote[\s\S]*isKosmosOperationalPath\(file\?\.path\)/);
});
