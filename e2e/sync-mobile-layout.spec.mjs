import { test, expect } from '@playwright/test';

async function boot(page){
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('filament-current-user-v1','Bill');
    localStorage.setItem('filament-user-isolation-v1',JSON.stringify({at:'2026-09-06T09:30:00.000Z',schemaVersion:10,cloudIsolation:'profile-scoped'}));
  });
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>Boolean(globalThis.FilamentInventoryNavigation&&document.documentElement.classList.contains('fi-v11')))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>Boolean(document.querySelector('link[href="/css/components/v11-workflows.css"]')?.sheet))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>Boolean(document.getElementById('syncView')))).toBe(true);
  expect(await page.evaluate(()=>globalThis.FilamentInventoryNavigation.navigate('sync',{historyMode:'replace',focus:false}))).toBe(true);
  await expect(page.locator('#syncView')).toBeVisible();
}

test('native V11 loads workflow styles and keeps Sync status copy on separate readable lines',async({page})=>{
  await boot(page);
  await expect(page.locator('link[href="/css/components/v11-workflows.css"]')).toHaveCount(1);
  await expect(page.locator('#syncLoginForm')).toBeVisible();

  const status=await page.evaluate(()=>{
    const title=document.getElementById('syncStatusTitle');
    const detail=document.getElementById('syncStatusDetail');
    const titleBox=title.getBoundingClientRect();
    const detailBox=detail.getBoundingClientRect();
    return {
      titleDisplay:getComputedStyle(title).display,
      detailDisplay:getComputedStyle(detail).display,
      titleBottom:titleBox.bottom,
      detailTop:detailBox.top,
      titleWidth:titleBox.width,
      detailWidth:detailBox.width,
    };
  });
  expect(status.titleDisplay).toBe('block');
  expect(status.detailDisplay).toBe('block');
  expect(status.detailTop).toBeGreaterThanOrEqual(status.titleBottom);
  expect(status.titleWidth).toBeGreaterThan(200);
  expect(status.detailWidth).toBeGreaterThan(200);
});

test('mobile Sync setup actions stack as full-width touch targets',async({page})=>{
  await boot(page);
  const geometry=await page.evaluate(()=>{
    const actions=document.querySelector('.sync-actions');
    const buttons=[...actions.querySelectorAll('.btn')];
    const container=actions.getBoundingClientRect();
    const boxes=buttons.map(button=>button.getBoundingClientRect());
    return {
      containerWidth:container.width,
      buttons:boxes.map(box=>({width:box.width,top:box.top,bottom:box.bottom,height:box.height})),
    };
  });
  expect(geometry.buttons.length).toBe(2);
  for(const button of geometry.buttons){
    expect(button.width).toBeGreaterThanOrEqual(geometry.containerWidth*0.95);
    expect(button.height).toBeGreaterThanOrEqual(44);
  }
  expect(geometry.buttons[1].top).toBeGreaterThanOrEqual(geometry.buttons[0].bottom);
});

test('advanced Sync summary keeps its title and subtitle visually separated on iPhone width',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    const summary=document.querySelector('.sync-advanced summary');
    const title=summary.querySelector('strong');
    const detail=summary.querySelector('small');
    const titleBox=title.getBoundingClientRect();
    const detailBox=detail.getBoundingClientRect();
    return {
      titleDisplay:getComputedStyle(title).display,
      detailDisplay:getComputedStyle(detail).display,
      titleBottom:titleBox.bottom,
      detailTop:detailBox.top,
      summaryWidth:summary.getBoundingClientRect().width,
      detailWidth:detailBox.width,
    };
  });
  expect(result.titleDisplay).toBe('block');
  expect(result.detailDisplay).toBe('block');
  expect(result.detailTop).toBeGreaterThanOrEqual(result.titleBottom);
  expect(result.detailWidth).toBeGreaterThan(220);
  expect(result.summaryWidth).toBeGreaterThan(300);
});
