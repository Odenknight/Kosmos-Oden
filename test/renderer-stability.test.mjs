import test from "node:test";
import assert from "node:assert/strict";
import {
  nextQuality, frameDt, shaderTime, MAX_FRAME_DT, SHADER_TIME_PERIOD, DPR_CAP_HOLD_WINDOWS,
} from "../dist/kosmos-renderer-quality.mjs";
import { buildCosmos, layoutCosmos } from "../dist/kosmos-layout.mjs";
import { GkxIndex } from "../dist/kosmos-core.mjs";

/* ---- adaptive quality must not flap ---- */

/** A device that holds 60 fps at 1.25 but only 40 fps at 1.5. */
const fpsAt = (dpr) => (dpr > 1.3 ? 40 : 60);

test("adaptive ratio settles instead of oscillating around a too-slow level", () => {
  let s = { fps: 60, dpr: 1.5, floor: 1, maxDpr: 2, closeDetail: false, mobile: false, slowWindows: 0, lodScale: 1, pinnedDpr: null };
  let changes = 0, prev = s.dpr;
  // 20 windows (~24 s). Before the cap this changed the ratio every ~3 windows.
  for (let i = 0; i < 20; i++) {
    const d = nextQuality({ ...s, fps: fpsAt(s.dpr) });
    if (d.dpr !== prev) changes++;
    prev = d.dpr;
    s = { ...s, dpr: d.dpr, slowWindows: d.slowWindows, lodScale: d.lodScale, cap: d.cap, capWindows: d.capWindows };
  }
  assert.equal(changes, 1, "one step down, then stable");
  assert.equal(s.dpr, 1.25);
});

test("a learned cap expires, so a transient stall does not blur the session for good", () => {
  let s = { fps: 60, dpr: 1.25, floor: 1, maxDpr: 2, closeDetail: false, mobile: false, slowWindows: 0, lodScale: 1, pinnedDpr: null, cap: 1.25, capWindows: DPR_CAP_HOLD_WINDOWS };
  const seen = [];
  for (let i = 0; i < DPR_CAP_HOLD_WINDOWS + 2; i++) {
    const d = nextQuality(s);
    seen.push(d.dpr);
    s = { ...s, dpr: d.dpr, slowWindows: d.slowWindows, lodScale: d.lodScale, cap: d.cap, capWindows: d.capWindows };
  }
  assert.equal(seen[DPR_CAP_HOLD_WINDOWS - 3], 1.25, "held while the cap is live");
  assert.equal(s.dpr, 1.5, "climbs again to the overview ceiling once it expires");
});

/* ---- frame clock ---- */

test("frame step is clamped, never negative, and zero right after a (re)start", () => {
  assert.equal(frameDt(null, 1000), 0, "first frame after start/resume advances nothing");
  assert.equal(frameDt(1000, 1016), 0.016);
  assert.equal(frameDt(1000, 1000 + 3_600_000), MAX_FRAME_DT, "an hour hidden is one clamped step");
  assert.equal(frameDt(2000, 1000), 0, "clock going backwards");
  assert.equal(frameDt(1000, NaN), 0);
});

test("simulation time after a hidden hour equals time actually shown", () => {
  // 10 s visible at 60 fps, a 1 h gap with the loop stopped (restart => null), 10 s more.
  let t = 0, last = null, now = 0;
  for (let i = 0; i < 600; i++) { now += 1000 / 60; t += frameDt(last, now); last = now; }
  last = null; now += 3_600_000;
  for (let i = 0; i < 600; i++) { now += 1000 / 60; t += frameDt(last, now); last = now; }
  assert.ok(Math.abs(t - 20) < 0.05, `sim time ${t}`);
});

