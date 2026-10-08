# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual.spec.ts >> visual: star-focus
- Location: test\browser\visual.spec.ts:20:3

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  104027 pixels (ratio 0.12 of all image pixels) are different.

  Snapshot: star-focus.png

Call log:
  - Expect "toHaveScreenshot(star-focus.png)" with timeout 15000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 104039 pixels (ratio 0.12 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 104027 pixels (ratio 0.12 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic:
    - generic:
      - text: Vault Gkx
      - generic: Projects
    - generic: Demo Vault
    - generic: Local Data Ethics
    - generic: Navigation Research
    - generic: Review Dashboard
    - generic: Graph Vocabulary
    - generic: Navigation Principles
    - generic: Graph Layout Notes
    - generic: Interface Atmosphere
    - generic: AI Interface Notes
    - generic: Future Contributors
    - generic: Human Attention
    - generic: Cognitive Load
    - generic: Automation Console
    - generic: Old Layouts
    - generic: Atlas8
    - generic: Research8
    - generic: Projects8
    - generic: Sources8
    - generic: Writing8
    - generic: People8
    - generic: Archive8
    - generic:
      - generic:
        - img
    - generic:
      - generic:
        - img
    - generic:
      - generic:
        - img
    - generic:
      - generic:
        - img
    - generic:
      - generic:
        - img
    - generic:
      - generic:
        - img
  - generic:
    - paragraph: Charting the constellation…
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | /**
  4  |  * Deterministic visual-regression baselines (CI/CD directive §7.5).
  5  |  * Per-browser reference images with a perceptual threshold — NOT bit-for-bit
  6  |  * across GPU vendors. An agent may propose a new baseline but must not approve
  7  |  * its own visual-baseline update. Run after `npm run build`; generate baselines
  8  |  * with `playwright test --update-snapshots` on the reference machine.
  9  |  */
  10 | const base = (extra: string) =>
  11 |   `/kosmos-oden-stand-alone.html?capture=1&seed=1907&time=0&dpr=1&animation=off&${extra}`;
  12 | 
  13 | const VIEWS: Array<{ name: string; q: string }> = [
  14 |   { name: "overview-high", q: "quality=high&camera=overview" },
  15 |   { name: "overview-lite", q: "quality=lite&camera=overview" },
  16 |   { name: "star-focus", q: "quality=high&camera=focus" },
  17 | ];
  18 | 
  19 | for (const v of VIEWS) {
  20 |   test(`visual: ${v.name}`, async ({ page }) => {
  21 |     await page.goto(base(v.q));
  22 |     await page.waitForFunction(() => {
  23 |       const b = document.getElementById("boot");
  24 |       return b && b.classList.contains("gone") && (window as any).__kosmosRenderStats?.frames > 1;
  25 |     }, null, { timeout: 15_000 });
  26 |     // let the frozen (deterministic) frame settle
  27 |     await page.waitForTimeout(400);
  28 |     // Page capture includes the compositor-backed WebGL canvas; element-only
  29 |     // canvas screenshots are blank on some headless software-GPU paths.
> 30 |     await expect(page).toHaveScreenshot(`${v.name}.png`, { fullPage: false });
     |                        ^ Error: expect(page).toHaveScreenshot(expected) failed
  31 |   });
  32 | }
  33 | 
```