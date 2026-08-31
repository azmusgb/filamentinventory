import {test, expect} from '@playwright/test';

const preferences = {
  version:2,
  identity:{displayName:'Bill Lab',initials:'BL'},
  appearance:{theme:'dark',accent:'teal',density:'comfortable'},
  workspace:{startView:'inventory',dashboardDetail:'balanced'},
  printing:{safetyMargin:10,defaultReorderGrams:250,defaultStartWeight:1000},
};

const spool = (overrides = {}) => ({
  id:'VIS01',owner:'Bill',brand:'Bambu Lab',material:'PLA',colorName:'Black',colorHex:'#171a22',
  spoolType:'Plastic',startWeight:1000,visualPercent:65,estimatedRemainingGrams:null,gross:null,tare:null,location:'Rack A',
  confidence:'Confirmed',opened:'Yes',bagged:'No',purchaseSource:'',purchasePrice:null,purchaseDate:'',
  reorderThreshold:250,lastDriedDate:'',notes:'Inventory evidence hierarchy test',placementState:'Stored',printerName:'',feederName:'',feederSlot:'',
  createdAt:'2026-08-01T12:00:00.000Z',updatedAt:'2026-08-30T06:30:00.000Z',archivedAt:null,
  ...overrides,
});

const inventory = {
  version:10,
  appVersion:'10.2.0',
  profile:'Bill',
  savedAt:'2026-08-30T06:30:00.000Z',
  meta:{lastBackupAt:null},
  printers:[{id:'P1S',owner:'Bill',name:'P1S'}],
  weighLog:[],
  auditLog:[],
  printJobs:[],
  tombstones:{},
  spools:[
    spool(),
    spool({id:'USE01',material:'PETG',colorName:'Blue Gray',colorHex:'#667085',visualPercent:90,estimatedRemainingGrams:520,location:'Dry Box'}),
    spool({id:'LOW01',colorName:'White',colorHex:'#f5f5f4',visualPercent:null,gross:380,tare:200,placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'2',location:'',confidence:'Medium'}),
    spool({id:'UNK01',material:'TPU',colorName:'Orange',colorHex:'#f97316',visualPercent:null,estimatedRemainingGrams:null,location:'Shelf B',confidence:'Low'}),
  ],
};

async function boot(page) {
  await page.addInitScript(({inventory,preferences}) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('filament-current-user-v1','Bill');
    localStorage.setItem('filament-user-isolation-v1',JSON.stringify({at:'2026-08-30T06:30:00.000Z',schemaVersion:10,cloudIsolation:'profile-scoped'}));
    localStorage.setItem('filament-user-v1:bill:inventory',JSON.stringify(inventory));
    localStorage.setItem('filament-user-v1:bill:preferences',JSON.stringify(preferences));
    localStorage.setItem('filament-user-v1:bill:sync-settings',JSON.stringify({enabled:false,lastRevision:'',lastSyncedAt:null}));
  }, {inventory,preferences});
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventorySpoolContract))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryCardPresentation))).toBe(true);
  await page.evaluate(() => globalThis.FilamentInventoryNavigation.navigate('inventory',{historyMode:'replace',focus:false}));
  await expect(page.locator('#inventoryGrid .inventory-evidence-v12')).toHaveCount(4);
}

const card = (page,id) => page.locator(`#inventoryGrid .spool-card[data-id="${id}"]`);

test.beforeEach(async ({page}) => boot(page));

test('visual and usage estimates expose distinct evidence sources with approximation marks', async ({page}) => {
  const visual = card(page,'VIS01');
  await expect(visual.locator('.inventory-quantity-amount')).toHaveText('≈650 g');
  await expect(visual.locator('.inventory-quantity-percent')).toHaveText('≈65%');
  await expect(visual.locator('.inventory-evidence-chip')).toHaveText('Estimated · visual');
  await expect(visual.locator('.inventory-placement')).toHaveText('Stored · Rack A');
  await expect(visual.locator('.inventory-id-chip')).toHaveCount(0);

  const usage = card(page,'USE01');
  await expect(usage.locator('.inventory-quantity-amount')).toHaveText('≈520 g');
  await expect(usage.locator('.inventory-quantity-percent')).toHaveText('≈52%');
  await expect(usage.locator('.inventory-evidence-chip')).toHaveText('Estimated · usage');
  await expect(usage.locator('.progress')).toHaveAttribute('aria-valuenow','52');
});

test('measured low loaded spool keeps evidence, stock and placement as independent signals', async ({page}) => {
  const low = card(page,'LOW01');
  await expect(low.locator('.inventory-quantity-amount')).toHaveText('180 g');
  await expect(low.locator('.inventory-quantity-percent')).toHaveText('18%');
  await expect(low.locator('.inventory-evidence-chip')).toHaveText('Measured · scale');
  await expect(low.locator('.inventory-state-chip[data-state="low"]')).toHaveText('Low stock');
  await expect(low.locator('.inventory-state-chip[data-state="loaded"]')).toHaveText('Loaded');
  await expect(low.locator('.inventory-placement')).toHaveText('P1S · AMS 1 · Slot 2');
  await expect(low.locator('.inventory-id-chip')).toHaveText('ID medium');
  await expect(low).toHaveAttribute('data-stock-state','low');
  await expect(low).toHaveAttribute('data-placement-state','loaded');
});

test('unknown quantity is explicit and only uncertain identification gets list-level attention', async ({page}) => {
  const unknown = card(page,'UNK01');
  await expect(unknown.locator('.inventory-quantity-amount')).toHaveText('Amount unknown');
  await expect(unknown.locator('.inventory-quantity-percent')).toHaveText('—');
  await expect(unknown.locator('.inventory-evidence-chip')).toHaveText('Unknown · verify');
  await expect(unknown.locator('.progress')).toBeHidden();
  await expect(unknown.locator('.inventory-placement')).toHaveText('Stored · Shelf B');
  await expect(unknown.locator('.inventory-id-chip')).toHaveText('ID low');
  await expect(card(page,'VIS01').locator('.inventory-id-chip')).toHaveCount(0);
});
