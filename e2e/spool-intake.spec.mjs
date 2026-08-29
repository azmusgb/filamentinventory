import { test, expect } from '@playwright/test';

const spool = (overrides = {}) => ({
  id:'S100', owner:'Bill', brand:'Inland', material:'PLA+', colorName:'Purple', colorHex:'#7c3aed',
  spoolType:'Cardboard', startWeight:1000, visualPercent:65, gross:null, tare:null, location:'Shelf',
  confidence:'Confirmed', opened:'Yes', bagged:'No', purchaseSource:'Micro Center', purchasePrice:null, purchaseDate:'',
  reorderThreshold:250, lastDriedDate:'', notes:'Guided intake seed.', createdAt:'2026-08-01T12:00:00.000Z', updatedAt:'2026-08-20T12:00:00.000Z', archivedAt:null,
  ...overrides,
});

const state = (owner, spools) => ({
  version:10, appVersion:'10.2.0', profile:owner, savedAt:'2026-08-28T20:00:00.000Z',
  meta:{lastBackupAt:null}, spools, weighLog:[], auditLog:[], printJobs:[], printers:[], tombstones:{},
});

async function boot(page) {
  await page.addInitScript(({bill,aimee}) => {
    localStorage.clear();
    localStorage.setItem('filament-current-user-v1','Bill');
    localStorage.setItem('filament-user-isolation-v1',JSON.stringify({at:'2026-08-28T20:00:00.000Z',schemaVersion:10,cloudIsolation:'profile-scoped'}));
    localStorage.setItem('filament-user-v1:bill:inventory',JSON.stringify(bill));
    localStorage.setItem('filament-user-v1:aimee:inventory',JSON.stringify(aimee));
    localStorage.setItem('filament-user-v1:bill:preferences',JSON.stringify({version:2,identity:{displayName:'Bill',initials:'BR'},appearance:{theme:'dark',accent:'teal',density:'comfortable'},workspace:{startView:'inventory',dashboardDetail:'balanced'},printing:{safetyMargin:10,defaultReorderGrams:250,defaultStartWeight:1000}}));
  },{
    bill:state('Bill',[spool(),spool({id:'S101',brand:'Bambu Lab',material:'PETG HF',colorName:'Black',colorHex:'#111827',location:'Dry box',purchaseSource:'Bambu Lab'})]),
    aimee:state('Aimee',[]),
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryNavigation))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventorySpoolIntakeUI))).toBe(true);
  await page.evaluate(() => globalThis.FilamentInventoryNavigation.navigate('inventory',{historyMode:'replace',focus:false}));
  await expect(page.locator('#inventoryView')).toHaveClass(/active/);
}

test.beforeEach(async ({page}) => { await boot(page); });

test('guided Add spool standardizes common choices, supports custom values and learns them for the next spool', async ({page}) => {
  await page.locator('#inventoryAddBtn:visible').click();
  const dialog=page.locator('#spoolDialog[open]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.spool-intake-summary')).toBeVisible();

  const brand=dialog.locator('#brandChoice');
  await expect(brand).toBeVisible();
  const brandOptions=await brand.locator('option').allTextContents();
  expect(brandOptions).toContain('Inland');
  expect(brandOptions).toContain('Bambu Lab');
  expect(brandOptions).toContain('ELEGOO');
  expect(brandOptions).toContain('Other / custom…');

  await dialog.locator('#spoolId').fill('S900');
  await brand.selectOption('__custom__');
  await dialog.locator('#brand').fill('Atomic Filament');
  await dialog.locator('#materialChoice').selectOption('PLA');
  await dialog.locator('#colorNameChoice').selectOption('Blue');
  await expect(dialog.locator('#colorHex')).toHaveValue('#2563eb');
  await dialog.locator('#locationChoice').selectOption('__custom__');
  await dialog.locator('#location').fill('Dry cabinet 2');
  await dialog.locator('[data-number-choices="startWeight"] [data-value="2000"]').click();
  await expect(dialog.locator('#startWeight')).toHaveValue('2000');

  const advanced=dialog.locator('.spool-form-advanced');
  await advanced.locator('summary').click();
  await dialog.locator('[data-percent-choices] [data-value="75"]').click();
  await dialog.locator('#confidence').selectOption('Confirmed');
  await expect(dialog.locator('[data-intake-title]')).toContainText('S900 · Blue');
  await expect(dialog.locator('[data-intake-detail]')).toContainText('Atomic Filament · PLA');
  await expect(dialog.locator('[data-intake-state]')).toHaveText('Ready');

  await dialog.locator('[data-spool-save-another]').click();
  await expect.poll(() => page.evaluate(() => {
    const value=JSON.parse(localStorage.getItem('filament-inventory-v1')||'{}');
    const saved=(value.spools||[]).find(row=>row.id==='S900');
    return saved ? `${saved.brand}|${saved.material}|${saved.colorName}|${saved.colorHex}|${saved.startWeight}|${saved.visualPercent}|${saved.location}` : '';
  })).toBe('Atomic Filament|PLA|Blue|#2563eb|2000|75|Dry cabinet 2');

  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#spoolId')).not.toHaveValue('S900');
  await expect(dialog.locator('#brandChoice option')).toContainText(['Choose a brand…','Atomic Filament']);
  const learnedOptions=await dialog.locator('#brandChoice option').allTextContents();
  expect(learnedOptions).toContain('Atomic Filament');

  const aimeeCount=await page.evaluate(() => (JSON.parse(localStorage.getItem('filament-user-v1:aimee:inventory')||'{}').spools||[]).length);
  expect(aimeeCount).toBe(0);
});

test('editing a spool offers duplicate-as-new without copying quantity evidence', async ({page}) => {
  await page.locator('#inventoryGrid .spool-card').filter({hasText:'S100'}).locator('[data-action="edit"]:visible').click();
  const dialog=page.locator('#spoolDialog[open]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-spool-duplicate]')).toBeVisible();
  await expect(dialog.locator('[data-spool-save-another]')).toBeHidden();
  await dialog.locator('[data-spool-duplicate]').click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#spoolId')).not.toHaveValue('S100');
  await expect(dialog.locator('#brand')).toHaveValue('Inland');
  await expect(dialog.locator('#material')).toHaveValue('PLA+');
  await expect(dialog.locator('#visualPercent')).toHaveValue('');
  await expect(dialog.locator('#grossEdit')).toHaveValue('');
  await expect(dialog.locator('#tareEdit')).toHaveValue('');
});
