import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent('<main id="notes"></main>');
  await page.addStyleTag({ path: resolve("styles.css") });
  await page.addScriptTag({ path: resolve("dist/kosmos-notes-workspace.js") });
  await page.evaluate(() => {
    const w = window as any;
    w.calls = []; w.authorized = true; w.opened = []; w.kosmos = 0; w.located = []; w.locatedUids = []; w.waits = {};
    const snapshot = (value: any) => ({ value, publish: async (apply: any, current: any) => {
      if (!w.authorized || !current()) return false;
      apply(value); return true;
    } });
    const host = {
      semanticSearch: async () => {
        if (w.deferSemantic) await new Promise(resolve => {w.waits.semantic=resolve;});
        return snapshot(w.semanticValue ?? null);
      },
      search: async (query: string, options: any) => {
        w.calls.push({ query, options });
        if (query === "slow") await new Promise(resolve => { w.waits.search = resolve; });
        if (query === "many") return snapshot({ results: Array.from({length:100}, (_,i)=>({title:`Note ${i}`,path:`Note${i}.md`})),total:100 });
        if (query === "paged") return { ...snapshot({ results: [{title:"First",path:"Alpha.md"}],total:2 }), offset:0,
          next:async()=>({...snapshot({results:[{title:"Second",path:"Beta.md"}],total:2}),offset:1,next:null}) };
        return snapshot({ results: [{ title: query || "Alpha", path: "Alpha.md", uid: w.searchUid, tags: w.searchTags }, { title: "Beta", path: "Beta.md" }], total: 2 });
      },
      read: async (path: string, options: any) => {
        if (options.uid && w.uidPath) path = w.uidPath;
        w.calls.push({ path, options });
        if (w.unreadable === path) return snapshot({ note: { error: "unavailable" }, projection: null });
        if (w.slowRead && path === "Alpha.md") await new Promise(resolve => { w.waits.read = resolve; });
        const content = options.offset ? "Second page" : '# Safe heading\n\n**Readable** ![alt](https://invalid.test/a.png) <img src="https://invalid.test/b.png"> [click](javascript:alert(1)) ![[Secret]]';
        return snapshot({ note: { title: path, path, uid: w.noteUid, sensitivity: "public", content, tags:["navigation-only"],
          continuation: { offset: options.offset || 0, next_offset: options.offset ? null : 100, revision: "revision-1", total_characters: 200, complete: !!options.offset } },
          related:w.related??{outgoing:[{title:"Related Beta",path:"Beta.md"}],backlinks:[],semantic:[]},
          assessment:w.assessment??null,diagnostics:w.diagnostics??null,lineage:w.lineage??null,
          projection: w.projection ?? { authored: ["authored only"], derived: ["derived only"], proposed: ["proposed only"], approved: ["approved only"], effective: ["effective only"] } });
      },
    };
    w.workspace = w.KosmosNotesWorkspace.mountNotesWorkspace(document.querySelector("#notes"), host,
      { openSource: (path: string) => w.opened.push(path), openKosmos: (path?: string, uid?: string) => { w.kosmos++; w.located.push(path); w.locatedUids.push(uid); } });
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
  await expect(page.locator(".kosmos-notes-inspector details")).toHaveCount(6);
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
  await page.getByRole('tab', { name: 'Links and lineage', exact: true }).click();
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
  await page.getByRole('tab', { name: 'Diagnostics and assessment', exact: true }).click();
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
  await page.getByRole('tab', { name: 'Links and lineage', exact: true }).click();
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
  await page.getByRole('tab', { name: 'Links and lineage', exact: true }).click();
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
  await page.getByRole('tab', { name: 'Links and lineage', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Local map', exact: true })).toBeVisible();
  await page.locator('#notes').screenshot({ path: testInfo.outputPath('desktop-inspector.png') });
  expect(await page.evaluate(() => {
    (window as any).workspace.refresh();
    return document.querySelector('.kosmos-notes-inspector')?.textContent;
  })).toBe('');
});


test('governance header uses effective origin and preserves an explicit false conformance claim', async ({ page }) => {
  await page.evaluate(() => { (window as any).projection = {
    authored: { epistemicState: 'authored fixture' }, proposed: { epistemicState: 'proposed fixture' },
    effective: { epistemicState: 'supported fixture', sensitivity: 'public' },
    source: { path: 'Alpha.md', version: '2.3', contentHash: '<untrusted-hash>' },
    profile: 'fixture-profile', mode: 'fixture-mode', conformanceClaim: false,
  }; });
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  const summary = page.getByRole('region', { name: 'Governance summary', exact: true });
  await expect(summary).toContainText('Effective epistemic state: supported fixture');
  await expect(summary).not.toContainText('proposed fixture');
  await expect(summary).not.toContainText('authored fixture');
  await page.getByText('Projection source', { exact: true }).click();
  await expect(page.locator('.kosmos-notes-inspector dd').filter({ hasText: /^false$/ })).toBeVisible();
  await expect(page.getByText('<untrusted-hash>', { exact: true })).toBeVisible();
  await page.evaluate(() => { (window as any).projection = { effective: {}, source: {} }; });
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  await expect(summary).toContainText('Effective epistemic state: Not recorded');
  await expect(summary).toContainText('Effective sensitivity: Not recorded');
});


test('readable lineage navigation uses checked reads and identifies the selected note', async ({ page }) => {
  await page.evaluate(() => { (window as any).lineage = { chain: [
    { title: 'Lineage Alpha', path: 'Alpha.md', current: true },
    { title: 'Lineage Beta', path: 'Beta.md', current: false },
  ] }; });
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  await page.getByRole('tab', { name: 'Links and lineage', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Readable lineage', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Lineage Alpha', exact: true }) })).toContainText('· Selected note');
  await page.getByRole('button', { name: 'Lineage Beta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Beta.md', exact: true })).toBeVisible();
  await page.evaluate(() => { (window as any).authorized = false; });
  await page.getByRole('button', { name: 'Lineage Alpha', exact: true }).click();
  await expect(page.getByText('Note or scope changed. Select it again.', { exact: true })).toBeVisible();
  await expect(page.locator('.kosmos-notes-inspector')).toBeEmpty();
});


