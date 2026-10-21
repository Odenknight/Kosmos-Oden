import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { KosmosAgentServer, buildGraph } from "../dist/kosmos-agent-lineage-test.mjs";

const FILES = [
  { relativePath: "Ideas/Engine v1.md", content: "---\ntype: idea\ntimestamp: 2026-01-01T00:00:00Z\nsensitivity: internal\n---\nOld engine." },
  { relativePath: "Ideas/Engine v2.md", content: "---\ntype: idea\ntimestamp: 2026-03-01T00:00:00Z\nsensitivity: internal\nsupersedes:\n  - Engine v1\n---\nNew engine." },
  { relativePath: "Ideas/Engine v3.md", content: "---\ntype: idea\ntimestamp: 2026-05-01T00:00:00Z\nsensitivity: internal\nsupersedes:\n  - Engine v2\n  - Restricted plan\n---\nNewest engine." },
  { relativePath: "Private/Restricted plan.md", content: "---\ntype: idea\ntimestamp: 2026-04-01T00:00:00Z\nsensitivity: secret\n---\nNot for agents." },
];

function server() {
  const graph = buildGraph(FILES, ["Ideas", "Private"], undefined, { defaultSensitivity: "internal" });
  return new KosmosAgentServer(http, {
    schemaVersion: 3, agentEnabled: true, agentPort: 0, agentToken: "test-token-1234567890", agentRequireToken: true,
    agentBindMode: "localhost", agentSensitivityCeiling: "internal", defaultSensitivity: "secret",
    agentGraphNamespace: "testnamespace", agentAllowQueryToken: false,
  }, { getGraph: async () => graph, getNoteContent: async () => null, vaultName: () => "TestVault", lanAddresses: () => [] });
}

test("get_lineage reports Engine-resolved authored declarations", async () => {
  const r = await server().qLineage({ title: "Engine v2" });
  assert.deepEqual(r.declarations, [{ field: "supersedes", origin: "authored", line: 6, status: "resolved", target: "Ideas/Engine v1.md" }]);
});

test("a declaration pointing at an unreadable note is unresolved and names nothing", async () => {
  const r = await server().qLineage({ title: "Engine v3" });
  const byTarget = r.declarations.map((d) => [d.status, d.target]);
  assert.deepEqual(byTarget, [["resolved", "Ideas/Engine v2.md"], ["unresolved", null]]);
  assert.ok(!JSON.stringify(r).includes("Restricted"), "restricted note identity must not leak");
});
