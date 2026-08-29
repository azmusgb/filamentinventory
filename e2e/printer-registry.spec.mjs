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

test('mobile user can add a printer, configure AMS and load a spool into a slot', async ({ page }, testInfo) => {
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

  await expect(page.locator('#printerBoard')).toContainText('T001');
  await expect(page.locator('#printerBoard')).toContainText('AMS 1 · Slot 1');
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('filament-user-v1:bill:inventory') || '{}'));
  const spool = stored.spools.find(row => row.id === 'T001');
  expect(spool.printerName).toBe('P1S');
  expect(spool.printerId).toBe(stored.printers[0].id);
  expect(spool.feederName).toBe('AMS 1');
  expect(spool.feederId).toBe(stored.printers[0].feeders[0].id);
  expect(spool.feederSlot).toBe('1');
});
