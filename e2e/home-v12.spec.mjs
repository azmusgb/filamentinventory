import { test, expect } from '@playwright/test';

const preferences = {
  version:2,
  identity:{displayName:'Bill Lab',initials:'BL'},
  appearance:{theme:'dark',accent:'teal',density:'comfortable'},
  workspace:{startView:'dashboard',dashboardDetail:'balanced'},
  printing:{safetyMargin:10,defaultReorderGrams:250,defaultStartWeight:1000},
};

const spool = (overrides = {}) => ({
  id:'H001',owner:'Bill',brand:'Bambu Lab',material:'PLA',colorName:'Black',colorHex:'#171a22',
  spoolType:'Plastic',startWeight:1000,visualPercent:60,gross:null,tare:null,location:'Rack A',
  confidence:'Confirmed',opened:'Yes',bagged:'No',purchaseSource:'',purchasePrice:null,purchaseDate:'',
  reorderThreshold:250,lastDriedDate:'',notes:'Home command-center test spool',placementState:'Stored',printerName:'',feederName:'',feederSlot:'',
  createdAt:'2026-08-01T12:00:00.000Z',updatedAt:'2026-08-20T12:00:00.000Z',archivedAt:null,
  ...overrides,
});

async function boot(page, spools) {
  const inventory = {
    version:10,
    appVersion:'10.2.0',
    profile:'Bill',
    savedAt:'2026-08-30T06:00:00.000Z',
    meta:{lastBackupAt:null},
    printers:[],
    weighLog:[],
    auditLog:[],
    printJobs:[],
    tombstones:{},
    spools,
  };
  await page.addInitScript(({inventory,preferences}) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('filament-current-user-v1','Bill');
    localStorage.setItem('filament-user-isolation-v1',JSON.stringify({at:'2026-08-30T06:00:00.000Z',schemaVersion:10,cloudIsolation:'profile-scoped'}));
    localStorage.setItem('filament-user-v1:bill:inventory',JSON.stringify(inventory));
    localStorage.setItem('filament-user-v1:bill:preferences',JSON.stringify(preferences));
    localStorage.setItem('filament-user-v1:bill:sync-settings',JSON.stringify({enabled:false,lastRevision:'',lastSyncedAt:null}));
  }, {inventory,preferences});
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryPersonal))).toBe(true);
  await expect(page.locator('#dashboardView')).toHaveClass(/active/);
  await expect(page.locator('html')).toHaveClass(/fi-ux-v12/);
}

test('Home command center prioritizes evidence-backed low and unknown items', async ({page}) => {
  await boot(page,[
    spool({id:'H001',visualPercent:15,location:'Rack A'}),
    spool({id:'H002',material:'PETG',colorName:'Blue Gray',colorHex:'#667085',visualPercent:null,location:'Dry Box'}),
    spool({id:'H003',material:'PLA',colorName:'White',colorHex:'#f5f5f4',visualPercent:65,placementState:'Loaded',printerName:'P1S',feederName:'AMS',feederSlot:'2'}),
  ]);

  await expect(page.locator('[data-home-status-pill]')).toHaveText('NEEDS ATTENTION');
  await expect(page.locator('[data-home-status-title]')).toHaveText('2 items need review');
  await expect(page.locator('[data-home-status-detail]')).toContainText('low-stock and unknown-quantity');
  await expect(page.locator('[data-home-metric="spools"]')).toHaveText('3');
  await expect(page.locator('[data-home-metric="loaded"]')).toHaveText('1');
  await expect(page.locator('[data-home-metric="known"]')).toHaveText('0.80 kg');
  await expect(page.locator('[data-home-metric="attention"]')).toHaveText('2');
  await expect(page.locator('[data-home-attention-count]')).toHaveText('2');
  await expect(page.locator('#priorityList .fi-inbox-row')).toHaveCount(2);
  await expect(page.locator('#priorityList')).toContainText('150 g remaining · Visual estimate');
  await expect(page.locator('#priorityList')).toContainText('Quantity unknown · No trusted quantity evidence');
  await expect(page.locator('[data-print-readiness]')).toBeVisible();
});

test('Home command center turns unknown quantity into an explicit weighing task', async ({page}) => {
  await boot(page,[spool({id:'H010',material:'PETG',colorName:'Orange',visualPercent:null,location:'Shelf'})]);

  await expect(page.locator('[data-home-status-pill]')).toHaveText('NEEDS ATTENTION');
  await expect(page.locator('[data-home-metric="attention"]')).toHaveText('1');
  const item = page.locator('#priorityList .fi-inbox-row').first();
  await expect(item).toContainText('PETG · Orange');
  await expect(item).toContainText('Quantity unknown');
  const weigh = item.getByRole('button',{name:'Weigh spool'});
  await expect(weigh).toBeVisible();
  await expect(weigh).toHaveAttribute('data-home-action','weigh');
  await expect(weigh).toHaveAttribute('data-spool','H010');
});

test('Home command center reports ready while keeping explicit loaded placement visible', async ({page}) => {
  await boot(page,[spool({id:'H020',visualPercent:70,placementState:'Loaded',printerName:'P1S',feederName:'AMS',feederSlot:'1'})]);

  await expect(page.locator('[data-home-status-pill]')).toHaveText('READY');
  await expect(page.locator('[data-home-status-title]')).toHaveText('Workshop inventory is ready');
  await expect(page.locator('[data-home-metric="attention"]')).toHaveText('0');
  await expect(page.locator('[data-home-loaded-count]')).toHaveText('1');
  await expect(page.locator('[data-home-loaded]')).toContainText('P1S · AMS · Slot 1');
  await expect(page.locator('[data-home-loaded]')).toContainText('Visual estimate');
  await expect(page.locator('[data-print-readiness]')).toBeVisible();
});
