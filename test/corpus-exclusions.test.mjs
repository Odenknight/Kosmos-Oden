import test from "node:test";
import assert from "node:assert/strict";
import { filterKosmosCorpusFiles, isKosmosOperationalPath } from "../dist/kosmos-corpus-exclusions.mjs";

test("operational sidecars and MOC archives are excluded across separator, case, and NFC forms", () => {
  for (const path of [
    ".gkx/proposals/p.yaml",
    ".GKX\\effects\\journal.jsonl",
    "./.gkx/decisions/d.yaml",
    "_archive/moc-runs/2026-08-26/run/manifest.json",
    "_ARCHIVE\\MOC-RUNS\\before\\Map.md",
  ]) assert.equal(isKosmosOperationalPath(path), true, path);
  for (const path of [".gkx-notes/Visible.md", "_archive/other/Visible.md", "Maps/Moc.md"]) assert.equal(isKosmosOperationalPath(path), false, path);
});

test("one corpus filter removes notes and attachments without mutating input", () => {
  const input = [{ path: "Maps/Moc.md" }, { path: ".gkx/proposals/p.yaml" }, { path: "_archive/moc-runs/r/before/Moc.md" }, { path: "assets/map.png" }];
  const visible = filterKosmosCorpusFiles(input);
  assert.deepEqual(visible.map((file) => file.path), ["Maps/Moc.md", "assets/map.png"]);
  assert.equal(input.length, 4);
});
