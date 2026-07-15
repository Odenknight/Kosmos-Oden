/** Graphiti export tests: identity, ordering, namespace, authority, temporal safety. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGraph,
  buildGraphitiEpisodes,
  buildGraphitiEpisodesWithContent,
  stripFrontmatter,
} from "../dist/kosmos-core.mjs";

function fixtureGraph() {
  return buildGraph(
    [
      { relativePath: "Ideas/Engine v1.md", content: "---\ntype: idea\ntimestamp: 2026-01-01T00:00:00Z\n---\nOld engine." },
      { relativePath: "Ideas/Engine v2.md", content: "---\ntype: idea\ntimestamp: 2026-03-01T00:00:00Z\nsupersedes:\n  - Engine v1\n---\nNew engine.\n\n**Related:** [[Fuel]]" },
      { relativePath: "Fuel.md", content: "---\ntimestamp: 2026-02-01T00:00:00Z\ntype: note\n---\nFuel." },
    ],
    ["Ideas"]
  );
}

test("every episode carries stable UUID + collision-resistant assertion namespace", () => {
  const episodes = buildGraphitiEpisodes(fixtureGraph(), { vault: "My Vault" });
  assert.equal(episodes.length, 3);
  for (const e of episodes) {
    assert.equal(typeof e.name, "string");
    assert.match(e.uuid, /^[0-9a-f-]{36}$/);
    assert.equal(typeof e.episode_body, "string");
    assert.equal(e.source, "json");
    assert.ok(e.source_description.includes("My Vault"));
    assert.ok(!Number.isNaN(Date.parse(e.reference_time)), "reference_time must parse");
    assert.match(e.group_id, /^okf-my-vault-[0-9a-f]{8}-assertions$/);
  }
});

test("episodes are chronologically ordered by reference_time", () => {
  const episodes = buildGraphitiEpisodes(fixtureGraph());
  const times = episodes.map((e) => Date.parse(e.reference_time));
  for (let i = 1; i < times.length; i++) assert.ok(times[i - 1] <= times[i]);
  assert.deepEqual(episodes.map((e) => e.name), ["Engine v1", "Fuel", "Engine v2"]);
});

test("episode bodies carry forward lineage only and never leak later state backward", () => {
  const episodes = buildGraphitiEpisodes(fixtureGraph());
  const v1 = JSON.parse(episodes.find((e) => e.name === "Engine v1").episode_body);
  const v2 = JSON.parse(episodes.find((e) => e.name === "Engine v2").episode_body);
  assert.deepEqual(v1.lineage, { resolved_supersedes: [], declared_supersedes: [] });
  assert.deepEqual(v2.lineage, { resolved_supersedes: ["Engine v1"], declared_supersedes: ["Engine v1"] });
  for (const body of [v1, v2]) {
    assert.equal("superseded_by" in body, false);
    assert.equal("head" in body, false);
    assert.equal("invalid_at" in body, false);
    assert.equal(body.authority.accepted_semantics, false);
    assert.equal(body.authority.projection_status, "non_authoritative");
  }
  assert.deepEqual(v2.related_to, ["Fuel"]);
});

test("content rides along when supplied", () => {
  const graph = fixtureGraph();
  const contents = new Map([["Fuel.md", stripFrontmatter("---\ntype: note\n---\nFuel.")]]);
  const episodes = buildGraphitiEpisodesWithContent(graph, contents, { vault: "V" });
  const fuel = JSON.parse(episodes.find((e) => e.name === "Fuel").episode_body);
  assert.equal(fuel.content, "Fuel.");
  assert.equal(fuel.content_truncated, false);
});

test("valid OKF+ uid is reused as Graphiti episode uuid across path changes", () => {
  const uid = "7f3a9c1e-4b2d-4e8a-9c6f-1d5e8a2b7c4d";
  const one = buildGraph([{ relativePath: "A.md", content: `---\nokf_version: "2.2"\nuid: "${uid}"\ntype: semantic\ntimestamp: 2026-01-01T00:00:00Z\n---\na` }], []);
  const two = buildGraph([{ relativePath: "Moved/A.md", content: `---\nokf_version: "2.2"\nuid: "${uid}"\ntype: semantic\ntimestamp: 2026-01-01T00:00:00Z\n---\na` }], ["Moved"]);
  assert.equal(buildGraphitiEpisodes(one)[0].uuid, uid);
  assert.equal(buildGraphitiEpisodes(two)[0].uuid, uid);
});

test("stripFrontmatter removes only the YAML header", () => {
  assert.equal(stripFrontmatter("---\na: b\n---\nBody"), "Body");
  assert.equal(stripFrontmatter("No header"), "No header");
});