test("shader time wraps without breaking the periodic shader terms", () => {
  assert.equal(shaderTime(12.5), 12.5, "small times untouched (captures are unchanged)");
  const day = 86_400 * 3 + 0.123;
  const w = shaderTime(day);
  assert.ok(w >= 0 && w < SHADER_TIME_PERIOD);
  // Every frequency used by a periodic term in shaders.ts / the glow material.
  for (const k of [3.0, 3.5, 4.0, 7.3]) {
    assert.ok(Math.abs(Math.sin(k * day) - Math.sin(k * w)) < 1e-6, `sin(${k}t) continuous across wrap`);
  }
  // float32 resolution stays sub-millisecond for the wrapped value.
  const f = new Float32Array([w])[0];
  assert.ok(Math.abs(f - w) < 1e-3, "float32 uTime keeps < 1 ms resolution");
  assert.ok(Math.abs(new Float32Array([day])[0] - day) > 1e-3, "control: unwrapped value does not");
});

/* ---- layout: finite, deterministic, order independent ---- */

const note = (p, body = "") => ({ relativePath: p, content: body, modifiedTime: 1, createdTime: 1, kind: "note" });

// Both hosts (plugin embed and standalone) feed the renderer through GkxIndex.
function layout(files, folders = []) {
  return layoutCosmos(buildCosmos(new GkxIndex().setFiles(files, folders, []).graph));
}

function assertFinite(g, label) {
  for (const n of g.nodes) {
    if (n.role === "hidden") continue;
    assert.ok(n.position && n.position.every(Number.isFinite), `${label}: ${n.id} position ${n.position}`);
    assert.ok(Number.isFinite(n.__r) && n.__r > 0, `${label}: ${n.id} radius ${n.__r}`);
    if (n.__ov) {
      assert.ok(n.__ov.every(Number.isFinite) && Number.isFinite(n.__os) && Number.isFinite(n.__ecc), `${label}: ${n.id} orbit`);
      assert.ok(n.__ecc >= 0 && n.__ecc < 1, `${label}: ${n.id} eccentricity ${n.__ecc}`);
    }
  }
}

test("degenerate vaults lay out with finite positions, radii and orbits", () => {
  const shapes = {
    one: [note("Only.md")],
    two: [note("A.md", "[[B]]"), note("B.md", "[[A]]")],
    selfOnly: [note("Self.md", "[[Self]]")],
    sameNames: Array.from({ length: 12 }, (_, i) => note(`F${i % 3}/same${i}.md`, "[[same0]]")),
    deep: Array.from({ length: 20 }, (_, i) => note(Array.from({ length: (i % 10) + 1 }, (_, d) => "d" + d).join("/") + `/n${i}.md`, i ? `[[n${i - 1}]]` : "")),
    hub: [note("Hub.md", Array.from({ length: 200 }, (_, i) => `[[S${i}]]`).join(" ")), ...Array.from({ length: 200 }, (_, i) => note(`S${i}.md`, "[[Hub]]"))],
  };
  for (const [name, files] of Object.entries(shapes)) {
    const folders = [...new Set(files.flatMap((f) => { const parts = f.relativePath.split("/").slice(0, -1); return parts.map((_, i) => parts.slice(0, i + 1).join("/")); }))];
    assertFinite(layout(files, [...folders, "Empty", "Empty/Nested"]), name);
  }
});

test("layout is identical across reloads, scan order and incremental rebuilds", () => {
  const files = Array.from({ length: 120 }, (_, i) => note(`A${i % 5}/N${i}.md`, `[[N${(i * 7) % 120}]] [[N${(i * 13) % 120}]]`));
  const folders = ["A0", "A1", "A2", "A3", "A4"];
  const pos = (g) => new Map(g.nodes.map((n) => [n.id, n.position.join(",")]));
  const a = layout(files, folders);
  assert.deepEqual(pos(layout(files, folders)), pos(a), "reload");
  assert.deepEqual(pos(layout(files.slice().reverse(), folders.slice().reverse())), pos(a), "scan order");
  // A delta applied to a live index lays out exactly like a fresh load of the result.
  const extra = note("A1/Zeta.md", "[[N2]]");
  const ix = new GkxIndex(); ix.setFiles(files, folders, []);
  const inc = layoutCosmos(buildCosmos(ix.applyChanges({ changed: [extra], removed: ["A3/N8.md"], folders, attachments: [] }).graph));
  const fresh = layout([...files.filter((f) => f.relativePath !== "A3/N8.md"), extra], folders);
  assert.deepEqual(pos(inc), pos(fresh), "incremental == fresh");
});
