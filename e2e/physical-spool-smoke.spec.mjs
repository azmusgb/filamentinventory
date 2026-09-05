import { test, expect } from '@playwright/test';

const FIXED_TIME = Date.parse('2026-09-05T14:00:00.000Z');
const spool = (overrides = {}) => ({
  id:'T001', owner:'Bill', brand:'Bambu Lab', material:'PLA', colorName:'Matte White', colorHex:'#f4f2ec',
  spoolType:'Plastic', startWeight:1000, visualPercent:80, gross:null, tare:null, location:'Rack A', confidence:'Confirmed',
  opened:'Yes', bagged:'No', purchaseSource:'', purchasePrice:null, purchaseDate:'', reorderThreshold:250,
  lastDriedDate:'', notes:'Physical workflow smoke spool.', createdAt:'2026-09-01T12:00:00.000Z',
  updatedAt:'2026-09-04T12:00:00.000Z', archivedAt:null, ...overrides,
});
const state = (owner, spools) => ({
  version:10, appVersion:'10.2.0', profile:owner, savedAt:'2026-09-05T14:00:00.000Z',
  meta:{lastBackupAt:null}, spools, weighLog:[], auditLog:[], printJobs:[], tombstones:{},
});

async function seed(page) {
  await page.addInitScript(data => {
    const RealDate = globalThis.Date;
    class FixedDate extends RealDate { constructor(...args){ super(...(args.length?args:[data.fixedTime])); } static now(){ return data.fixedTime; } }
    globalThis.Date = FixedDate;
    if (sessionStorage.getItem('fi-physical-smoke-seeded') === '1') return;
    localStorage.clear();
    localStorage.setItem('filament-current-user-v1','Bill');
    localStorage.setItem('filament-user-isolation-v1',JSON.stringify({at:'2026-09-05T14:00:00.000Z',schemaVersion:10,cloudIsolation:'profile-scoped'}));
    localStorage.setItem('filament-user-v1:bill:inventory',JSON.stringify(data.bill));
    localStorage.setItem('filament-user-v1:aimee:inventory',JSON.stringify(data.aimee));
    localStorage.setItem('filament-user-v1:bill:sync-settings',JSON.stringify({enabled:false,lastRevision:'',lastSyncedAt:null}));
    localStorage.setItem('filament-user-v1:aimee:sync-settings',JSON.stringify({enabled:false,lastRevision:'',lastSyncedAt:null}));
    sessionStorage.setItem('fi-physical-smoke-seeded','1');
  }, {
    fixedTime:FIXED_TIME,
    bill:state('Bill',[spool(),spool({id:'T002',material:'PETG',colorName:'Carbon Black',colorHex:'#171a22',visualPercent:20,location:'Rack B'})]),
    aimee:state('Aimee',[spool({id:'A001',owner:'Aimee',colorName:'Ocean Blue',colorHex:'#2563eb',visualPercent:65,location:'Aimee Rack'})]),
  });
}

async function boot(page) {
  await seed(page); await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryScanner))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventorySpoolActions))).toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-inventory-user','Bill');
}
async function scan(page,id){
  await page.evaluate(() => globalThis.FilamentInventoryScanner.open());
  await expect(page.locator('#qrScannerDialog[open]')).toBeVisible();
  await page.locator('#qrManualId').fill(id); await page.getByRole('button',{name:'Find spool'}).click();
}

test.beforeEach(async ({page}) => boot(page));

test('known scan opens Physical Spool controls and Scan another returns to one scanner dialog', async ({page}) => {
  await scan(page,'T001'); const physical=page.locator('#spoolActionDialog[open]');
  await expect(physical).toBeVisible(); await expect(physical).toHaveAttribute('data-source','scan');
  await expect(physical.locator('#spoolActionTitle')).toContainText('T001 · Matte White');
  for (const label of ['Weigh now','Load / move','QR label','Copy link','Scan another']) await expect(physical.getByRole('button',{name:label})).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await physical.getByRole('button',{name:'Scan another'}).click();
  await expect(page.locator('#qrScannerDialog[open]')).toBeVisible(); await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(page.locator('[data-scanner-profile]')).toContainText("Bill's private inventory");
});

