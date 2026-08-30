import {test, expect} from '@playwright/test';

const inventory = {
  version:10,
  appVersion:'10.2.0',
  profile:'Bill',
  savedAt:'2026-08-29T20:00:00.000Z',
  meta:{lastBackupAt:null},
  printers:[],
  weighLog:[],
  auditLog:[],
  printJobs:[],
  tombstones:{},
  spools:[{
    id:'CARD01',owner:'Bill',brand:'Bambu Lab',material:'PLA',colorName:'Black',colorHex:'#171a22',
    spoolType:'Plastic',startWeight:1000,visualPercent:65,gross:null,tare:null,location:'Rack A',
    confidence:'Confirmed',opened:'Yes',bagged:'No',purchaseSource:'',purchasePrice:null,purchaseDate:'',
    reorderThreshold:250,lastDriedDate:'',notes:'Card interaction test',placementState:'Stored',printerName:'',feederName:'',feederSlot:'',
    createdAt:'2026-08-01T12:00:00.000Z',updatedAt:'2026-08-29T12:00:00.000Z',archivedAt:null,
  }],
};

async function boot(page) {
  await page.addInitScript(inventory => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('filament-current-user-v1','Bill');
    localStorage.setItem('filament-user-isolation-v1',JSON.stringify({at:'2026-08-29T20:00:00.000Z',schemaVersion:10,cloudIsolation:'profile-scoped'}));
    localStorage.setItem('filament-user-v1:bill:inventory',JSON.stringify(inventory));
  }, inventory);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryNavigation))).toBe(true);
  await page.evaluate(() => globalThis.FilamentInventoryNavigation.navigate('inventory',{historyMode:'push',focus:false}));
  await expect(page.locator('#inventoryGrid .spool-card')).toHaveCount(1);
  await expect(page.locator('#inventoryGrid .spool-card')).toHaveAttribute('data-primary-spool-open','CARD01');
}

test.beforeEach(async ({page}) => boot(page));

test('card body and keyboard open full spool details', async ({page}) => {
  const card = page.locator('#inventoryGrid .spool-card').first();
  await card.locator('.fill-top').click();
  await expect(page.locator('#spoolActionDialog[open]')).toBeVisible();
  await expect(page.locator('#inventoryCardQuickActionsDialog')).not.toHaveAttribute('open','');
  await page.locator('#spoolActionClose').click();

  await card.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#spoolActionDialog[open]')).toBeVisible();
});

test('ellipsis opens compact quick actions without opening full details', async ({page}) => {
  const menuButton = page.locator('#inventoryGrid .spool-card .spool-card-more').first();
  await expect(menuButton).toHaveAttribute('aria-label','More actions for CARD01');
  await menuButton.click();

  const menu = page.locator('#inventoryCardQuickActionsDialog[open]');
  await expect(menu).toBeVisible();
  await expect(page.locator('#spoolActionDialog')).not.toHaveAttribute('open','');
  for (const label of ['Open details','Weigh','Printer / AMS','QR label','Edit','Archive']) {
    await expect(menu.getByRole('button',{name:label,exact:true})).toBeVisible();
  }

  await menu.getByRole('button',{name:'Open details',exact:true}).click();
  await expect(menu).not.toHaveAttribute('open','');
  await expect(page.locator('#spoolActionDialog[open]')).toBeVisible();
});
