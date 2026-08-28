import { test, expect } from '@playwright/test';

const FIXED_TIME = Date.parse('2026-08-28T15:00:00.000Z');

const prefs = (owner, displayName, initials, accent) => ({
  version: 2,
  identity: { displayName, initials },
  appearance: { theme: 'dark', accent, density: 'comfortable' },
  workspace: { startView: 'dashboard', dashboardDetail: 'balanced' },
  printing: { safetyMargin: 10, defaultReorderGrams: 250, defaultStartWeight: 1000 },
});

const spool = (overrides = {}) => ({
  id: 'T001', owner: 'Bill', brand: 'Bambu Lab', material: 'PLA', colorName: 'Matte White', colorHex: '#f4f2ec',
  spoolType: 'Plastic', startWeight: 1000, visualPercent: 80, gross: null, tare: null, location: 'Rack A',
  confidence: 'Confirmed', opened: 'Yes', bagged: 'No', purchaseSource: '', purchasePrice: null, purchaseDate: '',
  reorderThreshold: 250, lastDriedDate: '', notes: 'Deterministic browser-test spool.',
  createdAt: '2026-08-01T12:00:00.000Z', updatedAt: '2026-08-20T12:00:00.000Z', archivedAt: null, ...overrides,
});

const state = (owner, spools) => ({
  version: 10, appVersion: '10.2.0', profile: owner, savedAt: '2026-08-28T15:00:00.000Z',
  meta: { lastBackupAt: null }, spools, weighLog: [], auditLog: [], tombstones: {},
});

async function seedBrowser(page) {
  const payload = {
    fixedTime: FIXED_TIME,
    billState: state('Bill', [
      spool(),
      spool({id:'T002',material:'PETG',colorName:'Carbon Black',colorHex:'#171a22',visualPercent:10,location:'Rack B',notes:'Low PETG browser-test spool.'}),
    ]),
    aimeeState: state('Aimee', [spool({id:'A001',owner:'Aimee',material:'PLA',colorName:'Blue Gray',colorHex:'#667085',visualPercent:65,location:'Aimee Rack'})]),
    billPrefs: prefs('Bill', 'Bill Lab', 'BL', 'teal'),
    aimeePrefs: prefs('Aimee', 'Aimee Studio', 'AS', 'violet'),
  };

  await page.addInitScript(data => {
    const RealDate = globalThis.Date;
    class FixedDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [data.fixedTime])); }
      static now() { return data.fixedTime; }
    }
    globalThis.Date = FixedDate;
    if (sessionStorage.getItem('fi-e2e-seeded') === '1') return;
    localStorage.clear();
    localStorage.setItem('filament-current-user-v1', 'Bill');
    localStorage.setItem('filament-user-isolation-v1', JSON.stringify({at:'2026-08-28T15:00:00.000Z',schemaVersion:10,cloudIsolation:'profile-scoped'}));
    localStorage.setItem('filament-user-v1:bill:inventory', JSON.stringify(data.billState));
    localStorage.setItem('filament-user-v1:aimee:inventory', JSON.stringify(data.aimeeState));
    localStorage.setItem('filament-user-v1:bill:preferences', JSON.stringify(data.billPrefs));
    localStorage.setItem('filament-user-v1:aimee:preferences', JSON.stringify(data.aimeePrefs));
    localStorage.setItem('filament-user-v1:bill:sync-settings', JSON.stringify({enabled:false,lastRevision:'',lastSyncedAt:null}));
    localStorage.setItem('filament-user-v1:aimee:sync-settings', JSON.stringify({enabled:false,lastRevision:'',lastSyncedAt:null}));
    sessionStorage.setItem('fi-e2e-seeded', '1');
  }, payload);
}

async function boot(page) {
  await seedBrowser(page);
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/fi-v11/);
  await expect.poll(() => page.locator('.view.active').count()).toBe(1);
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryNavigation))).toBe(true);
}

async function navigate(page, view) {
  await page.evaluate(target => globalThis.FilamentInventoryNavigation.navigate(target,{historyMode:'push',focus:false}), view);
  await expect(page.locator(`#${view}View`)).toHaveClass(/active/);
}

test.beforeEach(async ({ page }) => { await boot(page); });

test('boots with one active surface and closed dialogs never render in layout', async ({ page }) => {
  await expect(page.locator('#dashboardView')).toHaveClass(/active/);
  await expect(page.locator('.view.active')).toHaveCount(1);
  const renderedClosedDialogs = await page.locator('dialog:not([open])').evaluateAll(nodes => nodes.filter(node => getComputedStyle(node).display !== 'none').length);
  expect(renderedClosedDialogs).toBe(0);
});

test('inventory filter sheet changes and restores the real card set', async ({ page }) => {
  await navigate(page,'inventory');
  await expect(page.locator('#inventoryGrid .spool-card')).toHaveCount(2);
  await page.locator('[data-filter-open]').click();
  await expect(page.locator('.inventory-filter-dialog[open]')).toBeVisible();
  await page.locator('#materialFilter').selectOption('PLA');
  await page.locator('[data-filter-apply]').click();
  await expect(page.locator('#inventoryGrid .spool-card')).toHaveCount(1);
  await expect(page.locator('#inventoryGrid .spool-card')).toContainText('T001');
  await expect(page.locator('[data-filter-count]')).toHaveText('1');
  await page.locator('[data-filter-open]').click();
  await page.locator('[data-filter-reset]').click();
  await page.locator('[data-filter-apply]').click();
  await expect(page.locator('#inventoryGrid .spool-card')).toHaveCount(2);
});

