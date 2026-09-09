import test from "node:test";
import assert from "node:assert/strict";
import { nextQuality, viewDprCeiling } from "../dist/kosmos-renderer-quality.mjs";

const MAXDPR = 2;

/** A fast, steady desktop window at the given ratio and view. */
const desktop = (over) => ({
  fps: 60, dpr: 1.5, floor: 1.0, maxDpr: MAXDPR,
  closeDetail: false, mobile: false, slowWindows: 0, lodScale: 1, pinnedDpr: null,
  ...over,
});

test("overview is capped below close-detail on both form factors", () => {
  assert.equal(viewDprCeiling(false, false, MAXDPR), 1.5, "desktop overview");
  assert.equal(viewDprCeiling(true, false, MAXDPR), 2, "desktop close detail");
  assert.equal(viewDprCeiling(false, true, MAXDPR), 1.25, "mobile overview");
  assert.equal(viewDprCeiling(true, true, MAXDPR), 2, "mobile close detail");
  // Never above the product ceiling, whatever the form factor asks for.
  assert.equal(viewDprCeiling(false, false, 1.0), 1.0);
});

test("a fast idle overview does not climb past the overview ceiling", () => {
  // The 0.8.0 regression: with no ceiling this ratcheted to 2.0 and stayed
  // there, shading ~1.8x the pixels for detail that is not resolvable.
  let s = desktop({ dpr: 1.5 });
  for (let i = 0; i < 10; i++) {
    const d = nextQuality(s);
    assert.equal(d.dpr, 1.5, "step " + i);
    s = { ...s, dpr: d.dpr, slowWindows: d.slowWindows, lodScale: d.lodScale };
  }
});

test("close detail earns the full ratio, and leaving it gives the pixels back", () => {
  let dpr = 1.5;
  for (let i = 0; i < 4; i++) dpr = nextQuality(desktop({ dpr, closeDetail: true })).dpr;
  assert.equal(dpr, 2, "climbs to the product ceiling while inspecting");

  // Back to overview: step down promptly rather than waiting for slow frames.
  dpr = nextQuality(desktop({ dpr, closeDetail: false })).dpr;
  assert.equal(dpr, 1.75);
  dpr = nextQuality(desktop({ dpr, closeDetail: false })).dpr;
  assert.equal(dpr, 1.5);
  dpr = nextQuality(desktop({ dpr, closeDetail: false })).dpr;
  assert.equal(dpr, 1.5, "settles at the overview ceiling");
});

test("mobile overview settles at its own lower ceiling", () => {
  let s = { ...desktop({ dpr: 2, mobile: true, floor: 1.25 }) };
  let dpr = s.dpr;
  for (let i = 0; i < 6; i++) dpr = nextQuality({ ...s, dpr }).dpr;
  assert.equal(dpr, 1.25);
});

test("one slow window is tolerated; sustained load steps down", () => {
  // A single slow sample (shader compilation, first layout) must not blur the
  // session permanently.
  const first = nextQuality(desktop({ fps: 30, dpr: 1.5 }));
  assert.equal(first.dpr, 1.5, "no change after one slow window");
  assert.equal(first.slowWindows, 1);

  const second = nextQuality(desktop({ fps: 30, dpr: 1.5, slowWindows: 1 }));
  assert.equal(second.dpr, 1.25, "steps down once load is sustained");
  assert.equal(second.slowWindows, 0, "counter resets after acting");
});

test("recovering frame rate clears the slow-window counter", () => {
  assert.equal(nextQuality(desktop({ fps: 60, slowWindows: 1 })).slowWindows, 0);
});

test("a pinned capture ratio is never overridden", () => {
  // The guard deleted in 0.8.0: the pin held at startup, then the adaptive loop
  // resampled it about a second in, so captures were not reproducible.
  for (const view of [true, false]) {
    for (const fps of [15, 60]) {
      const d = nextQuality(desktop({ fps, dpr: 1, pinnedDpr: 1, closeDetail: view, lodScale: 1.6 }));
      assert.equal(d.dpr, 1, "ratio held");
      assert.equal(d.lodScale, 1.6, "level of detail held");
    }
  }
});

test("level of detail degrades only once the ratio is already at the floor", () => {
  const atFloor = nextQuality(desktop({ fps: 20, dpr: 1.0, floor: 1.0, slowWindows: 5 }));
  assert.ok(atFloor.lodScale > 1, "coarsens geometry when pixels cannot be given back");

  const aboveFloor = nextQuality(desktop({ fps: 20, dpr: 1.5, floor: 1.0, slowWindows: 5 }));
  assert.equal(aboveFloor.lodScale, 1, "ratio is reduced first");
});

test("level of detail recovers before the ratio climbs again", () => {
  const d = nextQuality(desktop({ fps: 60, dpr: 1.25, lodScale: 1.6 }));
  assert.ok(d.lodScale < 1.6, "geometry recovers first");
  assert.equal(d.dpr, 1.25, "ratio waits until level of detail is back to 1");
});

test("the ratio never leaves the floor-to-ceiling band", () => {
  for (const mobile of [false, true]) {
    for (const closeDetail of [false, true]) {
      const floor = mobile ? 1.25 : 1.0;
      const ceiling = viewDprCeiling(closeDetail, mobile, MAXDPR);
      let dpr = floor;
      for (const fps of [10, 60, 45, 70, 20, 61, 59, 100]) {
        const d = nextQuality({
          fps, dpr, floor, maxDpr: MAXDPR, closeDetail, mobile,
          slowWindows: 0, lodScale: 1, pinnedDpr: null,
        });
        dpr = d.dpr;
        assert.ok(dpr >= floor - 1e-9 && dpr <= ceiling + 1e-9, `dpr ${dpr} outside [${floor}, ${ceiling}]`);
      }
    }
  }
});
