import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph } from "../dist/kosmos-core.mjs";
import {
  buildCosmos,
  getKosmosNavigationManifest,
  projectKosmosNavigation,
} from "../dist/kosmos-layout.mjs";

function rootGraph(paths) {
  return buildGraph(paths.map((relativePath) => ({ relativePath, content: `# ${relativePath}` })), []);
}

test("Navigation disabled preserves the prior eleven-name visual heuristic", () => {
  const graph = buildCosmos(rootGraph(["home.md", "ordinary.md"]), { navigationEnabled: false });
  assert.equal(graph.nodes.find((node) => node.path === "home.md").role, "cluster");
  assert.equal(graph.__navigation.enabled, false);
});

test("Navigation enabled uses Engine canonical-five discovery and flags former aliases", () => {
  const graph = buildCosmos(rootGraph(["home.md", "index.md", "ordinary.md"]), { navigationEnabled: true });
  assert.equal(graph.nodes.find((node) => node.path === "index.md").role, "cluster");
  assert.notEqual(graph.nodes.find((node) => node.path === "home.md").role, "cluster");
  assert.ok(graph.__navigation.findings.some((finding) => finding.code === "MOC_NAME_NONCANONICAL" && finding.path === "home.md"));
});

test("Navigation consumes Engine's exact archive-ignore rule without removing other history", () => {
  const projection = projectKosmosNavigation([
    "_archive/moc-runs/index.md",
    "_archive/history/index.md",
    "index.md",
  ], true);
  assert.equal(projection.recognizedPaths.has("_archive/moc-runs/index.md"), false);
  assert.equal(projection.recognizedPaths.has("_archive/history/index.md"), true);
  assert.equal(projection.recognizedPaths.has("index.md"), true);
});

test("consumer capability manifest is truthful about the 2.1 effect boundary", () => {
  const manifest = getKosmosNavigationManifest(true);
  assert.equal(manifest.engine_version, "2.1.1");
  assert.equal(manifest.navigation_contract, "1.0.0");
  assert.equal(manifest.governance_store_configured, false);
  assert.equal(manifest.capabilities.discover, true);
  assert.equal(manifest.capabilities.apply_moc, false);
  assert.equal(manifest.capabilities.source_content_write, false);
  assert.equal(manifest.capabilities.archive_delete, false);
  assert.equal(manifest.capabilities.reentry_write, false);
  assert.equal(manifest.capabilities.rollback_execution, false);
  assert.equal(manifest.capabilities.reentry_record, false);
  assert.equal(manifest.engine_contract_suite.standing, "integration-only");
  assert.equal(manifest.gkos_conformance.claimed, false);
});
