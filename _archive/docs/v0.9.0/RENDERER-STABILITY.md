# Renderer stability — 0.9.0

Scope: stability of star/planet rendering and of the WebGL renderer in general
(`src/renderer/**`). No change to cosmology classification, the host↔renderer
protocol, the iframe sandbox, `three` (still 0.186.1, provenance check passes)
or shader language. Branch `fable/pn090-renderer`, 2026-11-12.

## Method

The standalone build was driven with Playwright scripts outside the repository
against synthetic vaults of 1, 2, 40 (12-level nesting), 34 (identical names),
50, 120–300, 401 (one 400-planet system), 3,000 and 15,000 notes, plus empty
folders, with create/modify/delete/rename bursts and a 200-note bulk import.
To see inside the renderer a read-only probe, `__kosmosRenderer.inspect(ids?)`,
was added first (instance-matrix NaN/zero-scale/origin counts per layer, draw
count vs capacity, hero tier with handoff offset, near/far/aspect, DPR,
`uTime`, optional node positions). It is the only API addition; it ships so the
browser spec can use it.

## Defects fixed

| # | Symptom | Cause | Fix | Regression check |
|---|---|---|---|---|
| 1 | GPU memory grows with every graph update: 102 → 285 live GL buffers after 30 note creations (≈6 per rebuild); unbounded over a long Obsidian session. | `disposeAll()` disposed geometries and materials, but an `InstancedMesh` owns its `instanceMatrix` buffer, which Three releases only on `mesh.dispose()`. No instanced mesh (8 body layers, 6 hero layers, coronae, rings, nebula) was ever disposed. | `renderer.ts:300-306` — `disposeAll()` traverses `world` and disposes every `InstancedMesh` once (all callers: rebuild, context restore, teardown). After: 102 → 88 after 30 rebuilds. | `renderer-stability.spec.ts` "instance buffers stay intact and GPU buffers are released through a delta burst" (49 rebuilds, live buffers must grow < 40). |
| 2 | Orbits and shader animation jump after the tab/leaf was hidden, and after any stalled frame (shader compile, 15k-note rebuild). Measured: a 3 s `setHostVisible(false)` advanced `uTime` by 9.9 s and moved bodies 2.2 units in two frames; even two normal software-GL frames advanced it 5.4 s. Also a `THREE.Clock` deprecation warning on every load (r186). | `frame()` clamped `dt` to 50 ms but drove orbits and `uTime` from `clock.elapsedTime`, which is wall-clock and unclamped; `startLoop()`'s `getDelta()` "swallowed" the hidden gap for `dt` only, while still adding it to `elapsedTime`. | Own simulation clock: `simTime += frameDt(last, now)` (`renderer.ts:2142-2154`, `quality.ts:121` `frameDt`, ≤ 50 ms, 0 on the first frame after (re)start, never negative/NaN). `startLoop()` resets the frame timestamp (`renderer.ts:2201`). After: hidden 3 s → `uTime` +0.0076 s, max body motion 0.0016. | Node: "frame step is clamped…", "simulation time after a hidden hour equals time actually shown". Browser: "a hidden period does not advance orbits or shader time". |
| 3 | Star flicker, live pulses, granulation and planet spin degrade over long visible sessions (Obsidian left open for days): stepped/jittery motion. | `uTime` is float32 in the shaders. At 1e5 s its resolution is 7.8 ms (half a frame), so `sin(7.3·t)` advances in uneven steps; GPU `sin()` of such large arguments loses further precision. | `uTime = shaderTime(t)` (`quality.ts:133-137`): wrap at 2π·1000 s (~1.75 h). Every periodic term in `shaders.ts` and the corona material (×3, ×3.5, ×4, ×7.3) completes a whole number of turns per period, so they stay continuous. Orbits keep the unwrapped float64 time. Capture mode (`time=`) values are below the period, so captures are unchanged. | Node: "shader time wraps without breaking the periodic shader terms" (continuity of each frequency; float32 resolution < 1 ms; control shows the unwrapped value fails). |
| 4 | Adaptive pixel ratio flaps: on a device that holds 60 fps at one step and ~40 fps at the next, the ratio (and the canvas size) changed every ~3.6 s indefinitely. | `nextQuality()` had no memory: after stepping down for sustained slowness, the first fast window climbed straight back into the ratio just proven too slow. | `quality.ts:74-106`: stepping down records a cap just below the slow ratio for `DPR_CAP_HOLD_WINDOWS` (25 windows ≈ 30 s); the ramp-up never exceeds it while it holds. Backward compatible (new optional input fields; existing tests unchanged). | Node: "adaptive ratio settles instead of oscillating…" (old policy: ≥3 changes in 20 windows; new: 1), "a learned cap expires…". |
| 5 | On a 1x display the adaptive ramp rendered up to 2.0x (4x the pixels the screen can show) during close inspection, 1.5x in overview — although the initial ratio is clamped to the device. Moving the window to another monitor was never followed. | Ramp ceiling was the constant `MAXDPR = 2`, independent of `devicePixelRatio`. | `renderer.ts:2120`: per window `maxDpr = min(2, devicePixelRatio)`; floor clamped to it. Visual note: on 1x screens close-ups lose the implicit supersampling (MSAA stays on); revert is this one line if the owner prefers the old look. Capture mode pins `dpr`, so baselines are unaffected. | Covered by the existing ceiling/floor tests (pure policy); behaviour is a one-line input change. Not separately browser-tested (Playwright runs at DPR 1 where the ramp never triggered on this machine). |
| 6 | A hidden host (display:none leaf/iframe reporting 0x0) produced `camera.aspect = NaN` and `focalH = 0`: NaN projection while hidden, and the LOD pass culled every planet/moon/asteroid until the next cull after the view returned (pop-in of up to 8 frames). | `resize()` applied whatever size the window reported. | `renderer.ts:2097-2102`: ignore non-positive sizes and keep the last real one. | Browser: "a zero-size host keeps a finite projection and recovers its size" (iframe shrunk to 0x0 and restored). Reproduced by code path; the probe API did not exist on the unmodified build to show NaN directly. |

