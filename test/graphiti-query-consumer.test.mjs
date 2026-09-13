import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GRAPHITI_QUERY_CONTRACT_VERSION, prepareGraphitiQueryRequest, acceptGraphitiQueryResult,
} from "gkos-engine/graphiti";

// Consume the fixture shipped by the pinned Engine package, not a Kosmos copy.
const fixture = JSON.parse(readFileSync(new URL("../contracts/graphiti/query-draft1/fixture.json",
  import.meta.resolve("gkos-engine/graphiti")), "utf8"));
function context() {
  return {
    status: structuredClone(fixture.status), decision: "allow", complete_dependency_scope: true,
    authorized_episodes: new Map(fixture.authorized_episodes.map(row => [row.projection_episode_id, row])),
  };
}

test("pinned Engine query fixture is consumable without a backend", () => {
  assert.equal(GRAPHITI_QUERY_CONTRACT_VERSION, "gkos-graphiti-query/1.0.0-draft.1");
  const request = prepareGraphitiQueryRequest(fixture.request.query, fixture.request.limit, fixture.request.request_id, context());
  assert.deepEqual(request, fixture.request);
  const result = acceptGraphitiQueryResult(request, JSON.stringify(fixture.result), context());
  assert.deepEqual(result, fixture.result);
  assert.ok(result.hits.every(hit => hit.semantic_support === "unverified"));
});

test("consumer fixture refuses unavailable status and late scope or episode revocation", () => {
  const unavailable = context(); unavailable.status.searchable = false;
  assert.equal(prepareGraphitiQueryRequest("query", 5, "id", unavailable), null);
  const current = context(); current.status.binding.scope_digest = "sha256:" + "f".repeat(64);
  assert.equal(acceptGraphitiQueryResult(fixture.request, JSON.stringify(fixture.result), current), null);
  const revoked = context(); revoked.authorized_episodes.clear();
  assert.equal(acceptGraphitiQueryResult(fixture.request, JSON.stringify(fixture.result), revoked), null);
});
