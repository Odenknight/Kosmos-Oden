import { test, expect } from '@playwright/test';

for (const quality of ['high', 'lite']) {
  test(`initial portrait ${quality} label bounds`, async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 727 });
    await page.goto(`/kosmos-oden-stand-alone.html?capture=1&seed=1907&time=0&dpr=1&quality=${quality}&camera=overview&animation=off`);
    await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('gone') && (window as any).__kosmosRenderStats.frames > 3);
    const labels = await page.locator('.lbl').evaluateAll(elements => elements
      .filter(el => Number(getComputedStyle(el).opacity) > 0.02)
      .map(el => { const r = el.getBoundingClientRect(); return { text: el.textContent, transform: (el as HTMLElement).style.transform, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.filter(r => !r.transform)).toEqual([]);
    expect(labels.filter(r => r.left < 0 || r.right > 393 || r.top < 0 || r.bottom > 727)).toEqual([]);
  });
}