## Performance changes (measured, no behaviour change)

| Change | Where | Why |
|---|---|---|
| Hidden link layers are not rewritten/uploaded every other frame. All link layers are invisible unless "All links" is on; their endpoints (≈1 per body) were still recomputed and uploaded. The toggle refreshes them once on the way in. | `renderer.ts:647-651`, `:1251` | Wasted O(links) work + upload at 15k. Covered by the existing "All links gates connection drawing" spec. |
| Orbit constants packed into a `Float64Array` once per build; the per-frame loop no longer reads ~12 dynamically added fields per node (dictionary-mode objects). `cos/sin(θ−π)` reuse `cos/sin(θ)`. | `renderer.ts:553-605` | `animateOrbits` was 29 % of all main-thread samples at 15k; 15 % after. Same formulas and constants. |
| Instance matrices of orbiting bodies and coronae are written as scale + translation (6 / 3 floats) instead of `compose` + 16-float copy; per-record stable refs (`pos`, `r`, `vis`, `mat`). Body instances are never rotated (spin/tumble are in the vertex shader). | `renderer.ts:609-640`, record literal in `buildScene` | `updateInstancePositions` 12.4 % → 6.9 % of samples. |

### Before / after

Machine: Intel Core i7-10610U, Intel UHD Graphics (driver 31.0.101.2140),
Windows 11; Playwright Chromium headless shell 1248 with `--use-angle=d3d11`
(WebGL2 via ANGLE/D3D11 on the Intel GPU), 1280x800, DPR 1, synthetic vaults
(`makeVault`, benchmark generator shape). Overview = auto-rotating idle
overview; close-up = zoomed to the cluster core, core selected, zoomed to the
floor (8 bodies in the hero tier). 6 s windows after warm-up; "script" =
duration of the rAF callback (frame logic + GL command submission); two runs
each, laptop on battery profile so expect ±20 % noise.

