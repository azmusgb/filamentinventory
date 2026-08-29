import { test, expect } from '@playwright/test';

const printer = {
  id:'printer-x2d', owner:'Bill', name:'X2D', manufacturer:'', model:'X2D', location:'', nozzleSize:'', nozzleMaterial:'', buildPlate:'',
  feeders:[{id:'feeder-ams-1',name:'AMS 1',type:'AMS',slotCount:4}], legacyInferred:false,
  createdAt:'2026-08-28T12:00:00.000Z', updatedAt:'2026-08-28T12:00:00.000Z', archivedAt:null,
};

const spool = (id, colorName, colorHex, slot, overrides = {}) => ({
  id, owner:'Bill', brand:'Inland', material:'PLA+', colorName, colorHex, spoolType:'Cardboard', startWeight:1000,
  visualPercent:null, gross:null, tare:null, location:'AMS 1', confidence:'Confirmed', reorderThreshold:250,
  placementState:'Loaded', printerId:'printer-x2d', printerName:'X2D', feederId:'feeder-ams-1', feederName:'AMS 1', feederSlot:String(slot),
  loadedAt:'2026-08-28T12:00:00.000Z', createdAt:'2026-08-01T12:00:00.000Z', updatedAt:'2026-08-28T12:00:00.000Z', archivedAt:null,
  ...overrides,
});

const state = {
  version:10, appVersion:'10.2.0', profile:'Bill', savedAt:'2026-08-28T15:00:00.000Z', meta:{lastBackupAt:null},
  printers:[printer],
  spools:[
    spool('C01','Purple','#6f3ba5',1,{visualPercent:65}),
    spool('F02','Light Blue','#8fd3ff',2,{material:'Unknown'}),
    spool('C03','Black','#111827',3,{visualPercent:50}),
  ],
  weighLog:[], auditLog:[], printJobs:[], tombstones:{},
};

async function boot(page) {
  await page.addInitScript(data => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('filament-current-user-v1','Bill');
    localStorage.setItem('filament-user-isolation-v1',JSON.stringify({at:'2026-08-28T15:00:00.000Z',schemaVersion:10,cloudIsolation:'profile-scoped'}));
    localStorage.setItem('filament-user-v1:bill:inventory',JSON.stringify(data));
    localStorage.setItem('filament-user-v1:bill:sync-settings',JSON.stringify({enabled:false,lastRevision:'',lastSyncedAt:null}));
  }, state);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryNavigation))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryAMSBoard))).toBe(true);
  await page.evaluate(() => globalThis.FilamentInventoryNavigation.navigate('household',{historyMode:'replace',focus:false}));
  await expect(page.locator('#householdView')).toHaveClass(/active/);
  await expect(page.locator('.ams-printer-board')).toBeVisible();
}

test.beforeEach(async ({page}) => boot(page));

test('renders configured AMS as four physical slots with an actionable exception', async ({page}) => {
  const feeder = page.locator('.ams-feeder[data-feeder-id="feeder-ams-1"]');
  await expect(feeder).toHaveCount(1);
  await expect(feeder.locator('.ams-slot-card')).toHaveCount(4);
  await expect(feeder.locator('.ams-slot-empty')).toHaveCount(1);
  await expect(feeder).toContainText('3 / 4 loaded');
  await expect(feeder).toContainText('C01 · Purple');
  await expect(feeder).toContainText('650 g · 65%');
  await expect(feeder).toContainText('Visual estimate');
  await expect(feeder).toContainText('F02 · Light Blue');
  await expect(feeder).toContainText('Not measured');
  await expect(feeder).toContainText('Weigh required');
  await expect(page.locator('.ams-attention-banner')).toContainText('F02 needs weighing');
  await expect(page.locator('.ams-legacy-attention-panel')).toBeHidden();
  await expect(page.locator('.printer-slot-actions')).toHaveCount(0);
});

test('empty AMS slot opens placement dialog preselected to that physical slot', async ({page}) => {
  await page.locator('.ams-slot-empty[data-slot="4"]').click();
  await expect(page.locator('.printer-load-dialog[open]')).toBeVisible();
  await expect(page.locator('#movePrinterV8')).toHaveValue('X2D');
  await expect(page.locator('#moveFeederV8')).toHaveValue('AMS 1');
  await expect(page.locator('#moveSlotV8')).toHaveValue('4');
});

test('slot overflow opens the authoritative physical spool sheet', async ({page}) => {
  await page.getByRole('button',{name:'Open C01 actions'}).click();
  await expect(page.locator('#spoolActionDialog[open]')).toBeVisible();
  await expect(page.locator('#spoolActionTitle')).toContainText('C01');
});
