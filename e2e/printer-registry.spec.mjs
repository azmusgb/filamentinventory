import { test, expect } from '@playwright/test';

const baseState = {
  version:10,
  profile:'Bill',
  savedAt:'2026-08-29T00:00:00.000Z',
  meta:{},
  printers:[],
  spools:[{
    id:'T001',owner:'Bill',brand:'Inland',material:'PLA+',colorName:'White',colorHex:'#f5f5f4',spoolType:'Cardboard',
    startWeight:1000,visualPercent:70,gross:null,tare:null,location:'Shelf',confidence:'Confirmed',opened:'Yes',bagged:'No',
    reorderThreshold:250,placementState:'Stored',printerId:'',printerName:'',feederId:'',feederName:'',feederSlot:'',createdAt:'2026-08-29T00:00:00.000Z',updatedAt:'2026-08-29T00:00:00.000Z',archivedAt:null,
  }],
  weighLog:[],auditLog:[],printJobs:[],tombstones:{},
};

async function seed(page) {
  await page.addInitScript(state => {
    localStorage.clear();
    localStorage.setItem('filament-current-user-v1','Bill');
    localStorage.setItem('filament-user-isolation-v1',JSON.stringify({at:'2026-08-29T00:00:00.000Z',schemaVersion:10,cloudIsolation:'profile-scoped'}));
    localStorage.setItem('filament-user-v1:bill:inventory',JSON.stringify(state));
    localStorage.setItem('filament-user-v1:aimee:inventory',JSON.stringify({...state,profile:'Aimee',spools:[],printers:[]}));
  },baseState);
}

test('mobile user can add a printer, configure AMS and manage a true four-slot board', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit','Printer setup is exercised in the iPhone/WebKit contract.');
  await seed(page);
  await page.goto('/');
  await page.locator('.mobile-bottom-nav [data-bottom-view="household"]').click();
  await expect(page.locator('#householdView')).toHaveClass(/active/);
  await expect(page.locator('#printerRegistry')).toContainText('No printers configured yet');

  await page.locator('[data-printer-add]:visible').first().click();
  const config = page.locator('.printer-config-dialog[open]');
  await expect(config).toBeVisible();
  await config.locator('#printerConfigName').fill('P1S');
  await config.locator('#printerConfigManufacturer').fill('Bambu Lab');
  await config.locator('#printerConfigModel').fill('P1S');
  await config.locator('#printerConfigLocation').fill('Print room');
  await config.locator('#printerConfigNozzleSize').fill('0.4 mm');
  await config.locator('#printerConfigNozzleMaterial').fill('Hardened steel');
  await config.locator('#printerConfigBuildPlate').fill('Textured PEI');
  await config.locator('button[type="submit"]').click();

  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryAMSUI))).toBe(true);
  const registry = page.locator('#printerRegistry .printer-registry-card');
  await expect(registry).toHaveCount(1);
  await expect(registry).toContainText('P1S');
  await expect(registry).toContainText('Bambu Lab');
  await expect(registry).toContainText('0.4 mm');
  await expect(registry).toContainText('1 feeder · 4 slots');

  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('filament-user-v1:bill:inventory') || '{}'));
  expect(stored.printers).toHaveLength(1);
  expect(stored.printers[0].feeders[0].name).toBe('AMS 1');
  expect(stored.printers[0].feeders[0].slotCount).toBe(4);

  await registry.locator('[data-printer-load-target]').click();
  const load = page.locator('.printer-load-dialog[open]');
  await expect(load).toBeVisible();
  await load.locator('#moveSpoolV8').selectOption('T001');
  await expect(load.locator('#movePrinterV8')).toHaveValue('P1S');
  await load.locator('#moveFeederV8').selectOption('AMS 1');
  await load.locator('#moveSlotV8').selectOption('1');
  await load.locator('[data-printer-load-save]').click();

  const feeder = page.locator('#printerBoard .ams-feeder').first();
  await expect(feeder).toContainText('AMS 1');
  await expect(feeder).toContainText('1 of 4 loaded');
  await expect(feeder.locator('.ams-slot')).toHaveCount(4);
  await expect(feeder.locator('.ams-slot-empty')).toHaveCount(3);
  await expect(feeder.locator('.ams-slot[data-ams-slot="1"]')).toContainText('T001 · White');
  await expect(feeder.locator('.ams-slot[data-ams-slot="1"]')).toContainText('700 g · 70%');
  await expect(feeder.locator('.ams-slot[data-ams-slot="1"]')).toContainText('Visual estimate');

  const menu = feeder.locator('.ams-slot[data-ams-slot="1"] .ams-slot-actions');
  await menu.locator('summary').click();
  await expect(menu).toContainText('Weigh');
  await expect(menu).toContainText('Move');
  await expect(menu).toContainText('Unload');
  await expect(menu).toContainText('Open spool');

  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('filament-user-v1:bill:inventory') || '{}'));
  const spool = stored.spools.find(row => row.id === 'T001');
  expect(spool.printerName).toBe('P1S');
  expect(spool.printerId).toBe(stored.printers[0].id);
  expect(spool.feederName).toBe('AMS 1');
  expect(spool.feederId).toBe(stored.printers[0].feeders[0].id);
  expect(spool.feederSlot).toBe('1');

  await page.evaluate(() => {
    const value=JSON.parse(localStorage.getItem('filament-inventory-v1')||'{}');
    const row=value.spools.find(spool=>spool.id==='T001');
    row.visualPercent=null;
    row.gross=null;
    row.tare=null;
    row.estimatedRemainingGrams=null;
    row.updatedAt=new Date().toISOString();
    localStorage.setItem('filament-inventory-v1',JSON.stringify(value));
  });
  await expect(page.locator('.ams-inline-attention')).toBeVisible();
  await expect(page.locator('.ams-inline-attention')).toContainText('T001 needs weighing');
  await expect(page.locator('#printerAttention').locator('..')).toBeHidden();
  await expect(feeder.locator('.ams-slot[data-ams-slot="1"]')).toContainText('Not measured');
  await expect(feeder.locator('.ams-slot[data-ams-slot="1"]')).toContainText('Weigh required');
});
