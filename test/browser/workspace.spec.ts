import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent('<main id="notes"></main>');
  await page.addStyleTag({ path: resolve("styles.css") });
  await page.addScriptTag({ path: resolve("dist/kosmos-notes-workspace.js") });
  await page.evaluate(() => {
    const w = window as any;
    w.calls = []; w.authorized = true; w.opened = []; w.kosmos = 0; w.located = []; w.waits = {};
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
        if (w.unreadable === path) return snapshot({ note: { error: "unavailable" }, projection: null });
        if (w.slowRead && path === "Alpha.md") await new Promise(resolve => { w.waits.read = resolve; });
        const content = options.offset ? "Second page" : '# Safe heading\n\n**Readable** ![alt](https://invalid.test/a.png) <img src="https://invalid.test/b.png"> [click](javascript:alert(1)) ![[Secret]]';
        return snapshot({ note: { title: path, path, sensitivity: "public", content, tags:["navigation-only"],
          continuation: { offset: options.offset || 0, next_offset: options.offset ? null : 100, revision: "revision-1", total_characters: 200, complete: !!options.offset } },
          related:w.related??{outgoing:[{title:"Related Beta",path:"Beta.md"}],backlinks:[],semantic:[]},
          assessment:w.assessment??null,diagnostics:w.diagnostics??null,
          projection: { authored: ["authored only"], derived: ["derived only"], proposed: ["proposed only"], approved: ["approved only"], effective: ["effective only"] } });
      },
    };
    w.workspace = w.KosmosNotesWorkspace.mountNotesWorkspace(document.querySelector("#notes"), host,
      { openSource: (path: string) => w.opened.push(path), openKosmos: (path?: string) => { w.kosmos++; w.located.push(path); } });
  });
});

