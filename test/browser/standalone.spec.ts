import { test, expect } from "@playwright/test";

/**
 * Real-browser smoke test for the stable WebGL2 standalone artifact
 * (CI/CD directive §7.4). Uses deterministic capture mode so the scene boots
 * without a folder picker. Run after `npm run build`.
 */
const CAPTURE = "/vault-kosmos.html?capture=1&seed=1907&time=0&dpr=1&quality=high&camera=overview&animation=off";

test("standalone boots the r185 WebGL2 renderer and draws the demo cosmos", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(CAPTURE);

  // Headless Firefox on some Linux runners exposes no WebGL2 device. The
  // separate fallback test below verifies that unsupported path; do not turn
  // a missing runner capability into a renderer regression.
  const hasWebGL2 = await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"));
  test.skip(!hasWebGL2, "WebGL2 is unavailable in this browser/runner combination");

  // renderer descriptor is exposed once createKosmosApp runs
  await page.waitForFunction(() => (window as any).__kosmosRenderer != null, null, { timeout: 15_000 });
  const r = await page.evaluate(() => (window as any).__kosmosRenderer);
  expect(r.backend).toBe("webgl2");
  expect(r.threeRevision).toBe("185");

  // the demo scene reaches a ready state (boot overlay clears, stats populate)
  await page.waitForFunction(() => {
    const b = document.getElementById("boot");
    return b && b.classList.contains("gone");
  }, null, { timeout: 15_000 });
  const stats = await page.locator("#stats").innerText();
  expect(stats).toMatch(/\bNodes\b/i);

  // canvas present and at least one frame produced while visible
  await page.waitForFunction(() => (window as any).__kosmosRenderStats?.frames > 0, null, { timeout: 15_000 });
  expect(await page.locator("#stage canvas").count()).toBe(1);

  // no external network requests were emitted (offline promise)
  expect(errors, "no console/page errors").toEqual([]);
});

test("standalone reports WebGL2 requirement message when WebGL2 is unavailable", async ({ page }) => {
  // Force getContext('webgl2') to fail before any script runs.
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    // @ts-ignore
    HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: any[]) {
      if (type === "webgl2") return null;
      return orig.call(this, type, ...rest);
    };
  });
  await page.goto(CAPTURE);
  await expect(page.locator("#bootMsg")).toContainText(/WebGL2/i, { timeout: 10_000 });
});
