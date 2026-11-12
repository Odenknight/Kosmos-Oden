/**
 * Adaptive render-quality policy.
 *
 * Deliberately free of DOM and Three.js imports: renderer.ts owns the frame
 * measurement and applies the result, while the decision itself stays pure and
 * unit-testable. `dist/kosmos-renderer-quality.mjs` is the bundle the Node test
 * suite imports.
 */

export interface QualityInput {
  /** Frames per second measured over the window that just closed. */
  fps: number;
  /** Device pixel ratio currently in use. */
  dpr: number;
  /** Lowest ratio this device may be driven to. */
  floor: number;
  /** Highest ratio the product will ever request. */
  maxDpr: number;
  /** True while the viewer is inspecting detail: a selection, a hover, a camera
   *  flight, or a camera close enough that surface detail resolves. */
  closeDetail: boolean;
  mobile: boolean;
  /** Consecutive slow windows observed before this one. */
  slowWindows: number;
  /** Geometry level-of-detail multiplier currently in use. */
  lodScale: number;
  /** Ratio pinned by a capture preset, or null when not capturing. */
  pinnedDpr: number | null;
  /** Highest ratio the ramp-up may return to: set just below a ratio that
   *  proved too slow, so the policy does not climb straight back into it.
   *  Omitted means no learned cap. */
  cap?: number;
  /** Windows left before the learned cap expires. */
  capWindows?: number;
}

export interface QualityDecision {
  dpr: number;
  slowWindows: number;
  lodScale: number;
  cap: number;
  capWindows: number;
}

/** Adaptive windows (~1.2 s each) a learned cap holds: about 30 s, so a
 *  transient stall cannot blur the session for long, while a ratio that is
 *  genuinely too slow is retried at most twice a minute instead of every
 *  few seconds. */
export const DPR_CAP_HOLD_WINDOWS = 25;

/**
 * Highest pixel ratio worth rendering for the current view.
 *
 * Overview is deliberately cheaper than close inspection. Procedural surface
 * detail is not resolvable while bodies are small on screen, and fragment cost
 * scales with the square of the ratio, so the extra work buys nothing visible.
 * This ceiling was dropped in 0.8.0, which left an idle overview shading about
 * 1.8x the pixels of 0.7.x on desktop and about 2.6x on mobile.
 */
export function viewDprCeiling(closeDetail: boolean, mobile: boolean, maxDpr: number): number {
  return closeDetail ? maxDpr : Math.min(maxDpr, mobile ? 1.25 : 1.5);
}

/**
 * One adaptive-quality step. Pure: the same input always yields the same
 * decision, and nothing here touches the renderer.
 *
 * A capture preset that pins the ratio wins outright, so a deterministic
 * screenshot is not silently resampled a second into the run.
 */
export function nextQuality(input: QualityInput): QualityDecision {
  const { fps, dpr, floor, maxDpr, closeDetail, mobile, lodScale } = input;

  let capWindows = Math.max(0, (input.capWindows ?? 0) - 1);
  let cap = capWindows > 0 && input.cap != null ? input.cap : maxDpr;

  if (input.pinnedDpr != null) {
    return { dpr: input.pinnedDpr, slowWindows: input.slowWindows, lodScale, cap: input.cap ?? maxDpr, capWindows: input.capWindows ?? 0 };
  }

  const ceiling = viewDprCeiling(closeDetail, mobile, maxDpr);
  let next = dpr;
  let slowWindows = fps < 42 ? input.slowWindows + 1 : 0;

  if (next > ceiling) {
    // Returning to overview: give the pixels back at once rather than waiting
    // for the frame rate to degrade first.
    next = Math.max(ceiling, next - 0.25);
  } else if (slowWindows >= 2 && next > floor) {
    // Sustained load only. A single slow sample during shader compilation or
    // first layout must not permanently blur the session.
    next = Math.max(floor, next - 0.25);
    slowWindows = 0;
    // Remember that the ratio just left was too slow. Without this the next
    // fast window climbs straight back into it, which then measures slow
    // again: the ratio (and the canvas size) flapped every few seconds.
    cap = next; capWindows = DPR_CAP_HOLD_WINDOWS;
  } else if (fps > 58 && next < Math.min(ceiling, cap) && lodScale <= 1) {
    next = Math.min(ceiling, cap, next + 0.25);
  }

  let nextLod = lodScale;
  if (fps < 30 && next <= floor + 0.001) nextLod = Math.min(2.4, lodScale + 0.3);
  else if (fps > 58 && lodScale > 1) nextLod = Math.max(1, lodScale - 0.3);

  return { dpr: next, slowWindows, lodScale: nextLod, cap, capWindows };
}

/* ---- frame clock ----
 * The renderer advances its own simulation time by a clamped per-frame step
 * instead of reading wall-clock elapsed time. Orbits and shader animation are
 * functions of this time, so a hidden tab/leaf, a stalled frame (shader
 * compile, a large rebuild) or a suspended loop resumes where it stopped
 * instead of jumping by the wall-clock gap. */

/** Longest simulation step one frame may take, in seconds. */
export const MAX_FRAME_DT = 0.05;

/** Simulation step for a frame at `nowMs`, given the previous frame time
 *  (null after a (re)start). Never negative, NaN or above MAX_FRAME_DT. */
export function frameDt(lastMs: number | null, nowMs: number): number {
  if (lastMs == null || !(nowMs > lastMs)) return 0;
  return Math.min((nowMs - lastMs) / 1000, MAX_FRAME_DT);
}

/** Period after which shader time wraps: 2π·1000 s (~1.75 h). Every periodic
 *  shader term uses a frequency whose product with this period is a whole
 *  number of turns (×3, ×3.5, ×4, ×7.3), so those terms stay continuous at the
 *  wrap; spin, tumble and granulation take one discontinuity per period.
 *  Without the wrap, float32 `uTime` loses sub-frame resolution after about a
 *  day of visible time (ulp 7.8 ms at 1e5 s) and GPU sin() of the large
 *  arguments degrades, so flicker and pulses stutter. */
export const SHADER_TIME_PERIOD = 2 * Math.PI * 1000;

export function shaderTime(t: number): number {
  return t >= 0 && t < SHADER_TIME_PERIOD ? t : ((t % SHADER_TIME_PERIOD) + SHADER_TIME_PERIOD) % SHADER_TIME_PERIOD;
}
