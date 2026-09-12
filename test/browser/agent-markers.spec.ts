import {test,expect} from '@playwright/test';

async function boot(page: any) {
  await page.goto('/dist/kosmos-embed.html?capture=1&seed=1907&time=0&animation=off');
  await page.evaluate(()=>window.postMessage({protocol:'kosmos-oden',version:1,type:'vault-snapshot',payload:{files:[{relativePath:'A/one.md',content:'# One'},{relativePath:'A/two.md',content:'# Two'}],folders:['A'],attachments:[],label:'Marker fixture'}},'*'));
  await page.waitForFunction(()=>(window as any).__kosmos?.ok===true);
  await expect(page.locator('#boot')).toHaveClass(/gone/);
  await expect(page.locator('#boot')).toHaveCSS('opacity','0');
}
async function visit(page:any,id:string,label:string,path:string){
  await page.evaluate(({id,label,path}:any)=>window.postMessage({protocol:'kosmos-oden',version:1,type:'agent-traversal',payload:{paths:[path],tool:'get_note',agent:label,agentId:id}},'*'),{id,label,path});
}

test('agent identity remains readable when ordinary note labels are disabled',async({page},testInfo)=>{
  await boot(page);
  await page.evaluate(()=>document.getElementById('labelsBtn')?.click());
  await visit(page,'agent:a','Carson','A/one.md');
  const marker=page.locator('.agent-marker').filter({hasText:'Carson'});
  await expect(marker).toHaveCount(1);
  await expect(marker.locator('.agent-name')).toBeVisible();
  await expect(marker).toContainText('Last visited: one');
  await expect(marker.locator('svg')).toBeVisible();
  await expect(marker).toHaveCSS('opacity','1');
  const box=await marker.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  await page.screenshot({path:testInfo.outputPath('agent-marker.png')});
});

test('agents sharing a note keep separate identity and last-visited markers',async({page})=>{
  await boot(page);
  await visit(page,'agent:a','Shared label','A/one.md');
  await visit(page,'agent:b','Shared label','A/one.md');
  const markers=page.locator('.agent-marker[data-location="A/one.md"]');
  await expect(markers).toHaveCount(2);
  await expect(markers.nth(0)).toBeVisible();
  await expect(markers.nth(1)).toBeVisible();
  const a=await markers.nth(0).boundingBox(),b=await markers.nth(1).boundingBox();
  expect(Math.abs(a!.y-b!.y)).toBeGreaterThanOrEqual(30);
  await page.evaluate(()=>{const now=performance.now.bind(performance);performance.now=()=>now()+61000;});
  await expect(markers.nth(0)).toHaveAttribute('data-state','idle');
  await expect(markers.nth(1)).toBeVisible();
  await page.evaluate(()=>(window as any).__kosmos.clearTraversalObservability());
  await expect(page.locator('.agent-marker[data-location]')).toHaveCount(0);
});
