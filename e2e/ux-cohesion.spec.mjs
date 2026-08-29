import { test, expect } from '@playwright/test';

const inventory = {
  version: 10,
  appVersion: '10.2.0',
  profile: 'Bill',
  savedAt: '2026-08-28T15:00:00.000Z',
  meta: {lastBackupAt:null},
  printers: [],
  weighLog: [],
  auditLog: [],
  printJobs: [],
  tombstones: {},
  spools: [
    {
      id:'C001',owner:'Bill',brand:'Bambu Lab',material:'PLA',colorName:'Black',colorHex:'#171a22',
      spoolType:'Plastic',startWeight:1000,visualPercent:70,gross:null,tare:null,location:'Rack A',
      confidence:'Confirmed',opened:'Yes',bagged:'No',purchaseSource:'',purchasePrice:null,purchaseDate:'',
      reorderThreshold:250,lastDriedDate:'',notes:'Cohesion test spool',placementState:'Stored',printerName:'',feederName:'',feederSlot:'',
      createdAt:'2026-08-01T12:00:00.000Z',updatedAt:'2026-08-20T12:00:00.000Z',archivedAt:null,
    },
    {
      id:'C002',owner:'Bill',brand:'Polymaker',material:'PETG',colorName:'Blue Gray',colorHex:'#667085',
      spoolType:'Cardboard',startWeight:1000,visualPercent:20,gross:null,tare:null,location:'Dry Box',
      confidence:'High',opened:'Yes',bagged:'Yes',purchaseSource:'',purchasePrice:null,purchaseDate:'',
      reorderThreshold:250,lastDriedDate:'',notes:'Second cohesion test spool',placementState:'Stored',printerName:'',feederName:'',feederSlot:'',
      createdAt:'2026-08-02T12:00:00.000Z',updatedAt:'2026-08-21T12:00:00.000Z',archivedAt:null,
    },
  ],
};

const preferences = {
  version:2,
  identity:{displayName:'Bill Lab',initials:'BL'},
  appearance:{theme:'dark',accent:'teal',density:'comfortable'},
  workspace:{startView:'dashboard',dashboardDetail:'balanced'},
  printing:{safetyMargin:10,defaultReorderGrams:250,defaultStartWeight:1000},
};

async function boot(page) {
  await page.addInitScript(({inventory,preferences}) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('filament-current-user-v1','Bill');
    localStorage.setItem('filament-user-isolation-v1',JSON.stringify({at:'2026-08-28T15:00:00.000Z',schemaVersion:10,cloudIsolation:'profile-scoped'}));
    localStorage.setItem('filament-user-v1:bill:inventory',JSON.stringify(inventory));
    localStorage.setItem('filament-user-v1:bill:preferences',JSON.stringify(preferences));
    localStorage.setItem('filament-user-v1:bill:sync-settings',JSON.stringify({enabled:false,lastRevision:'',lastSyncedAt:null}));
  }, {inventory,preferences});
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryNavigation))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryCohesion))).toBe(true);
  await expect(page.locator('html')).toHaveClass(/fi-cohesion-release/);
}

async function navigate(page, view) {
  await page.evaluate(target => globalThis.FilamentInventoryNavigation.navigate(target,{historyMode:'push',focus:false}),view);
  await expect(page.locator(`#${view}View`)).toHaveClass(/active/);
}

test.beforeEach(async ({page}) => boot(page));

test('inventory and intake expose a calmer primary path', async ({page}) => {
  await navigate(page,'inventory');
  await expect(page.locator('#inventoryGrid .spool-card')).toHaveCount(2);
  await expect(page.locator('#inventoryGrid .spool-card .fi-spool-details-action')).toHaveCount(2);
  await expect(page.locator('#inventoryGrid .spool-card .fi-spool-details-action').first()).toHaveText('Details');

  await page.locator('[data-filter-open]').click();
  await expect(page.locator('[data-filter-apply]')).toHaveText('Done');
  await expect(page.locator('#clearFiltersBtn')).toHaveText('Reset filters');
  await page.locator('.inventory-filter-dialog [data-dialog-close]').click();

  await page.locator('#inventoryAddBtn').click();
  await expect(page.locator('#spoolDialog[open]')).toBeVisible();
  await expect(page.locator('.spool-form-essentials #brand')).toBeVisible();
  await expect(page.locator('.spool-form-essentials #material')).toBeVisible();
  await expect(page.locator('.spool-form-essentials #location')).toBeVisible();
  await expect(page.locator('.spool-form-essentials #placementV8')).toHaveCount(0);
  await expect(page.locator('.v10-advanced-grid #placementV8')).toHaveCount(1);
  await expect(page.locator('#brand')).toHaveAttribute('list','fiBrandSuggestions');
  await expect(page.locator('label[for="startWeight"]')).toHaveText('Nominal full filament (g)');
  await expect(page.locator('#visualPercent').locator('..')).toContainText('measured gross − tare');
});

test('weigh, preferences and labels use progressive disclosure and explicit outcomes', async ({page}) => {
  await navigate(page,'weigh');
  await expect(page.locator('.weigh-optional')).toHaveCount(1);
  await expect(page.locator('.weigh-optional')).not.toHaveAttribute('open','');
  await page.locator('#weighSpool').selectOption('C001');
  await page.locator('#grossWeight').fill('800');
  await page.locator('#tareWeight').fill('200');
  await expect(page.locator('#calcRemaining')).toContainText('600');
  await expect(page.locator('#weighForm button[type="submit"]')).toContainText('600');

  await navigate(page,'preferences');
  await expect(page.locator('.profile-save-rail')).toContainText('Preferences save automatically');
  await expect(page.locator('#profilePreferencesForm button[type="submit"]')).toHaveCount(0);
  await expect(page.locator('.profile-section-index:visible')).toHaveCount(0);

  await navigate(page,'labels');
  await expect(page.locator('.labels-print-bar .fi-label-output-control #labelSize')).toHaveCount(1);
  await expect(page.locator('#selectActiveLabelsBtn')).toContainText('Select all 2 active');
  await page.locator('#selectActiveLabelsBtn').click();
  await expect(page.locator('#printLabelsBtn')).toHaveText('Print 2 labels');
});