| Vault / view | 0.9.0 base: fps | base: script ms (mean / p95) | after: fps | after: script ms (mean / p95) |
|---|---|---|---|---|
| 3,000 overview | 38.2 / 36.0 | 4.43 / 6.8 · 4.82 / 7.4 | 59.3 / 51.1 | 1.46 / 2.7 · 1.03 / 1.8 |
| 3,000 close-up | 46.8 / 41.6 | 5.05 / 7.5 · 4.74 / 6.5 | 41.0 / 53.3 | 3.35 / 5.3 · 2.56 / 4.0 |
| 15,000 overview | 30.6 / 28.7 | 17.97 / 29.1 · 17.45 / 27.3 | 51.5 / 34.3 | 6.62 / 13.8 · 9.97 / 18.7 |
| 15,000 close-up | 26.1 / 25.8 | 17.7 / 25.8 · 18.64 / 30.3 | 31.7 / 36.5 | 10.57 / 18.5 · 9.16 / 16.3 |

CPU profile, 15k overview, 4 s (unminified build): main thread idle 27 % → 49 %.
These numbers use a different metric from the 0.8.4 review (CDP
`ScriptDuration`, headed, 1600x900) and are not comparable to it; compare the
two columns above only. No fix adds per-frame work; #1 and #2 remove some.

## Verified as not defective (no change)

- Degenerate inputs (1 note, 2 notes, self-link, empty and 12-deep folders,
  identical names, one 400-planet system): finite positions, radii and orbit
  parameters, no visible instance at the origin or at zero scale, draw counts
  equal records. Node test "degenerate vaults…" pins this.
- Determinism: fresh load vs incremental `applyChanges` and reversed scan order
  through `GkxIndex` give bit-identical positions (browser and Node tests).
  The engine's one-shot `buildGraph()` is file-order dependent, but no Kosmos
  host feeds the renderer through it.
- Hero tier handoff: in a moving close-up (300 and 3,000 notes, 10 s at 60 fps)
  the tier changed membership twice, never flipped back within 1 s, no body was
  drawn by both tiers, hero/instanced position offset ≤ 1.1e-6. No hysteresis
  added.
- Instanced frustum culling: every instanced mesh has `frustumCulled = false`
  and picking is analytic, so stale bounds cannot hide or mis-pick bodies.
- Context loss/restore rebuilds intact buffers (new spec test).

## Found, deliberately not changed

- **Layout is not incrementally stable.** Adding one note to a 1,000-note vault
  moved 94 of 1,009 bodies by up to 30 units, because systems and asteroids
  are placed on Fibonacci-sphere slots indexed by their rank within the galaxy;
  one more member reshuffles every slot. Editing links without changing
  membership moved nothing. Fixing this means hash-anchored slot placement in
  `layout.ts`: a layout redesign that moves every body in every vault and every
  visual baseline, so it needs an owner decision.
- Close-up detail pop: promotion to the hero tier switches surface detail from
  `aDetail` 1 to 2 (0.8.4 design). Not a stability defect; a cross-fade would
  need a per-instance blend attribute.
- Spin, tumble and granulation take one discontinuity per 1.75 h of visible
  time at the shader-time wrap (#3). Cosmetic and bounded, versus unbounded
  precision loss without the wrap.
- Idle overview submits every other frame while DOM labels move every frame
  (≤ 0.5 px label/body offset during auto-rotate). Pre-existing, below
  visibility.
- Four tests (`standalone` "All links…", three `standalone-flows` download
  tests) time out or cancel downloads under `--workers=2` on software GL here;
  all pass with `--workers=1`. Not investigated against the base branch.

## Visual baselines

`npm run test:visual` (Chromium, `--workers=1`): `overview-high` and
`overview-lite` pass, `star-focus` differs by 104,657 px (ratio 0.12) —
identical to the unmodified branch on this machine (104,657 px), i.e. the
known stale baseline. No baseline needs review because of this work.

## Tests

- `test/renderer-stability.test.mjs` (Node, 7 tests): quality cap and expiry,
  frame clock, shader-time wrap, degenerate layouts, layout determinism.
  Imports the existing `dist/kosmos-renderer-quality.mjs`,
  `dist/kosmos-layout.mjs` and `dist/kosmos-core.mjs`; no build change.
- `test/browser/renderer-stability.spec.ts` (6 tests, ~1 min per project on
  software GL): delta burst integrity + GL buffer release, hidden period,
  zero-size host, hero tier, reload determinism, context loss. Passes on
  `chromium` and `mobile-chromium`; suggested for the required
  `test:browser:chromium` list.
