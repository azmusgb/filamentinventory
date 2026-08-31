import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('profile preferences preserve isolation and autosave authority', async () => {
  const source = await read('profile-preferences-client.js');
  assert.match(source, /filament-user-v1/);
  assert.match(source, /preferences/);
  assert.match(source, /Saved automatically/);
  assert.match(source, /setTimeout\(\(\)=>\{saveTimer=0;persistForm\(\);\},450\)/);
  assert.match(source, /document\.addEventListener\('fi:navigation',flushPendingSave\)/);
  assert.match(source, /window\.addEventListener\('pagehide',flushPendingSave\)/);
});

test('profile page has summary navigation, live identity preview and progressive reset', async () => {
  const source = await read('profile-preferences-client.js');
  for (const token of [
    'profile-summary-card',
    'profile-section-nav',
    'profileSectionIdentity',
    'profileSectionAppearance',
    'profileSectionWorkspace',
    'profileSectionPrinting',
    'data-profile-auto-initials',
    'profile-reset-panel',
  ]) assert.ok(source.includes(token), `${token} must be present`);
  assert.match(source, /function previewIdentityDraft\(\)/);
  assert.match(source, /core\.initials\(display\)/);
});

test('appearance remains immediately previewable and offers visual accent choices', async () => {
  const source = await read('profile-preferences-client.js');
  assert.match(source, /function previewAppearance\(\)/);
  assert.match(source, /data-profile-accent-choice/);
  assert.match(source, /function chooseAccent\(accent\)/);
  for (const id of ['profileTheme','profileAccent','profileDensity']) assert.ok(source.includes(`id=\"${id}\"`));
});

test('profile switcher becomes a hub with current context and direct customization', async () => {
  const source = await read('profile-preferences-client.js');
  assert.match(source, /function enhanceProfileSwitcher\(\)/);
  assert.match(source, /Choose a private workspace/);
  assert.match(source, /profile-switch-current/);
  assert.match(source, /data-profile-manage-current/);
  assert.match(source, /Switch context without mixing inventory data/);
  assert.match(source, /currentOption.*stopImmediatePropagation/s);
});

test('profile styles provide responsive sticky summary, visual controls and mobile profile hub', async () => {
  const css = await read('css/components/profile-preferences.css');
  assert.match(css, /\.profile-summary-card \{ position:sticky/);
  assert.match(css, /\.profile-save-rail \{ position:sticky/);
  assert.match(css, /\.profile-accent-swatch/);
  assert.match(css, /\.profile-control-grid/);
  assert.match(css, /\.profile-switch-dialog-v2/);
  assert.match(css, /@media \(max-width:640px\)/);
});
