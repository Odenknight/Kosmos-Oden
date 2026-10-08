# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: portrait-debug.spec.ts >> initial portrait high label bounds
- Location: test\browser\portrait-debug.spec.ts:4:3

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 58

- Array []
+ Array [
+   Object {
+     "bottom": 25.1875,
+     "left": 0,
+     "right": 84.109375,
+     "text": "Atlas8",
+     "top": 0,
+     "transform": "",
+   },
+   Object {
+     "bottom": 25.1875,
+     "left": 0,
+     "right": 112.578125,
+     "text": "Research8",
+     "top": 0,
+     "transform": "",
+   },
+   Object {
+     "bottom": 25.1875,
+     "left": 0,
+     "right": 109.96875,
+     "text": "Projects8",
+     "top": 0,
+     "transform": "",
+   },
+   Object {
+     "bottom": 25.1875,
+     "left": 0,
+     "right": 102.46875,
+     "text": "Sources8",
+     "top": 0,
+     "transform": "",
+   },
+   Object {
+     "bottom": 25.1875,
+     "left": 0,
+     "right": 103.609375,
+     "text": "Writing8",
+     "top": 0,
+     "transform": "",
+   },
+   Object {
+     "bottom": 25.1875,
+     "left": 0,
+     "right": 91.375,
+     "text": "People8",
+     "top": 0,
+     "transform": "",
+   },
+   Object {
+     "bottom": 25.1875,
+     "left": 0,
+     "right": 101.921875,
+     "text": "Archive8",
+     "top": 0,
+     "transform": "",
+   },
+ ]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic:
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
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | for (const quality of ['high', 'lite']) {
  4  |   test(`initial portrait ${quality} label bounds`, async ({ page }) => {
  5  |     await page.setViewportSize({ width: 393, height: 727 });
  6  |     await page.goto(`/kosmos-oden-stand-alone.html?capture=1&seed=1907&time=0&dpr=1&quality=${quality}&camera=overview&animation=off`);
  7  |     await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('gone') && (window as any).__kosmosRenderStats.frames > 3);
  8  |     const labels = await page.locator('.lbl').evaluateAll(elements => elements
  9  |       .filter(el => Number(getComputedStyle(el).opacity) > 0.02)
  10 |       .map(el => { const r = el.getBoundingClientRect(); return { text: el.textContent, transform: (el as HTMLElement).style.transform, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
  11 |     expect(labels.length).toBeGreaterThan(0);
> 12 |     expect(labels.filter(r => !r.transform)).toEqual([]);
     |                                              ^ Error: expect(received).toEqual(expected) // deep equality
  13 |     expect(labels.filter(r => r.left < 0 || r.right > 393 || r.top < 0 || r.bottom > 727)).toEqual([]);
  14 |   });
  15 | }
  16 | 
```