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
}

export interface QualityDecision {
  dpr: number;
  slowWindows: number;
  lodScale: number;
}

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

  if (input.pinnedDpr != null) {
    return { dpr: input.pinnedDpr, slowWindows: input.slowWindows, lodScale };
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
  } else if (fps > 58 && next < ceiling && lodScale <= 1) {
    next = Math.min(ceiling, next + 0.25);
  }

  let nextLod = lodScale;
  if (fps < 30 && next <= floor + 0.001) nextLod = Math.min(2.4, lodScale + 0.3);
  else if (fps > 58 && lodScale > 1) nextLod = Math.max(1, lodScale - 0.3);

  return { dpr: next, slowWindows, lodScale: nextLod };
}