test('explicit selection clear invalidates a pending read and retained inspector state', async ({ page }) => {
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  await page.evaluate(() => { (window as any).slowRead = true; });
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  await page.waitForFunction(() => !!(window as any).waits.read);
  await page.evaluate(() => { const w=window as any;w.workspace.select(null);w.waits.read(); });
  await expect(page.locator('.kosmos-notes-preview')).toBeEmpty();
  await expect(page.locator('.kosmos-notes-inspector')).toBeEmpty();
  expect(await page.evaluate(() => (window as any).workspace.getState().selectedPath)).toBeUndefined();
});

test('inspector tabs support keyboard selection and preserve the section across note changes', async ({ page }) => {
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  const metadata = page.getByRole('tab', { name: 'Metadata and provenance', exact: true });
  await expect(metadata).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await metadata.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Links and lineage', exact: true })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Local map', exact: true })).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Diagnostics and assessment', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Beta', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Diagnostics and assessment', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Diagnostics and assessment', exact: true }).focus();
  await page.keyboard.press('Home');
  await expect(metadata).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Diagnostics and assessment', exact: true })).toBeFocused();
});

test('evidence declarations preserve origin, zero, missing and invalid values without resolving targets', async ({ page }) => {
  await page.evaluate(() => { (window as any).projection = {
    authored: { evidence: { supports: [{ target: '<img src=x onerror=alert(1)>', source_uid: 'source:one', strength: 0, relevance: null }], contradicts: [] } },
    proposed: { evidence: { supports: [{ target: 'proposed-only', strength: false, relevance: 2 }] } },
    effective: { evidence: { supports: [], contradicts: [] } },
  }; });
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  await page.getByText('Authored', { exact: true }).click();
  const authored = page.getByRole('region', { name: 'authored evidence declarations', exact: true });
  await expect(authored).toContainText('<img src=x onerror=alert(1)>');
  await expect(authored).toContainText('source:one');
  await expect(authored.locator('dt').filter({ hasText: /^Strength$/ }).locator('+ dd')).toHaveText('0');
  await expect(authored.locator('dt').filter({ hasText: /^Relevance$/ }).locator('+ dd')).toHaveText('Not recorded');
  await expect(authored).toContainText('No declarations recorded');
  await expect(authored.locator('img, a, button')).toHaveCount(0);
  await page.getByText('Proposed', { exact: true }).click();
  const proposed = page.getByRole('region', { name: 'proposed evidence declarations', exact: true });
  await expect(proposed).toContainText('proposed-only');
  await expect(proposed.getByText('Invalid value; inspect source', { exact: true })).toHaveCount(2);
  await page.getByText('Effective', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'effective evidence declarations', exact: true })).not.toContainText('proposed-only');
  await page.evaluate(() => { (window as any).projection.authored.evidence.supports = Array.from({ length: 51 }, () => ({ target: 'bounded', strength: 1, relevance: 1 })); });
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  await page.getByText('Authored', { exact: true }).click();
  await expect(authored.getByRole('listitem')).toHaveCount(50);
  await expect(authored).toContainText('Showing 50 of 51 declarations');
});


