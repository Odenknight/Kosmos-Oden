import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GRAPHITI_INGEST_SCRIPT } from "gkos-engine";

test("generated ingestion sample never reports searchability without readback", () => {
  const source = GRAPHITI_INGEST_SCRIPT;
  assert.match(readFileSync("src/plugin/main.ts", "utf8"), /write\("graphiti-ingest-sample.py", GRAPHITI_INGEST_SCRIPT\)/);
  assert.match(source, /"accepted_is_searchable": False/);
  assert.match(source, /"readback_performed": False/);
  assert.match(source, /"searchability": "unverified"/);
  assert.doesNotMatch(source, /completed and searchable|"accepted_is_searchable": True/);
  assert.match(source, /EpisodicNode.get_by_uuid/);
  assert.match(source, /"canonical_uuid": e\["uuid"\]/);
  assert.doesNotMatch(source, /add_episode\(\s*uuid=/);
});
