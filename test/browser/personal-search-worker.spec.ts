import { test, expect } from "@playwright/test";

/**
 * Personal Notes search worker in real Chromium (0.9.0, P05/P11): the built
 * worker text runs from a Blob URL, indexes a seeded corpus, answers queries
 * with original-spelling excerpts and edits become visible. Searching must not
 * cause a main-thread long task over 50 ms. Run after the build that produces
 * dist/ (`npm run build` or `node scripts/build.mjs --for-tests`):
 *   npx playwright test --project=chromium test/browser/personal-search-worker.spec.ts
 */
test("search worker runs from a Blob URL without main-thread long tasks", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "long-task timing is measured in Chromium");
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/test/browser/personal-search-harness.html");
  await page.waitForFunction(() => (window as any).harnessReady === true);
  const r = await page.evaluate(() => (window as any).runPersonalSearch({ notes: 1000, targetBytes: 5 * 1024 * 1024, rounds: 2, editCount: 2 }));

  expect(r.results["zephyrquartz"].paths).toEqual(["Area3/Sub3/Note 00003.md"]);
  expect(r.results["tailsentinel"].paths).toEqual(["Area7/Sub0/Note 00007.md"]);
  expect(r.results["tailsentinel"].excerpt).toContain("The tailsentinel closes this long note.");
  expect(r.results["café"].total).toBeGreaterThanOrEqual(2);
  expect(r.results["İstanbul"].excerpt).toContain("İSTANBUL MixedCASE");
  expect(r.results['"olive oil"'].total).toBe(50);
  expect(r.results["nonexistentwordxyz"].total).toBe(0);
  expect(r.results["zephyrquartz"].coverage).toEqual({ state: "ready", searched: 1000, omitted: 0 });
  expect(r.editTimes.every((ms: number) => ms < 3000)).toBe(true);
  expect(r.searchLongTasks.filter((t: { duration: number }) => t.duration > 50)).toEqual([]);
  expect(errors).toEqual([]);
});