test('identical evidence labels preserve distinct source provenance across origins', async ({ page }) => {
  await page.evaluate(() => { (window as any).projection = {
    authored: { evidence: { supports: [{target:'Shared label',source_uid:'source:authored'}] } },
    derived: { evidence: { supports: [{target:'Shared label',source_uid:'source:derived'}] } },
    proposed: { evidence: { supports: [{target:'Shared label'}] } },
    effective: { evidence: { supports: [] } },
  }; });
  await page.getByRole('button', {name:'Alpha',exact:true}).click();
  for (const [origin, uid] of [['authored','source:authored'],['derived','source:derived'],['proposed','Not recorded']]) {
    await page.getByText(origin[0].toUpperCase()+origin.slice(1),{exact:true}).click();
    const region=page.getByRole('region',{name:`${origin} evidence declarations`,exact:true});
    await expect(region.getByRole('listitem')).toHaveCount(1);
    await expect(region).toContainText('Shared label');
    await expect(region.locator('dt').filter({hasText:/^Source UID$/}).locator('+ dd')).toHaveText(uid);
    await expect(region.locator('a,button')).toHaveCount(0);
  }
  await page.getByText('Effective',{exact:true}).click();
  await expect(page.getByRole('region',{name:'effective evidence declarations',exact:true})).not.toContainText('Shared label');
});

test('lineage declaration inspection distinguishes unavailable, empty and scoped unresolved', async ({ page }) => {
  await page.evaluate(() => { (window as any).lineage = { chain: [], inspection: { available: false, declarations: [] } }; });
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  await page.getByRole('tab', { name: 'Links and lineage', exact: true }).click();
  const region = page.getByRole('region', { name: 'Lineage declarations', exact: true });
  await expect(region).toContainText('Declaration resolution unavailable');
  await page.evaluate(() => { (window as any).lineage.inspection = { available: true, declarations: [] }; });
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  await expect(region).toContainText('No canonical lineage declarations recorded');
  await page.evaluate(() => { (window as any).lineage.inspection.declarations = ['unresolved', 'ambiguous', 'self'].map((status, declarationIndex) => ({ field: 'supersedes', origin: 'authored', declarationIndex, sourceLine: 3, status })); });
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  await expect(region).toContainText('Declaration 1 \u00b7 Source line 3: Unresolved in readable scope');
  await expect(region).toContainText('Ambiguous in readable scope');
  await expect(region).toContainText('Self-reference');
  await expect(region).toContainText('Unresolved does not mean absent globally');
  await expect(region.locator('button, a')).toHaveCount(0);
});


