import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

test.beforeEach(async ({ page }) => {
  await page.setContent('<main id="notes"></main>');
  await page.addStyleTag({ path: resolve("styles.css") });
  await page.addScriptTag({ path: resolve("dist/kosmos-notes-workspace.js") });
  await page.evaluate(() => {
    const w = window as any;
    w.calls = []; w.authorized = true; w.opened = []; w.kosmos = 0; w.waits = {};
    const snapshot = (value: any) => ({ value, publish: async (apply: any, current: any) => {
      if (!w.authorized || !current()) return false;
      apply(value); return true;
    } });
    const host = {
      search: async (query: string, options: any) => {
        w.calls.push({ query, options });
        if (query === "slow") await new Promise(resolve => { w.waits.search = resolve; });
        if (query === "paged") return { ...snapshot({ results: [{title:"First",path:"Alpha.md"}],total:2 }), offset:0,
          next:async()=>({...snapshot({results:[{title:"Second",path:"Beta.md"}],total:2}),offset:1,next:null}) };
        return snapshot({ results: [{ title: query || "Alpha", path: "Alpha.md" }, { title: "Beta", path: "Beta.md" }], total: 2 });
      },
      read: async (path: string, options: any) => {
        w.calls.push({ path, options });
        if (w.slowRead && path === "Alpha.md") await new Promise(resolve => { w.waits.read = resolve; });
        const content = options.offset ? "Second page" : '# Safe heading\n\n**Readable** ![alt](https://invalid.test/a.png) <img src="https://invalid.test/b.png"> [click](javascript:alert(1)) ![[Secret]]';
        return snapshot({ note: { title: path, path, sensitivity: "public", content,
          continuation: { offset: options.offset || 0, next_offset: options.offset ? null : 100, revision: "revision-1", total_characters: 200, complete: !!options.offset } },
          projection: { authored: ["authored only"], derived: ["derived only"], proposed: ["proposed only"], approved: ["approved only"], effective: ["effective only"] } });
      },
    };
    w.workspace = w.KosmosNotesWorkspace.mountNotesWorkspace(document.querySelector("#notes"), host,
      { openSource: (path: string) => w.opened.push(path), openKosmos: () => w.kosmos++ });
  });
});

test("read, safe preview, provenance, continuation and canonical source actions", async ({ page }) => {
  const requests: string[] = []; page.on("request", req => requests.push(req.url()));
  await page.getByRole("button", { name: "Alpha", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Safe heading" })).toBeVisible();
  await expect(page.locator(".kosmos-notes-preview img, .kosmos-notes-preview a, .kosmos-notes-preview script")).toHaveCount(0);
  await expect(page.locator(".kosmos-notes-preview details")).toHaveCount(5);
  expect(requests).toEqual([]);
  await page.getByText("Authored", { exact: true }).click();
  await expect(page.getByText('[\n  "authored only"\n]', { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Read next part" }).click();
  await expect(page.getByText("Second page", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).calls.at(-1))).toMatchObject({ path: "Alpha.md", options: { offset: 100, revision: "revision-1" } });
  await page.getByRole("button", { name: "Open source in Obsidian" }).click();
  expect(await page.evaluate(() => (window as any).opened)).toEqual(["Alpha.md"]);
  await page.getByRole("button", { name: "Kosmos", exact: true }).click();
  expect(await page.evaluate(() => (window as any).kosmos)).toBe(1);
});

test("late searches and note reads cannot replace the current selection", async ({ page }) => {
  await page.getByRole("searchbox").fill("slow");
  await page.waitForFunction(() => !!(window as any).waits.search);
  await page.getByRole("searchbox").fill("new");
  await expect(page.getByRole("button", { name: "new", exact: true })).toBeVisible();
  await page.evaluate(() => { const w = window as any; w.waits.search(); w.slowRead = true; });
  await page.getByRole("button", { name: "new", exact: true }).click();
  await page.waitForFunction(() => !!(window as any).waits.read);
  await page.getByRole("button", { name: "Beta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Beta.md" })).toBeVisible();
  await page.evaluate(() => (window as any).waits.read());
  await expect(page.getByRole("heading", { name: "Alpha.md" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "slow", exact: true })).toHaveCount(0);
});

test("revoked scope refuses publication and opening an already displayed source", async ({ page }) => {
  await page.getByRole("button", { name: "Alpha", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alpha.md" })).toBeVisible();
  await page.evaluate(() => { (window as any).authorized = false; });
  await page.getByRole("button", { name: "Open source in Obsidian" }).click();
  expect(await page.evaluate(() => (window as any).opened)).toEqual([]);
  await page.getByRole("button", { name: "Beta", exact: true }).click();
  await expect(page.getByText("Note or scope changed. Select it again.")).toBeVisible();
  expect(await page.evaluate(() => {
    (window as any).workspace.refresh();
    return document.querySelector('[role="status"]')?.textContent;
  })).toBe("Searching…");
  await page.evaluate(() => (window as any).workspace.close());
  await expect(page.locator("#notes")).toBeEmpty();
});

test("keyboard selection and closing during a pending read leave no late content", async ({ page }) => {
  const alpha = page.getByRole("button", { name: "Alpha", exact: true });
  await alpha.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Alpha.md" })).toBeVisible();
  await page.evaluate(() => { (window as any).slowRead = true; });
  await alpha.focus(); await page.keyboard.press("Enter");
  await page.waitForFunction(() => !!(window as any).waits.read);
  await page.evaluate(async () => {
    const w = window as any; w.workspace.close(); w.waits.read();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  await expect(page.locator("#notes")).toBeEmpty();
});

test("search result continuation and return to the first page", async ({ page }) => {
  await page.getByRole("searchbox").fill("paged");
  await page.getByRole("button", { name:"Next results", exact:true }).click();
  await expect(page.getByRole("button", { name:"Second", exact:true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("2–2 of 2 readable matches");
  await expect(page.getByRole("button", { name:"First", exact:true })).toHaveCount(0);
  await page.getByRole("button", { name:"Back to first results", exact:true }).click();
  await expect(page.getByRole("button", { name:"First", exact:true })).toBeVisible();
});
