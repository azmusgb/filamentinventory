import { test, expect } from '@playwright/test';

const state = {
  version:10,
  appVersion:'10.2.0',
  profile:'Bill',
  savedAt:'2026-08-28T18:40:00.000Z',
  meta:{lastBackupAt:null},
  spools:[{
    id:'Q001',owner:'Bill',brand:'Bambu Lab',productLine:'Basic',material:'PLA',colorName:'Black',colorHex:'#171a22',
    spoolType:'Plastic',startWeight:1000,visualPercent:80,gross:850,tare:200,location:'AMS',confidence:'Confirmed',opened:'Yes',bagged:'No',
    reorderThreshold:250,placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'1',loadedAt:'2026-08-28T18:00:00.000Z',
    createdAt:'2026-08-01T12:00:00.000Z',updatedAt:'2026-08-28T18:00:00.000Z',archivedAt:null,
  }],
  weighLog:[],auditLog:[],printJobs:[],tombstones:{},
};

test.beforeEach(async ({page}) => {
  await page.addInitScript(value => {
    localStorage.clear();
    localStorage.setItem('filament-current-user-v1','Bill');
    localStorage.setItem('filament-user-isolation-v1',JSON.stringify({at:'2026-08-28T18:40:00.000Z',schemaVersion:10,cloudIsolation:'profile-scoped'}));
    localStorage.setItem('filament-user-v1:bill:inventory',JSON.stringify(value));
    localStorage.setItem('filament-user-v1:bill:sync-settings',JSON.stringify({enabled:false,lastRevision:'',lastSyncedAt:null}));
  },state);
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/fi-v11/);
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryPrintReadinessUI))).toBe(true);
});

test('queued jobs reserve grams, surface on Home and release the commitment when cancelled', async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium','Reservation workflow is exercised once in Chromium.');

  await page.locator('.fi-desktop-sidebar [data-shell-action="print"]').click();
  await expect(page.locator('#printReadinessDialog[open]')).toBeVisible();
  await page.locator('#printJobName').fill('Reserved bracket');
  await page.locator('#printMaterial').fill('PLA');
  await page.locator('#printColor').fill('Black');
  await page.locator('#printGrams').fill('300');
  await page.locator('.print-job-options > summary').click();
  await page.locator('#printMargin').fill('0');
  await page.getByRole('button',{name:'Check inventory'}).click();
  await expect(page.locator('#printReadinessResult')).toContainText('Enough verified filament');
  await page.getByRole('button',{name:'Plan with this spool'}).click();
  await expect(page.locator('#printJobPanel')).toContainText('300 g reserved');

  await page.locator('.print-job-footer [data-readiness-close]').click();
  const queue = page.locator('[data-print-queue-surface="home"]');
  await expect(queue).toBeVisible();
  await expect(queue).toContainText('1 planned');
  await expect(queue).toContainText('300 g committed');
  await expect(queue).toContainText('Q001');

  await queue.locator('[data-print-readiness]').click();
  await page.locator('#printJobName').fill('Overcommitted part');
  await page.locator('#printGrams').fill('400');
  await page.getByRole('button',{name:'Check inventory'}).click();
  await expect(page.locator('#printReadinessResult')).toContainText('Queued jobs already reserve this filament');
  await expect(page.locator('#printReadinessResult')).toContainText('350 g');
  await expect(page.locator('#printReadinessResult [data-print-plan]')).toHaveCount(0);

  await page.locator('#printJobPanel [data-print-cancel]').click();
  await expect(page.locator('[data-print-queue-surface="home"]')).toHaveCount(0);
  await expect(page.locator('#printReadinessResult')).toContainText('Enough verified filament');
  await expect(page.locator('#printReadinessResult [data-print-plan]')).toHaveCount(1);
});