test('saved stable UID restores the moved note and refreshes its canonical path', async ({ page }) => {
  const uid = '019b2d14-4230-7db7-87d4-7d81cfaec932';
  await page.evaluate(uid => { (window as any).noteUid = uid; }, uid);
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  const state = await page.evaluate(() => (window as any).workspace.getState());
  expect(state.selectedUid).toBe(uid);
  await page.evaluate(state => { const w = window as any; w.uidPath = 'Moved.md'; w.workspace.restore(state); }, state);
  await expect(page.getByRole('heading', { name: 'Moved.md', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).calls.at(-1))).toMatchObject({ options: { uid } });
  expect(await page.evaluate(() => (window as any).workspace.getState())).toMatchObject({ selectedPath: 'Moved.md', selectedUid: uid });
  await page.getByRole('button', { name: 'Open source in Obsidian', exact: true }).click();
  expect(await page.evaluate(() => (window as any).opened)).toEqual(['Moved.md']);
  await page.evaluate(() => (window as any).workspace.select(null));
  expect(await page.evaluate(() => (window as any).workspace.getState().selectedUid)).toBeUndefined();
});


test('mode handoff carries UID into Locate and destination Notes read', async ({ page }) => {
  const uid='019b2d14-4230-7db7-87d4-7d81cfaec932';
  await page.evaluate(uid=>{(window as any).noteUid=uid;},uid);
  await page.getByRole('button',{name:'Alpha',exact:true}).click();
  await page.getByRole('button',{name:'Locate in Kosmos',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).locatedUids)).toEqual([uid]);
  await page.evaluate(uid=>{const w=window as any;w.uidPath='Moved.md';return w.workspace.select('Alpha.md',uid);},uid);
  await expect(page.getByRole('heading',{name:'Moved.md',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).calls.at(-1))).toMatchObject({options:{uid}});
});


