import {test, expect} from '@playwright/test';

const preferences = {
  version:2,
  identity:{displayName:'Bill Lab',initials:'BL'},
  appearance:{theme:'dark',accent:'teal',density:'comfortable'},
  workspace:{startView:'dashboard',dashboardDetail:'balanced'},
  printing:{safetyMargin:10,defaultReorderGrams:250,defaultStartWeight:1000},
};

async function boot(page) {
  await page.addInitScript(preferences => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('filament-current-user-v1','Bill');
    localStorage.setItem('filament-user-isolation-v1',JSON.stringify({at:'2026-08-29T20:00:00.000Z',schemaVersion:10,cloudIsolation:'profile-scoped'}));
    localStorage.setItem('filament-user-v1:bill:inventory', JSON.stringify({version:10,profile:'Bill',spools:[],printers:[],weighLog:[],auditLog:[],printJobs:[],tombstones:{}}));
    localStorage.setItem('filament-user-v1:bill:preferences', JSON.stringify(preferences));
  }, preferences);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryNavigation))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.FilamentInventoryPreferencesV12))).toBe(true);
  await page.evaluate(() => globalThis.FilamentInventoryNavigation.navigate('preferences',{historyMode:'push',focus:false}));
  await expect(page.locator('#preferencesView')).toHaveClass(/active/);
}

test.beforeEach(async ({page}) => boot(page));

test('preferences keep common choices visible and move operational tuning behind one disclosure', async ({page}) => {
  await expect(page.locator('#profileSectionIdentity #profileDisplayName')).toBeVisible();
  await expect(page.locator('#profileSectionAppearance #profileTheme')).toBeVisible();
  await expect(page.locator('#profileSectionAppearance #profileAccent')).toBeVisible();
  await expect(page.locator('#profileSectionWorkspace #profileStartView')).toBeVisible();

  const advanced = page.locator('#profileOperationalDefaults');
  await expect(advanced).toHaveCount(1);
  await expect(advanced).not.toHaveAttribute('open','');
  await expect(advanced.locator('#profileDensity')).toBeHidden();
  await expect(advanced.locator('#profileDashboardDetail')).toBeHidden();
  await expect(advanced.locator('#profileSafetyMargin')).toBeHidden();
  await expect(advanced.locator('#profileReorder')).toBeHidden();
  await expect(advanced.locator('#profileStartWeight')).toBeHidden();

  await advanced.locator('summary').click();
  await expect(advanced.locator('#profileDensity')).toBeVisible();
  await expect(advanced.locator('#profileDashboardDetail')).toBeVisible();
  await expect(advanced.locator('#profileSafetyMargin')).toBeVisible();
  await expect(advanced.locator('#profileReorder')).toBeVisible();
  await expect(advanced.locator('#profileStartWeight')).toBeVisible();
});

test('moved operational controls still use the authoritative preferences autosave path', async ({page}) => {
  const advanced = page.locator('#profileOperationalDefaults');
  await advanced.locator('summary').click();
  await advanced.locator('#profileDensity').selectOption('compact');

  await expect.poll(() => page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('filament-user-v1:bill:preferences') || '{}');
    return value?.appearance?.density;
  })).toBe('compact');

  await expect(page.locator('html')).toHaveAttribute('data-profile-density','compact');
});
