import test from "node:test";
import assert from "node:assert/strict";
import {
  CompletedSelfWriteLedger,
  NavigationEventDebouncer,
  clearReconciliationIntent,
  createReconciliationIntent,
  evaluateReconciliation,
  isIgnoredEffectsPath,
  mergeReconciliationIntent,
} from "../dist/kosmos-navigation-effects.mjs";

class FakeClock {
  value = 0;
  now() { return this.value; }
  advance(ms) { this.value += ms; }
}

const digest = (letter) => `sha256:${letter.repeat(64)}`;

test("bursts coalesce by stable identity and wait for the quiet interval", () => {
  const clock = new FakeClock();
  const debouncer = new NavigationEventDebouncer({ clock });
  debouncer.ingest({ kind: "modify", path: "Maps/Zeta.md", stableIdentity: "uid-1" });
  clock.advance(500);
  debouncer.ingest({ kind: "rename", path: "Maps/Alpha.md", previousPath: "Maps/Zeta.md", stableIdentity: "uid-1" });
  clock.advance(749);
  assert.equal(debouncer.drainReady(), null);
  clock.advance(1);
  const batch = debouncer.drainReady();
  assert.deepEqual(batch.events, [{
    key: "identity:uid-1", stableIdentity: "uid-1", paths: ["Maps/Alpha.md", "Maps/Zeta.md"],
    kinds: ["modify", "rename"], firstOffsetMs: 0, lastOffsetMs: 500, deliveryCount: 2,
  }]);
  assert.equal(batch.requiresFullReconciliation, false);
});

test("continuous delivery is forced at the maximum delay", () => {
  const clock = new FakeClock();
  const debouncer = new NavigationEventDebouncer({ clock });
  for (let index = 0; index < 6; index += 1) {
    debouncer.ingest({ kind: "modify", path: "Maps/Index.md", stableIdentity: "uid-index" });
    clock.advance(500);
    if (index < 5) assert.equal(debouncer.drainReady(), null);
  }
  const batch = debouncer.drainReady();
  assert.equal(batch.closedAtMs, 3000);
  assert.equal(batch.events[0].deliveryCount, 6);
});

test("queue overflow is bounded and explicitly requires full reconciliation", () => {
  const clock = new FakeClock();
  const debouncer = new NavigationEventDebouncer({ clock, capacity: 2 });
  assert.equal(debouncer.ingest({ kind: "create", path: "B.md" }), "accepted");
  assert.equal(debouncer.ingest({ kind: "create", path: "A.md" }), "accepted");
  assert.equal(debouncer.ingest({ kind: "create", path: "C.md" }), "overflow");
  assert.equal(debouncer.size, 2);
  const batch = debouncer.drainReady();
  assert.equal(batch.requiresFullReconciliation, true);
  assert.equal(batch.overflowCount, 1);
  assert.deepEqual(batch.events.map((event) => event.paths[0]), ["A.md", "B.md"]);
});

test("one stable identity cannot bypass the path bound with a rename storm", () => {
  const clock = new FakeClock();
  const debouncer = new NavigationEventDebouncer({ clock, capacity: 2, pathCapacity: 2 });
  assert.equal(debouncer.ingest({ kind: "rename", path: "B.md", previousPath: "A.md", stableIdentity: "uid-1" }), "accepted");
  assert.equal(debouncer.ingest({ kind: "rename", path: "C.md", previousPath: "B.md", stableIdentity: "uid-1" }), "overflow");
  const batch = debouncer.drainReady();
  assert.equal(batch.requiresFullReconciliation, true);
  assert.deepEqual(batch.events[0].paths, ["A.md", "B.md"]);
});

test("excluded state, archive, and adapter temporary paths never enter a batch", () => {
  const clock = new FakeClock();
  const debouncer = new NavigationEventDebouncer({ clock });
  for (const path of [".gkx/effects/journal", "_archive/moc-runs/2026/run/manifest.json", "Maps/.Index.md.gkos-tmp-abc", "Maps/Index.md.gkos-temp-abc"]) {
    assert.equal(isIgnoredEffectsPath(path), true);
    assert.equal(debouncer.ingest({ kind: "modify", path }), "ignored");
  }
  assert.equal(debouncer.drainNow(), null);
});

test("duplicate watcher deliveries coalesce and path ordering uses code units", () => {
  const clock = new FakeClock();
  const debouncer = new NavigationEventDebouncer({ clock });
  debouncer.ingest({ kind: "modify", path: "z.md" });
  debouncer.ingest({ kind: "modify", path: "z.md" });
  debouncer.ingest({ kind: "modify", path: "A.md" });
  const batch = debouncer.drainNow();
  assert.deepEqual(batch.events.map((event) => event.paths[0]), ["A.md", "z.md"]);
  assert.equal(batch.events[1].deliveryCount, 2);
});