test('toolbar mode switch preserves selected identity and refuses stale scope', async ({ page }) => {
  const uid='019b2d14-4230-7db7-87d4-7d81cfaec932';
  await page.evaluate(uid=>{(window as any).noteUid=uid;},uid);
  await page.getByRole('button',{name:'Alpha',exact:true}).click();
  await page.getByRole('button',{name:'Kosmos',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).located)).toEqual(['Alpha.md']);
  expect(await page.evaluate(()=>(window as any).locatedUids)).toEqual([uid]);
  await page.evaluate(()=>{(window as any).authorized=false;});
  await page.getByRole('button',{name:'Kosmos',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Note or scope changed. Select it again.');
  expect(await page.evaluate(()=>(window as any).located)).toHaveLength(1);
  await page.evaluate(()=>{const w=window as any;w.authorized=true;w.slowRead=true;});
  await page.getByRole('button',{name:'Alpha',exact:true}).click();
  await page.waitForFunction(()=>!!(window as any).waits.read);
  await page.getByRole('button',{name:'Kosmos',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Wait for the selected note before switching views.');
  expect(await page.evaluate(()=>(window as any).located)).toHaveLength(1);
  await page.evaluate(()=>{const w=window as any;w.workspace.select(null);w.waits.read();});
  await page.getByRole('button',{name:'Kosmos',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).kosmos)).toBe(2);
});


test("search selection follows its captured stable identity after path reuse", async ({ page }) => {
  const uid = "550e8400-e29b-41d4-a716-446655440000";
  await page.evaluate(uid => {
    const w = window as any; w.searchUid = uid; w.noteUid = uid; w.workspace.refresh();
  }, uid);
  await expect(page.getByRole("button", { name: "Alpha", exact: true })).toBeVisible();
  await page.evaluate(() => { (window as any).uidPath = "Moved/Alpha.md"; });
  await page.getByRole("button", { name: "Alpha", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Moved/Alpha.md", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).calls.at(-1).options.uid)).toBe(uid);
});


test("search rows show source path and inert navigation tags", async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any; w.searchTags = ["training", "<img src=x onerror=alert(1)>"]; w.workspace.refresh();
  });
  const row = page.locator(".kosmos-notes-result").first();
  await expect(row.locator("small")).toContainText("Alpha.md");
  await expect(row.locator("small")).toContainText("#training");
  await expect(row.locator("small")).toContainText("<img src=x onerror=alert(1)>");
  await expect(row.locator("img")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Alpha", exact: true })).toHaveAccessibleDescription(/Alpha.md/);
});


test("virtual rows stay bounded and support keyboard traversal and revocation", async ({ page }) => {
  await page.getByRole("searchbox").fill("many");
  await expect(page.getByRole("button", {name:"Note 0",exact:true})).toBeVisible();
  expect(await page.locator(".kosmos-notes-result").count()).toBeLessThan(15);
  await page.getByRole("button", {name:"Note 0",exact:true}).focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("button", {name:"Note 99",exact:true})).toBeFocused();
  expect(await page.locator(".kosmos-notes-result").count()).toBeLessThan(15);
  await page.keyboard.press("Home");
  await expect(page.getByRole("button", {name:"Note 0",exact:true})).toBeFocused();
  await page.evaluate(() => {
    (window as any).authorized=false;
    document.querySelector(".kosmos-notes-viewport")!.scrollTop=2000;
  });
  await expect(page.locator(".kosmos-notes-result")).toHaveCount(0);
});


test("virtual rows retain document order and update the mouse-selected tab stop", async ({ page }) => {
  await page.getByRole("searchbox").fill("many");
  const viewport = page.locator(".kosmos-notes-viewport");
  await expect(page.getByRole("button", {name:"Note 0",exact:true})).toBeVisible();
  await viewport.evaluate(element => { element.scrollTop = 5000; });
  await expect(page.getByRole("button", {name:"Note 46",exact:true})).toBeVisible();
  await viewport.evaluate(element => { element.scrollTop = 4500; });
  await expect(page.getByRole("button", {name:"Note 41",exact:true})).toBeVisible();
  const order = await viewport.locator('[role="listitem"]').evaluateAll(rows => rows.map(row => Number(row.getAttribute("aria-posinset"))));
  expect(order).toEqual([...order].sort((a,b)=>a-b));
  await page.getByRole("button", {name:"Note 41",exact:true}).click();
  await expect(page.getByRole("button", {name:"Note 41",exact:true})).toHaveAttribute("tabindex", "0");
  await expect(viewport.locator('button[tabindex="0"]')).toHaveCount(1);
});

test('semantic facts remain unverified plain text with unresolved references',async({page})=>{
  await page.evaluate(()=>{(window as any).semanticValue={hits:[{fact:'<img src=x onerror=alert(1)> Synthetic fact',semantic_support:'unverified',citations:[{source_id:'source:fixture'}]}]};});
  await page.getByRole('searchbox',{name:'Search readable notes'}).fill('relay');
  await expect(page.getByRole('button',{name:'relay',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Search related facts',exact:true}).click();
  const facts=page.getByRole('region',{name:'Related facts'});
  await expect(facts).toContainText('Related facts · Unverified');
  await expect(facts).toContainText('<img src=x onerror=alert(1)> Synthetic fact');
  await expect(facts.locator('img,a')).toHaveCount(0);
  await expect(facts).toContainText('Source references are not resolved here.');
  await expect(page.getByRole('button',{name:'relay',exact:true})).toBeVisible();
});

test('semantic outage keeps native matches and changed query discards late facts',async({page})=>{
  await page.getByRole('searchbox',{name:'Search readable notes'}).fill('relay');
  await expect(page.getByRole('button',{name:'relay',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Search related facts',exact:true}).click();
  await expect(page.getByRole('region',{name:'Related facts'})).toContainText('Readable note search remains available.');
  await page.evaluate(()=>{const w=window as any;w.deferSemantic=true;w.semanticValue={hits:[{fact:'STALE_SEMANTIC_FACT',citations:[]}]};});
  await page.getByRole('button',{name:'Search related facts',exact:true}).click();
  await page.waitForFunction(()=>!!(window as any).waits.semantic);
  await page.getByRole('searchbox',{name:'Search readable notes'}).fill('new query');
  await page.evaluate(()=>(window as any).waits.semantic());
  await expect(page.getByText('STALE_SEMANTIC_FACT')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'new query',exact:true})).toBeVisible();
});