test('preference edits autosave and flush before leaving Preferences', async ({ page }) => {
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryProfileUI))).toBe(true);
  await navigate(page,'preferences');
  await expect(page.locator('#profilePreferencesForm')).toBeVisible();
  await page.locator('#profileDisplayName').fill('Bill Workshop');
  await page.locator('#profileAccent').selectOption('blue');
  await expect(page.locator('[data-profile-save-status]')).toHaveText('Saving…');
  await expect(page.locator('[data-profile-save-status]')).toHaveText('Saved automatically');
  await expect.poll(() => page.evaluate(() => {
    const saved=JSON.parse(localStorage.getItem('filament-user-v1:bill:preferences')||'{}');
    return `${saved.identity?.displayName}|${saved.appearance?.accent}`;
  })).toBe('Bill Workshop|blue');
  await page.locator('#profileInitials').fill('BW');
  await navigate(page,'inventory');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('filament-user-v1:bill:preferences')||'{}').identity?.initials)).toBe('BW');
});

test('profile switcher uses each profile custom identity and reloads into isolated state', async ({ page }) => {
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryProfileUI))).toBe(true);
  await expect(page.locator('.profile-chip')).toContainText('Bill Lab');
  await page.locator('.profile-chip').click();
  const switcher=page.locator('.profile-switch-dialog[open]');
  await expect(switcher).toBeVisible();
  const aimee=switcher.locator('[data-profile-owner="Aimee"]');
  await expect(aimee).toContainText('Aimee Studio');
  await expect(aimee).toContainText('AS');
  await aimee.click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('filament-current-user-v1'))).toBe('Aimee');
  await expect(page.locator('body')).toHaveAttribute('data-inventory-user','Aimee');
  await expect(page.locator('.profile-chip')).toContainText('Aimee Studio');
  await navigate(page,'inventory');
  await expect(page.locator('#inventoryGrid .spool-card')).toHaveCount(1);
  await expect(page.locator('#inventoryGrid .spool-card')).toContainText('A001');
});

test('service worker activates the current PWA shell cache with V11 assets', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium','PWA cache contract is exercised once in Chromium.');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryPWA))).toBe(true);
  const result=await page.evaluate(async () => {
    if (!('serviceWorker' in navigator) || !('caches' in globalThis)) return null;
    await globalThis.FilamentInventoryPWA?.ready;
    const registration=await navigator.serviceWorker.ready;
    const keys=await caches.keys();
    const cacheName=keys.find(key=>key.startsWith('filament-inventory-v'))||'';
    const cache=cacheName?await caches.open(cacheName):null;
    return {script:registration.active?.scriptURL||'',cacheName,shell:Boolean(await cache?.match('/css/components/v11.css')),workflows:Boolean(await cache?.match('/css/components/v11-workflows.css')),appShell:Boolean(await cache?.match('/app-shell-client.js')),pwaRuntime:Boolean(await cache?.match('/pwa-client.js'))};
  });
  expect(result).not.toBeNull();
  expect(result.script).toContain('/sw.js');
  expect(result.cacheName).toBe('filament-inventory-v37');
  expect(result.shell).toBe(true);
  expect(result.workflows).toBe(true);
  expect(result.appShell).toBe(true);
  expect(result.pwaRuntime).toBe(true);
});

test('mobile Back and Forward restore the exact app surface', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit','Mobile shell contract.');
  const bottom=page.locator('.mobile-bottom-nav');
  await expect(bottom).toBeVisible();
  await bottom.locator('[data-bottom-view="inventory"]').click();
  await expect(page.locator('#inventoryView')).toHaveClass(/active/);
  await expect(page).toHaveURL(/#view=inventory$/);
  await bottom.locator('[data-bottom-view="household"]').click();
  await expect(page.locator('#householdView')).toHaveClass(/active/);
  await expect(page).toHaveURL(/#view=household$/);
  await page.goBack();
  await expect(page.locator('#inventoryView')).toHaveClass(/active/);
  await page.goBack();
  await expect(page.locator('#dashboardView')).toHaveClass(/active/);
  await page.goForward();
  await expect(page.locator('#inventoryView')).toHaveClass(/active/);
});

test('mobile More hands off to one isolated Print Check dialog', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit','Mobile sheet contract.');
  await page.locator('[data-bottom-more]').click();
  await expect(page.locator('.fi-more-sheet[open]')).toBeVisible();
  await page.locator('.fi-more-sheet [data-shell-action="print"]').click();
  await expect(page.locator('.fi-more-sheet')).not.toHaveAttribute('open','');
  await expect(page.locator('#printReadinessDialog[open]')).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#printReadinessDialog')).not.toHaveAttribute('open','');
});

test('mobile scanner unknown-spool recovery opens Add spool with the scanned ID', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit','iPhone scanner handoff contract.');
  await page.locator('[data-bottom-scan]').click();
  await expect(page.locator('#qrScannerDialog[open]')).toBeVisible();
  await page.locator('#qrManualId').fill('T999');
  await page.getByRole('button',{name:'Find spool'}).click();
  await expect(page.locator('.qr-unknown-dialog[open]')).toBeVisible();
  await expect(page.locator('.qr-unknown-dialog')).toContainText("T999 is not in Bill's inventory");
  await page.getByRole('button',{name:'Add this spool'}).click();
  await expect(page.locator('#spoolDialog[open]')).toBeVisible();
  await expect(page.locator('#spoolId')).toHaveValue('T999');
});

test('mobile Home and Inventory preserve approved visual hierarchy', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit','Visual baselines are iPhone WebKit only.');
  await expect(page).toHaveScreenshot('mobile-home.png');
  await navigate(page,'inventory');
  await expect(page).toHaveScreenshot('mobile-inventory.png');
});
