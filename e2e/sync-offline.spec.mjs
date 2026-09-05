import { test, expect } from '@playwright/test';

const FIXED_TIME = Date.parse('2026-09-05T16:30:00.000Z');
const PRIVATE_KEY = 'offlineReconnectSmokeKey_0123456789abcdef';

const spool = {
  id:'NET1', owner:'Bill', brand:'Bambu Lab', material:'PLA', colorName:'Matte White', colorHex:'#f4f2ec',
  spoolType:'Plastic', startWeight:1000, visualPercent:75, gross:null, tare:null, location:'Rack A', confidence:'Confirmed',
  opened:'Yes', bagged:'No', purchaseSource:'', purchasePrice:null, purchaseDate:'', reorderThreshold:250,
  lastDriedDate:'', notes:'Offline reconnect browser-test spool.', createdAt:'2026-09-01T12:00:00.000Z',
  updatedAt:'2026-09-04T12:00:00.000Z', archivedAt:null,
};

const billState = {
  version:10, appVersion:'10.2.0', profile:'Bill', savedAt:'2026-09-05T16:30:00.000Z',
  meta:{lastBackupAt:null}, spools:[spool], printers:[], weighLog:[], auditLog:[], printJobs:[], tombstones:{},
};

async function seed(page) {
  await page.addInitScript(data => {
    const RealDate = globalThis.Date;
    class FixedDate extends RealDate {
      constructor(...args){ super(...(args.length ? args : [data.fixedTime])); }
      static now(){ return data.fixedTime; }
    }
    globalThis.Date = FixedDate;
    if (sessionStorage.getItem('fi-offline-smoke-seeded') === '1') return;
    localStorage.clear();
    localStorage.setItem('filament-current-user-v1','Bill');
    localStorage.setItem('filament-user-isolation-v1',JSON.stringify({at:'2026-09-05T16:30:00.000Z',schemaVersion:10,cloudIsolation:'profile-scoped'}));
    localStorage.setItem('filament-user-v1:bill:inventory',JSON.stringify(data.billState));
    localStorage.setItem('filament-user-v1:bill:sync-key',data.privateKey);
    localStorage.setItem('filament-user-v1:bill:sync-settings',JSON.stringify({
      enabled:true, auto:true, lastRevision:'r1', lastSyncedAt:'2026-09-05T16:00:00.000Z', deviceName:'Browser smoke',
    }));
    sessionStorage.setItem('fi-offline-smoke-seeded','1');
  }, {fixedTime:FIXED_TIME, privateKey:PRIVATE_KEY, billState});
}

async function navigate(page, view) {
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryNavigation))).toBe(true);
  expect(await page.evaluate(target => globalThis.FilamentInventoryNavigation.navigate(target,{historyMode:'push',focus:false}), view)).toBe(true);
  const surface = page.locator(`#${view}View`);
  await expect(surface).toBeVisible();
  await expect(surface).toHaveAttribute('aria-hidden','false');
}

test('offline keeps local inventory editable and reconnect resumes private sync', async ({page,context}) => {
  const posts = [];
  await page.route('**/api/sync*', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      posts.push(body);
      await route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify({
          state:body.state,
          meta:{revision:`r${posts.length + 1}`,updatedAt:'2026-09-05T16:30:00.000Z',devices:[],activity:[]},
          merge:{concurrent:false,conflictedSpools:0},
        }),
      });
      return;
    }
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({meta:{revision:'r1',updatedAt:'2026-09-05T16:00:00.000Z',devices:[],activity:[]}}),
    });
  });

  await seed(page);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventorySync?.connected?.()))).toBe(true);
  await navigate(page,'sync');
  await expect(page.locator('#syncStatusTitle')).toHaveText('Devices are connected');
  await expect(page.locator('#syncNowBtn')).toBeEnabled();

  await context.setOffline(true);
  await expect(page.locator('#syncStatusBox')).toHaveAttribute('data-state','offline');
  await expect(page.locator('#syncStatusTitle')).toHaveText('Offline');
  await expect(page.locator('#syncStatusDetail')).toContainText('Local inventory is still available');
  await expect(page.locator('#syncNowBtn')).toBeDisabled();
  await expect(page.locator('#loadSnapshotsBtn')).toBeDisabled();

  const postsBeforeOfflineEdit = posts.length;
  await navigate(page,'inventory');
  await expect(page.locator('#inventoryGrid .spool-card')).toHaveCount(1);
  await page.locator('#inventoryAddBtn').click();
  await expect(page.locator('#spoolDialog[open]')).toBeVisible();
  await page.locator('#spoolId').fill('OFF1');
  await page.locator('#brand').fill('Offline Test');
  await page.locator('#material').fill('PETG');
  await page.locator('#colorName').fill('Reconnect Orange');
  await page.locator('#location').fill('Offline Rack');
  await page.getByRole('button',{name:'Save spool'}).click();
  await expect(page.locator('#spoolDialog')).not.toHaveAttribute('open','');
  await expect.poll(() => page.evaluate(() => {
    const state=JSON.parse(localStorage.getItem('filament-inventory-v1')||'{}');
    return (state.spools||[]).some(row => row.id === 'OFF1');
  })).toBe(true);
  await expect(page.locator('#inventoryGrid .spool-card')).toHaveCount(2);

  // Give the normal debounce window time to elapse. Offline edits must not attempt a cloud POST.
  await page.waitForTimeout(1700);
  expect(posts.length).toBe(postsBeforeOfflineEdit);
  await navigate(page,'sync');
  await expect(page.locator('#syncStatusTitle')).toHaveText('Offline');

  await context.setOffline(false);
  await expect.poll(() => posts.slice(postsBeforeOfflineEdit).some(body =>
    (body?.state?.spools||[]).some(row => row.id === 'OFF1')
  ), {timeout:6000}).toBe(true);
  await expect(page.locator('#syncStatusTitle')).toHaveText('Devices are connected');
  await expect(page.locator('#syncNowBtn')).toBeEnabled();
  await expect(page.locator('#lastSyncText')).toContainText('Last successful sync');
  await expect.poll(() => page.evaluate(() => {
    const state=JSON.parse(localStorage.getItem('filament-inventory-v1')||'{}');
    return (state.spools||[]).some(row => row.id === 'OFF1');
  })).toBe(true);
});