test("self-write suppression requires every completed receipt binding and has no time fallback", () => {
  const ledger = new CompletedSelfWriteLedger();
  const receipt = { effectId: "effect-1", targetPath: "Maps/Index.md", committedDigest: digest("a"), indexGeneration: 42, completed: true };
  ledger.record(receipt);
  const exact = { effectId: "effect-1", targetPath: "Maps/Index.md", observedDigest: digest("a"), indexGeneration: 42 };
  assert.equal(ledger.shouldSuppress(exact), true);
  assert.equal(ledger.shouldSuppress(exact), true, "duplicate delivery may match the same completed receipt");
  assert.equal(ledger.shouldSuppress({ ...exact, observedDigest: digest("b") }), false, "external bytes win");
  assert.equal(ledger.shouldSuppress({ ...exact, effectId: undefined }), false);
  assert.equal(ledger.shouldSuppress({ ...exact, indexGeneration: 43 }), false);
  assert.throws(() => ledger.record({ ...receipt, committedDigest: digest("b") }), /binding changed/);
});

function snapshot(overrides = {}) {
  return {
    corpusDigest: digest("a"), configurationDigest: digest("b"), policyDigest: digest("c"),
    ownershipDigest: digest("d"), checkpointDigest: digest("e"), journalDigest: digest("f"),
    targetDigests: { "Maps/Index.md": digest("a") }, ...overrides,
  };
}

test("reconciliation intent is deterministic, serializable, and preserves forcing reasons", () => {
  let intent = createReconciliationIntent("periodic", ["z", "A"]);
  intent = mergeReconciliationIntent(intent, "resume", ["A", "M"]);
  intent = mergeReconciliationIntent(intent, "overflow");
  assert.deepEqual(intent.reasons, ["resume", "overflow", "periodic"]);
  assert.deepEqual(intent.affectedScopes, ["A", "M", "z"]);
  assert.equal(intent.fullRequired, true);
  assert.deepEqual(JSON.parse(JSON.stringify(intent)), intent);
  assert.deepEqual(clearReconciliationIntent(intent), { schemaVersion: 1, revision: 4, reasons: [], affectedScopes: [], fullRequired: false });
});

test("reconciliation distinguishes safe, incremental, full, and blocking states", () => {
  const expected = snapshot();
  const empty = clearReconciliationIntent(createReconciliationIntent("manual"));
  const base = { expected, current: snapshot(), intent: empty, dependencySetComplete: true, journalValid: true, checkpointValid: true, unresolvedRecovery: false };
  assert.equal(evaluateReconciliation(base).classification, "safe");

  const changed = snapshot({ corpusDigest: digest("9"), targetDigests: { "Maps/Index.md": digest("9") } });
  const incremental = evaluateReconciliation({ ...base, current: changed, intent: createReconciliationIntent("resume", ["Maps/Index.md"]) });
  assert.equal(incremental.classification, "incremental");
  assert.deepEqual(incremental.scopes, ["Maps/Index.md"]);

  assert.equal(evaluateReconciliation({ ...base, current: changed, intent: createReconciliationIntent("overflow"), dependencySetComplete: true }).classification, "full");
  assert.equal(evaluateReconciliation({ ...base, current: changed, intent: createReconciliationIntent("resume", ["Maps/Index.md"]), dependencySetComplete: false }).classification, "full");
  assert.equal(evaluateReconciliation({ ...base, current: snapshot({ policyDigest: digest("9") }), intent: createReconciliationIntent("manual", ["Maps/Index.md"]) }).classification, "full");

  const blocked = evaluateReconciliation({ ...base, journalValid: false });
  assert.equal(blocked.classification, "block");
  assert.match(blocked.blockingReasons.join(" "), /journal/);

  const corruptIntent = evaluateReconciliation({ ...base, intent: { ...empty, schemaVersion: 2 } });
  assert.equal(corruptIntent.classification, "block");

  for (const corrupt of [
    { ...base, expected: null },
    { ...base, current: [] },
    { ...base, intent: null },
    { ...base, intent: { ...empty, reasons: null } },
    null,
  ]) {
    const decision = evaluateReconciliation(corrupt);
    assert.equal(decision.classification, "block");
    assert.ok(decision.blockingReasons.length > 0);
  }
});
