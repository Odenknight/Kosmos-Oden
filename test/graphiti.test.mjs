/** Graphiti export tests (§13, §24): fields, ordering, group_id, canonical lineage. */
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

test("every episode carries the required fields, including group_id", () => {
  const episodes = buildGraphitiEpisodes(fixtureGraph(), { vault: "My Vault" });
  assert.equal(episodes.length, 3);
  for (const e of episodes) {
    assert.equal(typeof e.name, "string");
    assert.equal(typeof e.episode_body, "string");
    assert.equal(e.source, "json");
    assert.ok(e.source_description.includes("My Vault"));
    assert.ok(!Number.isNaN(Date.parse(e.reference_time)), "reference_time must parse");
    assert.equal(e.group_id, "my-vault");
  }
});

test("episodes are chronologically ordered by reference_time", () => {
  const episodes = buildGraphitiEpisodes(fixtureGraph());
  const times = episodes.map((e) => Date.parse(e.reference_time));
  for (let i = 1; i < times.length; i++) assert.ok(times[i - 1] <= times[i]);
  assert.deepEqual(episodes.map((e) => e.name), ["Engine v1", "Fuel", "Engine v2"]);
});

test("episode bodies are valid JSON with CANONICAL lineage + preserved declarations (§13.1)", () => {
  const episodes = buildGraphitiEpisodes(fixtureGraph());
  const v1 = JSON.parse(episodes.find((e) => e.name === "Engine v1").episode_body);
  const v2 = JSON.parse(episodes.find((e) => e.name === "Engine v2").episode_body);
  // canonical projections (what the system RESOLVED):
  assert.deepEqual(v1.superseded_by, ["Engine v2"]);
  assert.deepEqual(v2.supersedes, ["Engine v1"]);
  assert.equal(v2.head, true);
  assert.equal(v1.head, false);
  assert.equal(v1.invalid_at, "2026-03-01T00:00:00.000Z");
  // raw declarations (what the author WROTE):
  assert.deepEqual(v1.source_okf, { declared_supersedes: [], declared_superseded_by: [] });
  assert.deepEqual(v2.source_okf, { declared_supersedes: ["Engine v1"], declared_superseded_by: [] });
  // semantic footer
  assert.deepEqual(v2.related, ["Fuel"]);
});

test("content rides along when supplied", () => {
  const graph = fixtureGraph();
  const contents = new Map([["Fuel.md", stripFrontmatter("---\ntype: note\n---\nFuel.")]]);
  const episodes = buildGraphitiEpisodesWithContent(graph, contents, { vault: "V" });
  const fuel = JSON.parse(episodes.find((e) => e.name === "Fuel").episode_body);
  assert.equal(fuel.content, "Fuel.");
});

test("stripFrontmatter removes only the YAML header", () => {
  assert.equal(stripFrontmatter("---\na: b\n---\nBody"), "Body");
  assert.equal(stripFrontmatter("No header"), "No header");
});
