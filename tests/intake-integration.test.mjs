import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('browser publishes and loads smart intake around the existing household form and before app mutations', async () => {
  const [html, assets, sw] = await Promise.all([read('index.html'), read('scripts/public-assets.mjs'), read('sw.js')]);
  const core = html.indexOf('/intake-core.js');
  const household = html.indexOf('/household-client.js');
  const client = html.indexOf('/intake-client.js');
  const app = html.indexOf('/app.js');
  assert.ok(core >= 0 && household >= 0 && client > household && client < app, 'smart intake must layer after household fields and before app submit behavior');
  assert.match(assets, /'intake-core\.js'/);
  assert.match(assets, /'intake-client\.js'/);
  assert.match(sw, /\/intake-core\.js/);
  assert.match(sw, /\/intake-client\.js/);
});

test('v10.1 smart intake keeps the existing spool form authoritative and simplifies add to one save path', async () => {
  const source = await read('intake-client.js');
  assert.match(source, /spoolForm/);
  assert.match(source, /Save spool/);
  assert.doesNotMatch(source, /Save & weigh/);
  assert.doesNotMatch(source, /Save \+ another/);
  assert.match(source, /Possible duplicate/);
  assert.match(source, /Suggested empty-spool tare/);
  assert.match(source, /Typical starting amount/);
  assert.match(source, /data-intake-placement/);
  assert.doesNotMatch(source, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(\{.*spools:/s, 'intake client must not bypass the app mutation path');
});

test('successful add opens a post-save next-action sheet over existing workflows', async () => {
  const source = await read('intake-client.js');
  assert.match(source, /intakeNextDialog/);
  assert.match(source, /Weigh now/);
  assert.match(source, /Print QR label/);
  assert.match(source, /Load into Printer \/ AMS/);
  assert.match(source, /Add another like this/);
  assert.match(source, /navigateToWeigh/);
  assert.match(source, /navigateToLabels/);
  assert.match(source, /navigateToPrinter/);
  assert.match(source, /clearLabelsBtn/);
  assert.match(source, /moveSpoolV8/);
});

test('repeat entry and remembered defaults stay profile-local and safe for physical placement', async () => {
  const source = await read('intake-client.js');
  assert.match(source, /recentPresets/);
  assert.match(source, /preferredDefaults/);
  assert.match(source, /template\.placementState = 'Stored'/);
  assert.match(source, /template\.printerName = ''/);
  assert.match(source, /template\.feederName = ''/);
  assert.match(source, /template\.feederSlot = ''/);
  assert.match(source, /preservePurchaseDate:false/);
});

test('intake UI is private-profile aware and never introduces a second user selector', async () => {
  const source = await read('intake-client.js');
  assert.match(source, /currentUser\(\)/);
  assert.match(source, /private/);
  assert.doesNotMatch(source, /<option>Bill<\/option>/);
  assert.doesNotMatch(source, /<option>Aimee<\/option>/);
});
