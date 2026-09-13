import test from "node:test";
import assert from "node:assert/strict";
import { waitForDesktopEngine } from "../scripts/desktop-readiness.mjs";

test("desktop readiness retries unavailable credentials and indexing before serving", async () => {
  let reads = 0, requests = 0;
  await waitForDesktopEngine(async () => {
    if (++reads === 1) throw new Error("not yet created");
    return "a".repeat(64);
  }, { pollMs: 1, fetchImpl: async (url, options) => {
    assert.equal(url, "http://127.0.0.1:4814/");
    assert.equal(options.headers.Authorization, "Bearer " + "a".repeat(64));
    assert.equal(options.redirect, "error");
    return { ok: true, json: async () => ({ state: ++requests === 1 ? "indexing" : "serving" }) };
  } });
  assert.equal(reads, 3);
});

test("desktop readiness refuses a late serving response after cancellation", async () => {
  let current = true;
  await assert.rejects(waitForDesktopEngine(async () => "a".repeat(64), {
    isCurrent: () => current, pollMs: 1,
    fetchImpl: async () => { current = false; return { ok: true, json: async () => ({ state: "serving" }) }; },
  }), /cancelled/);
});

test("desktop readiness bounds stalled IPC without retrying it", async () => {
  let reads = 0;
  await assert.rejects(waitForDesktopEngine(() => { reads++; return new Promise(() => {}); }, {
    requestMs: 20, timeoutMs: 100, fetchImpl: async () => { throw new Error("must not fetch"); },
  }), /request timed out/);
  assert.equal(reads, 1);
});

test("desktop readiness never accepts an unauthorized serving-shaped response", async () => {
  let requests = 0;
  await assert.rejects(waitForDesktopEngine(async () => "a".repeat(64), {
    timeoutMs: 30, pollMs: 1,
    fetchImpl: async () => { requests++; return { ok: false, json: async () => ({ state: "serving" }) }; },
  }), /did not become ready/);
  assert.ok(requests > 0);
});