test('scan Weigh handoff selects spool and saved scale reading becomes measured evidence', async ({page}) => {
  await scan(page,'T001'); await page.locator('#spoolActionDialog[open]').getByRole('button',{name:'Weigh now'}).click();
  await expect(page.locator('#weighView')).toHaveClass(/active/); await expect(page.locator('#weighSpool')).toHaveValue('T001');
  await expect(page.locator('#weighEvidenceStatus')).toContainText('currently estimated');
  await page.locator('#grossWeight').fill('760'); await page.locator('#tareWeight').fill('200');
  await page.getByRole('button',{name:'Save measurement'}).click();
  await expect.poll(() => page.evaluate(() => {
    const s=JSON.parse(localStorage.getItem('filament-inventory-v1')||'{}'); const row=(s.spools||[]).find(x=>x.id==='T001'); const log=(s.weighLog||[]).at(-1);
    return `${row?.gross}|${row?.tare}|${log?.remaining}`;
  })).toBe('760|200|560');
  await expect(page.locator('#weighEvidenceStatus')).toContainText('currently measured');
});

test('scan QR-label handoff selects only the scanned spool', async ({page}) => {
  await scan(page,'T001'); await page.locator('#spoolActionDialog[open]').getByRole('button',{name:'QR label'}).click();
  await expect(page.locator('#labelsView')).toHaveClass(/active/); await expect(page.locator('#labelSearch')).toHaveValue('T001');
  await expect(page.locator('#spoolPickList [data-label-id="T001"]')).toBeChecked();
  await expect(page.locator('#labelPreviewGrid')).toContainText('T001'); await expect(page.locator('#labelSelectionCount')).toContainText('1 selected');
});

test('private link preserves scan/profile and deep-link boot reopens Physical Spool', async ({page,context}) => {
  await context.grantPermissions(['clipboard-read','clipboard-write']); await scan(page,'T001');
  await page.locator('#spoolActionDialog[open]').getByRole('button',{name:'Copy link'}).click();
  const copied=await page.evaluate(() => navigator.clipboard.readText()); const url=new URL(copied);
  expect(url.searchParams.get('spool')).toBe('T001'); expect(url.searchParams.get('scan')).toBe('1');
  expect(new URLSearchParams(url.hash.slice(1)).get('filament-user')).toBe('Bill');
  await page.goto(`${url.pathname}${url.search}${url.hash}`);
  await expect(page.locator('body')).toHaveAttribute('data-inventory-user','Bill'); await expect(page.locator('#spoolActionDialog[open]')).toBeVisible();
  await expect(page.locator('#spoolActionDialog')).toHaveAttribute('data-source','scan'); await expect(page.locator('#spoolActionTitle')).toContainText('T001 · Matte White');
  await expect(page).not.toHaveURL(/(?:\?|&)scan=1/); await expect(page).not.toHaveURL(/(?:\?|&)spool=T001/);
});

test('cross-profile scan routes to owning private inventory', async ({page}) => {
  await scan(page,'A001'); await page.waitForLoadState('load');
  await expect(page.locator('body')).toHaveAttribute('data-inventory-user','Aimee'); await expect(page.locator('#spoolActionDialog[open]')).toBeVisible();
  await expect(page.locator('#spoolActionTitle')).toContainText('A001 · Ocean Blue');
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('filament-user-v1:bill:inventory')||'{}').spools||[]).some(x=>x.id==='A001'))).toBe(false);
});

test('foreign labels are rejected with an explicit recovery message', async ({page}) => {
  await page.evaluate(() => globalThis.FilamentInventoryScanner.open());
  await page.evaluate(() => globalThis.FilamentInventoryScanner.process('https://example.com/?spool=T001&scan=1'));
  await expect(page.locator('#qrScanStatus')).toContainText('Not a Filament Inventory label'); await expect(page.locator('#qrScanStatus')).toContainText('different site');
});
