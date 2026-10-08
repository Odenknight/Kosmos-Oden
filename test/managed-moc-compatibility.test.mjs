/** Consumer fixtures against the exact bundled Engine coordinator. No vault writes. */
import test from "node:test";
import assert from "node:assert/strict";
import { ManagedMocCoordinator } from "../dist/kosmos-navigation-effects.mjs";

function host(saved = null, recovered = true) {
  const state = { saved, runs: [] };
  return { state, api: {
    loadIntent: async () => structuredClone(state.saved),
    saveIntent: async value => { state.saved = structuredClone(value); },
    recover: async () => recovered,
    reconcile: async intent => { state.runs.push(structuredClone(intent)); },
  } };
}

test("Engine consumer preserves rename endpoints, overflow and denied recovery", async () => {
  const fixture = host(), coordinator = new ManagedMocCoordinator(fixture.api, { debounceMs: 750, maxDelayMs: 3000, periodicMs: 300000, maxPaths: 2 });
  assert.equal(await coordinator.start(100), true);
  assert.equal(fixture.state.runs[0].full, true);
  await Promise.all([coordinator.notify("Old/Note.md", 200), coordinator.notify("New/Note.md", 200)]);
  await coordinator.tick(1000);
  assert.deepEqual(fixture.state.runs[1].paths, ["New/Note.md", "Old/Note.md"]);
  await Promise.all(["A.md", "B.md", "C.md"].map(path => coordinator.notify(path, 1100)));
  assert.equal(fixture.state.saved.full, true);
  assert.deepEqual(fixture.state.saved.paths, []);
  await coordinator.stop();
  await assert.rejects(coordinator.notify("Late.md", 1200), /STOPPED/);
  const denied = host(null, false), blocked = new ManagedMocCoordinator(denied.api);
  assert.equal(await blocked.start(100), false);
  assert.equal(blocked.status.ready, false);
  assert.equal(denied.state.saved.full, true);
  assert.equal(denied.state.runs.length, 0);
});

test("Engine consumer retains events arriving during reconciliation and rejects corrupt intent", async () => {
  const fixture = host(), coordinator = new ManagedMocCoordinator(fixture.api);
  await coordinator.start(100);
  let finish, entered;
  const started = new Promise(resolve => { entered = resolve; });
  fixture.api.reconcile = async () => { entered(); await new Promise(resolve => { finish = resolve; }); };
  await coordinator.notify("First.md", 200);
  const running = coordinator.tick(1000);
  await started;
  await coordinator.notify("During.md", 1100);
  finish(); await running;
  assert.equal(coordinator.status.pending, true);
  assert.ok(fixture.state.saved.paths.includes("During.md"));
  await coordinator.stop();
  const corrupt = host({ revision: 1, full: false, paths: ["../outside.md"], firstAt: 1, lastAt: 1 });
  await assert.rejects(new ManagedMocCoordinator(corrupt.api).start(100), /CORRUPT/);
  assert.equal(corrupt.state.runs.length, 0);
});
