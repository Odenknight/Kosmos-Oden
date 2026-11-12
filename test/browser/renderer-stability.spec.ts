import { test, expect, type Page } from "@playwright/test";

/**
 * Renderer stability (0.9.0): instance-buffer integrity through delta bursts,
 * GPU-buffer release on rebuild, simulation time across hidden periods,
 * zero-size hosts, close-up tier handoff and layout determinism.
 * Uses `__kosmosRenderer.inspect()` and `__kosmosStandalone`. Run after `npm run build`.
 */
const PAGE = "/kosmos-oden-stand-alone.html";
const FROZEN = `${PAGE}?capture=1&seed=1907&time=0&dpr=1&quality=high&camera=overview&animation=off`;

const note = (relativePath: string, content = "") => ({ relativePath, content, modifiedTime: 1735689600000, createdTime: 1735689600000, kind: "note" });
function vault(n: number) {
  const folders = ["Alpha", "Beta", "Gamma", "Delta"];
  const files = Array.from({ length: n }, (_, i) => note(`${folders[i % 4]}/Note ${i}.md`, `# ${i}\n[[Note ${(i * 7) % n}]] [[Note ${(i * 11 + 3) % n}]]`));
  return { files, folders };
}

async function countGlBuffers(page: Page) {
  await page.addInitScript(() => {
    const w = window as any; w.__glBuffers = 0;
    const P = WebGL2RenderingContext.prototype as any;
    const create = P.createBuffer, del = P.deleteBuffer;
    P.createBuffer = function (...a: any[]) { const b = create.apply(this, a); if (b) w.__glBuffers++; return b; };
    P.deleteBuffer = function (...a: any[]) { w.__glBuffers--; return del.apply(this, a); };
  });
}

async function load(page: Page, url: string, n: number) {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__kosmosStandalone && (window as any).__kosmos?.ok);
  const v = vault(n);
  await page.evaluate((v) => (window as any).__kosmosStandalone.loadFromMemory(v.files, v.folders, [], "stability"), v);
  await page.waitForFunction(() => (window as any).__kosmosRenderStats?.frames > 2);
  return v;
}

const frames = (page: Page, k = 2) => page.evaluate(async (k) => { for (let i = 0; i < k; i++) await new Promise(requestAnimationFrame); }, k);
const inspect = (page: Page, ids?: string[]) => page.evaluate((ids) => (window as any).__kosmosRenderer.inspect(ids), ids);

function expectIntact(ins: any) {
  for (const [body, l] of Object.entries<any>(ins.layers)) {
    expect(l.nan, `${body}: non-finite instance matrices`).toBe(0);
    expect(l.zeroVisible, `${body}: visible bodies collapsed to zero scale`).toBe(0);
    expect(l.atOrigin, `${body}: visible bodies left at the origin`).toBe(0);
    expect(l.count, `${body}: draw count`).toBeGreaterThanOrEqual(l.records);
    expect(l.capacity, `${body}: capacity`).toBeGreaterThanOrEqual(l.count);
  }
}

test("instance buffers stay intact and GPU buffers are released through a delta burst", async ({ page }) => {
  await countGlBuffers(page);
  const v = await load(page, FROZEN, 160);
  await frames(page, 3);
  expectIntact(await inspect(page));
  const buffers0 = await page.evaluate(() => (window as any).__glBuffers);

  // create / modify / delete / rename bursts, then a bulk import
  await page.evaluate((v) => {
    const s = (window as any).__kosmosStandalone, mk = (p: string, c: string) => ({ relativePath: p, content: c, modifiedTime: 1, createdTime: 1, kind: "note" });
    for (let i = 0; i < 12; i++) {
      s.applyChanges({ changed: [mk(`Alpha/New ${i}.md`, `[[Note ${i}]]`)], removed: [], folders: v.folders });
      s.applyChanges({ changed: [mk(`Beta/Note ${i * 4 + 1}.md`, `edited ${i} [[Note 2]] [[New ${i}]]`)], removed: [], folders: v.folders });
      s.applyChanges({ changed: [], removed: [`Gamma/Note ${i * 4 + 2}.md`], folders: v.folders });
      s.applyChanges({ changed: [mk(`Delta/Renamed ${i}.md`, "[[Note 5]]")], removed: [`Delta/Note ${i * 4 + 3}.md`], folders: v.folders });
    }
    s.applyChanges({ changed: Array.from({ length: 200 }, (_, i) => mk(`Epsilon/Bulk ${i}.md`, `[[Bulk ${(i + 1) % 200}]]`)), removed: [], folders: [...v.folders, "Epsilon"] });
  }, v);
  await frames(page, 3);
  const ins = await inspect(page);
  expectIntact(ins);
  expect(ins.nodes).toBeGreaterThan(300);
  const buffers1 = await page.evaluate(() => (window as any).__glBuffers);
  // 49 rebuilds; before the fix every rebuild leaked ~6 instanceMatrix buffers.
  expect(buffers1 - buffers0, "live GL buffers after 49 rebuilds").toBeLessThan(40);
});

