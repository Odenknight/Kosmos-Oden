import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("generated ingestion sample never reports searchability without readback", () => {
  const source = readFileSync("src/plugin/main.ts", "utf8");
  assert.match(source, /"accepted_is_searchable": False/);
  assert.match(source, /"readback_performed": False/);
  assert.match(source, /"searchability": "unverified"/);
  assert.doesNotMatch(source, /completed and searchable|"accepted_is_searchable": True/);
});
