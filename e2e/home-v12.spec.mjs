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
  reorderThreshold:250,lastDriedDate:'',notes:'Home V12 test spool',placementState:'Stored',printerName:'',feederName:'',feederSlot:'',
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

test('Home prioritizes low stock over summary metrics', async ({page}) => {
  await boot(page,[
    spool({id:'H001',visualPercent:15,location:'Rack A'}),
    spool({id:'H002',material:'PETG',colorName:'Blue Gray',colorHex:'#667085',visualPercent:null,location:'Dry Box'}),
    spool({id:'H003',material:'PLA',colorName:'White',colorHex:'#f5f5f4',visualPercent:65,placementState:'Loaded',printerName:'P1S',feederName:'AMS',feederSlot:'2'}),
  ]);

  await expect(page.locator('[data-home-decision-label]')).toHaveText('Next decision');
  await expect(page.locator('[data-home-decision]')).toHaveText('1 spool at reorder level');
  await expect(page.locator('[data-home-summary]')).toContainText('Review the lowest spool before the next print');
  await expect(page.locator('[data-home-summary]')).toContainText('3 active');
  await expect(page.locator('[data-home-summary]')).toContainText('0.80 kg known');
  await expect(page.locator('[data-home-summary]')).toContainText('1 loaded');
  await expect(page.locator('[data-home-attention-count]')).toHaveText('2');
  await expect(page.locator('[data-home-loaded-count]')).toHaveText('1');

  const next = page.locator('[data-home-next-action]');
  await expect(next).toBeVisible();
  await expect(next).toHaveText('Review low spool');
  await expect(next).toHaveAttribute('data-home-action','open');
  await expect(next).toHaveAttribute('data-spool','H001');
  await expect(next).toHaveClass(/btn-primary/);
  await expect(page.locator('[data-print-readiness]')).not.toHaveClass(/btn-primary/);
});

test('Home turns unknown quantity into a measurement task', async ({page}) => {
  await boot(page,[spool({id:'H010',material:'PETG',colorName:'Orange',visualPercent:null,location:'Shelf'})]);

  await expect(page.locator('[data-home-decision]')).toHaveText('Measure 1 unknown spool');
  await expect(page.locator('[data-home-summary]')).toContainText('measured evidence');
  const next = page.locator('[data-home-next-action]');
  await expect(next).toBeVisible();
  await expect(next).toHaveText('Measure next spool');
  await expect(next).toHaveAttribute('data-home-action','weigh');
  await expect(next).toHaveAttribute('data-spool','H010');
});

test('Home promotes print readiness when loaded state is healthy', async ({page}) => {
  await boot(page,[spool({id:'H020',visualPercent:70,placementState:'Loaded',printerName:'P1S',feederName:'AMS',feederSlot:'1'})]);

  await expect(page.locator('[data-home-decision-label]')).toHaveText('Ready state');
  await expect(page.locator('[data-home-decision]')).toHaveText('1 spool loaded now');
  await expect(page.locator('[data-home-next-action]')).toBeHidden();
  await expect(page.locator('[data-print-readiness]')).toBeVisible();
  await expect(page.locator('[data-print-readiness]')).toHaveClass(/btn-primary/);
  await expect(page.locator('[data-home-loaded-count]')).toHaveText('1');
});