test("a hidden period does not advance orbits or shader time", async ({ page }) => {
  await load(page, PAGE, 120);
  await page.waitForTimeout(300);
  const r = await page.evaluate(async () => {
    const k = (window as any).__kosmos, R = (window as any).__kosmosRenderer;
    const t0 = R.inspect().uTime;
    k.setHostVisible(false);
    await new Promise((res) => setTimeout(res, 1500));
    k.setHostVisible(true);
    for (let i = 0; i < 2; i++) await new Promise(requestAnimationFrame);
    return { dt: R.inspect().uTime - t0, running: (window as any).__kosmosRenderStats.running };
  });
  expect(r.running).toBe(true);
  // Two frames of at most 50 ms each, never the 1.5 s the view was hidden.
  expect(r.dt).toBeGreaterThanOrEqual(0);
  expect(r.dt).toBeLessThan(0.2);
});

test("a zero-size host keeps a finite projection and recovers its size", async ({ page }) => {
  await page.goto("/test/browser/embed-harness.html");
  await page.setContent(`<iframe id="f" src="${FROZEN}" style="width:640px;height:400px;border:0"></iframe>`);
  const frame = page.frameLocator("#f");
  await expect(frame.locator("#stage canvas")).toHaveCount(1, { timeout: 15_000 });
  const f = page.frame({ url: /stand-alone/ })!;
  await f.waitForFunction(() => (window as any).__kosmosRenderStats?.frames > 2);
  await page.evaluate(() => { const e = document.getElementById("f")!; e.style.width = "0px"; e.style.height = "0px"; });
  await f.waitForFunction(() => window.innerWidth === 0);
  await f.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 30)); });
  expect(Number.isFinite(await f.evaluate(() => (window as any).__kosmosRenderer.inspect().aspect))).toBe(true);
  await page.evaluate(() => { const e = document.getElementById("f")!; e.style.width = "640px"; e.style.height = "400px"; });
  await f.waitForFunction(() => Math.abs((window as any).__kosmosRenderer.inspect().aspect - 1.6) < 1e-6);
});

test("close-up tier: promoted bodies are drawn once, at their body's position", async ({ page }) => {
  // The deep capture preset selects the largest star at close range, which
  // earns the close-up tier (software GL is too slow for a free-running zoom).
  await page.goto(FROZEN.replace("camera=overview", "camera=deep"));
  await page.waitForFunction(() => (window as any).__kosmosRenderer?.inspect?.().heroes.length > 0, null, { timeout: 15_000 });
  for (let s = 0; s < 4; s++) {
    const ins = await inspect(page);
    expectIntact(ins);
    expect(ins.heroes.length).toBeLessThanOrEqual(8);
    for (const h of ins.heroes) {
      expect(h.instancedScale, `${h.id} also drawn by the instanced layer`).toBe(0);
      expect(h.drawn).toBe(true);
      expect(h.heroScale).toBeGreaterThan(0);
      expect(h.offset, `${h.id} hero offset`).toBeLessThan(1e-3);
    }
    await page.waitForTimeout(120);
  }
});

test("the same vault lays out identically across reloads", async ({ page }) => {
  test.slow(); // loads the scene twice; timed out at 30 s beside another worker on software GL
  const ids = vault(200).files.map((f) => "file:" + f.relativePath);
  await load(page, FROZEN, 200);
  const a = (await inspect(page, ids)).positions;
  await load(page, FROZEN, 200);
  const b = (await inspect(page, ids)).positions;
  expect(Object.values(a).every((p) => Array.isArray(p) && (p as number[]).every(Number.isFinite))).toBe(true);
  expect(b).toEqual(a);
});

test("instance buffers are rebuilt intact after a WebGL context loss", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "lose_context is reliable on Chromium");
  await load(page, FROZEN, 120);
  await page.evaluate(() => {
    const gl = (document.querySelector("#stage canvas") as HTMLCanvasElement).getContext("webgl2");
    const ext = gl && (gl.getExtension("WEBGL_lose_context") as any);
    (window as any).__lose = ext; ext.loseContext();
  });
  await page.waitForFunction(() => (window as any).__kosmosRenderStats.running === false);
  await page.evaluate(() => setTimeout(() => (window as any).__lose.restoreContext(), 50));
  await page.waitForFunction(() => (window as any).__kosmosRenderStats.running === true, null, { timeout: 15_000 });
  await frames(page, 3);
  const ins = await inspect(page);
  expectIntact(ins);
  expect(ins.nodes).toBeGreaterThan(100);
});
