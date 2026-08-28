import { test, expect } from '@playwright/test';

const isolationMarker = JSON.stringify({
  at:'2026-08-28T23:55:00.000Z',
  schemaVersion:10,
  cloudIsolation:'profile-scoped',
});

async function seedMissingBillPartition(page, {syncKey=''} = {}) {
  await page.addInitScript(({marker,key}) => {
    localStorage.clear();
    localStorage.setItem('filament-current-user-v1','Bill');
    localStorage.setItem('filament-user-isolation-v1',marker);
    localStorage.setItem('filament-user-v1:aimee:inventory',JSON.stringify({
      version:10,
      profile:'Aimee',
      savedAt:'2026-08-28T23:55:00.000Z',
      meta:{},
      spools:[],
      weighLog:[],
      auditLog:[],
      printJobs:[],
      tombstones:{},
    }));
    if (key) localStorage.setItem('filament-user-v1:bill:sync-key',key);
  }, {marker:isolationMarker,key:syncKey});
}

test('missing Bill partition materializes the same starter inventory the UI renders', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit','Regression reproduces the iPhone split-brain report.');
  await seedMissingBillPartition(page);
  await page.goto('/');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('filament-user-v1:bill:inventory') || 'null'));
  expect(stored).not.toBeNull();
  expect(stored.profile).toBe('Bill');
  expect(stored.meta?.starterInventory).toBe(true);
  expect(stored.spools.some(spool => spool.id === 'C01')).toBe(true);

  await page.locator('.mobile-bottom-nav [data-bottom-view="inventory"]').click();
  await expect(page.locator('#inventoryView')).toHaveClass(/active/);
  const c01 = page.locator('#inventoryGrid .spool-card[data-id="C01"]');
  await expect(c01).toBeVisible();
  await c01.locator('[data-spool-actions-open="C01"]').click();
  await expect(page.locator('#spoolActionDialog[open]')).toBeVisible();
  await expect(page.locator('#spoolActionDialog')).toContainText('C01 · Purple');
  await expect(page.locator('#toast')).not.toContainText("C01 is not in Bill's inventory");
});

test('a missing cloud-linked Bill partition bootstraps empty instead of injecting starter rows', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium','Cloud bootstrap guard only needs one browser engine.');
  await seedMissingBillPartition(page,{syncKey:'linked-profile-key'});
  await page.goto('/');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('filament-user-v1:bill:inventory') || 'null'));
  expect(stored).not.toBeNull();
  expect(stored.profile).toBe('Bill');
  expect(stored.spools).toEqual([]);
  expect(stored.meta?.awaitingCloudBootstrap).toBe(true);
});