test("refresh and folder rename retain selection; deletion and unreadability clear it", async ({ page }) => {
  await page.getByRole("button", { name: "Alpha", exact: true }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alpha.md", exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).workspace.rename("Alpha.md", "Folder/Alpha.md"));
  await expect(page.getByRole("heading", { name: "Folder/Alpha.md", exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).workspace.rename("Folder", "Renamed"));
  await expect(page.getByRole("heading", { name: "Renamed/Alpha.md", exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).workspace.remove("Renamed"));
  await expect(page.locator(".kosmos-notes-preview")).toBeEmpty();
  await page.getByRole("button", { name: "Alpha", exact: true }).click();
  await page.evaluate(() => { const w = window as any; w.unreadable = "Alpha.md"; w.workspace.refresh(); });
  await expect(page.getByText("Note unavailable in the current scope.", { exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).workspace.refresh());
  await expect(page.locator(".kosmos-notes-preview")).toBeEmpty();
});

test("read, safe preview, provenance, continuation and canonical source actions", async ({ page }) => {
  const requests: string[] = []; page.on("request", req => requests.push(req.url()));
  await page.getByRole("button", { name: "Alpha", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Safe heading" })).toBeVisible();
  await expect(page.locator(".kosmos-notes-preview img, .kosmos-notes-preview a, .kosmos-notes-preview script")).toHaveCount(0);
  await expect(page.locator(".kosmos-notes-inspector details")).toHaveCount(5);
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

test("inspector navigation tags and readable links use the checked selection flow", async ({page})=>{
  await page.getByRole('button',{name:'Alpha',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Navigation tags',exact:true})).toBeVisible();
  await expect(page.getByText('navigation-only',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Related Beta',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Beta.md',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).calls.at(-1).path)).toBe('Beta.md');
  await page.evaluate(()=>(window as any).related={outgoing:Array.from({length:40},(_,i)=>({title:`Neighbor ${i}`,path:`Neighbor${i}.md`})),backlinks:[],semantic:[]});
  await page.getByRole('button',{name:'Alpha',exact:true}).click();
  await expect(page.locator('.kosmos-notes-inspector svg circle')).toHaveCount(33);
  await expect(page.getByText(/Map limited to 32 neighbors/)).toBeVisible();
});

test('assessment distinguishes unavailable, zero and unrecorded; diagnostics remain text',async({page})=>{
  const alpha=page.getByRole('button',{name:'Alpha',exact:true});await alpha.click();
  await expect(page.getByText('Assessment not available with a recognized interpretation.')).toBeVisible();
  await expect(page.getByText('Diagnostics unavailable',{exact:true})).toBeVisible();
  await page.evaluate(()=>{const w=window as any;w.assessment={interpretation:'documentation-and-support-quality-not-truth',scores:{overall:0},policy:{id:'fixture-policy'}};w.diagnostics={diagnostics:[]};});
  await alpha.click();
  await expect(page.getByText('Documentation score: 0%',{exact:true})).toBeVisible();
  await expect(page.getByText('No diagnostics reported',{exact:true})).toBeVisible();
  await expect(page.getByText('Measures documentation and supporting evidence. It does not establish truth or approval.',{exact:true})).toBeVisible();
  await page.evaluate(()=>{const w=window as any;w.assessment.scores.overall=null;w.diagnostics={diagnostics:[{severity:'warning',code:'FIXTURE',message:'<img src=x onerror=alert(1)>'}]};});
  await alpha.click();
  await expect(page.getByText('Documentation score: Not recorded',{exact:true})).toBeVisible();
  await expect(page.getByText('warning: FIXTURE — <img src=x onerror=alert(1)>',{exact:true})).toBeVisible();
  await expect(page.locator('.kosmos-notes-preview img')).toHaveCount(0);
});

test('saved layout restores controls and rechecks selection without retaining preview content', async ({ page }) => {
  await page.getByRole('searchbox').fill('saved');
  await page.getByRole('button', { name: 'saved', exact: true }).click();
  const state = await page.evaluate(() => (window as any).workspace.getState());
  expect(state).toEqual({ query: 'saved', tag: '', body: false, selectedPath: 'Alpha.md' });
  await page.evaluate(state => (window as any).workspace.restore(state), state);
  await expect(page.getByRole('heading', { name: 'Alpha.md', exact: true })).toBeVisible();
  await page.evaluate(state => { const w = window as any; w.authorized = false; w.workspace.restore(state); }, state);
  await expect(page.getByText('Scope changed. Search again.', { exact: true })).toBeVisible();
  await expect(page.locator('.kosmos-notes-preview')).toBeEmpty();
  await page.evaluate(() => { const w = window as any; w.authorized = true; w.workspace.restore({ query: {}, tag: [], body: 'true', selectedPath: 42 }); });
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Alpha', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).workspace.getState())).toEqual({ query: '', tag: '', body: false, selectedPath: undefined });
});

test('manual refresh consumes pending debounce without later clearing a new selection', async ({ page }) => {
  await page.getByRole('button', { name: 'Alpha', exact: true }).waitFor();
  await page.clock.install();
  // Keep the pending debounce pending while browser actions run.
  await page.clock.pauseAt(new Date());
  await page.getByRole('searchbox').fill('manual');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('button', { name: 'manual', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha.md', exact: true })).toBeVisible();
  await page.clock.runFor(250);
  await expect(page.getByRole('heading', { name: 'Alpha.md', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).calls.filter((x: any) => x.query === 'manual').length)).toBe(1);
});

test('locating a note uses its selected path and rechecks authority',async({page})=>{
  await page.getByRole('button',{name:'Alpha',exact:true}).click();
  await page.getByRole('button',{name:'Locate in Kosmos',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).located)).toEqual(['Alpha.md']);
  await page.evaluate(()=>(window as any).authorized=false);
  await page.getByRole('button',{name:'Locate in Kosmos',exact:true}).click();
  await expect(page.getByText('Note or scope changed. Select it again.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).located)).toEqual(['Alpha.md']);
});

test('local map renders readable neighbors and supports keyboard inspection',async({page})=>{
  await page.getByRole('button',{name:'Alpha',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Local map',exact:true})).toBeVisible();
  const map=page.locator('svg[aria-label="Selected note and readable neighbors"]');
  await expect(map.locator('circle')).toHaveCount(2);
  expect(await map.locator('circle').evaluateAll(nodes=>nodes.every(n=>['cx','cy','r'].every(key=>Number.isFinite(Number(n.getAttribute(key))))))).toBe(true);
  const neighbor=page.getByRole('button',{name:'Inspect Related Beta',exact:true});
  await neighbor.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Beta.md',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).calls.at(-1).path)).toBe('Beta.md');
});

test('narrow desktop pane switches navigation, note and inspector with keyboard return', async ({ page }, testInfo) => {
  await page.locator('#notes').evaluate(node => { (node as HTMLElement).style.width = '340px'; });
  const browse = page.getByRole('button', { name: 'Browse notes', exact: true });
  const inspect = page.getByRole('button', { name: 'Inspector', exact: true });
  await expect(browse).toBeVisible();
  await browse.click();
  await expect(page.getByRole('searchbox')).toBeFocused();
  await expect(page.getByRole('region', { name: 'Selected note', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alpha.md', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Selected note', exact: true })).toBeFocused();
  await expect(page.getByRole('searchbox')).toBeHidden();
  await inspect.click();
  await expect(page.getByRole('heading', { name: 'Local map', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Alpha.md', exact: true })).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(inspect).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Alpha.md', exact: true })).toBeVisible();
  await inspect.click();
  await page.getByRole('button', { name: 'Related Beta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Beta.md', exact: true })).toBeVisible();
  await expect(inspect).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.kosmos-notes-inspector')).toBeHidden();
  expect(await page.locator('#notes').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.locator('#notes').screenshot({ path: testInfo.outputPath('narrow-note.png') });
});

test('inspector collapses on desktop and loses stale content immediately on refresh', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  const inspect = page.getByRole('button', { name: 'Inspector', exact: true });
  await inspect.click();
  await expect(page.locator('.kosmos-notes-inspector')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Safe heading' })).toBeVisible();
  await inspect.click();
  await expect(page.getByRole('heading', { name: 'Local map', exact: true })).toBeVisible();
  await page.locator('#notes').screenshot({ path: testInfo.outputPath('desktop-inspector.png') });
  expect(await page.evaluate(() => {
    (window as any).workspace.refresh();
    return document.querySelector('.kosmos-notes-inspector')?.textContent;
  })).toBe('');
});
