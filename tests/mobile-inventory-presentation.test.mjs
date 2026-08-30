import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobile inventory presentation is published and available offline', async () => {
  const [assets,sw,navigation] = await Promise.all([
    read('scripts/public-assets.mjs'),
    read('sw.js'),
    read('navigation-architecture.js'),
  ]);
  for (const asset of ['inventory-card-client.js','css/components/inventory-mobile.css']) {
    assert.ok(assets.includes(`'${asset}'`), `${asset} must be published`);
    assert.ok(sw.includes(`'/${asset}'`), `${asset} must be precached`);
  }
  assert.match(sw,/const CACHE = 'filament-inventory-v\d+'/);
  assert.match(navigation,/ensurePresentationAssets/);
  assert.match(navigation,/inventory-mobile\.css/);
  assert.match(navigation,/inventory-card-client\.js/);
});

test('compact cards distinguish quantity evidence from identification confidence', async () => {
  const source = await read('inventory-card-client.js');
  for (const evidence of ['Measured','Visual estimate','Unknown']) assert.ok(source.includes(`'${evidence}'`), `missing evidence label ${evidence}`);
  assert.match(source,/Identification confidence:/);
  assert.match(source,/Not measured/);
  assert.match(source,/progress\.hidden = evidence\.tone === 'unknown'/);
});

test('card body opens details while title and ellipsis remain distinct accessible controls', async () => {
  const source = await read('inventory-card-client.js');
  assert.match(source,/button\.dataset\.inventoryCardMenu = id/);
  assert.match(source,/delete button\.dataset\.spoolActionsOpen/);
  assert.match(source,/title\.dataset\.spoolPrimaryOpen = id/);
  assert.match(source,/title instanceof HTMLButtonElement/);
  assert.match(source,/card\.removeAttribute\('role'\)/);
  assert.match(source,/card\.dataset\.cohesionOpen = '1'/);
  assert.match(source,/openSpool\(primary\.dataset\.spoolPrimaryOpen,'inventory-card-title'\)/);
  assert.match(source,/openSpool\(card\.dataset\.primarySpoolOpen,'inventory-card'\)/);
  assert.match(source,/inventoryCardQuickActionsDialog/);
  for (const action of ['Open details','Weigh','Printer / AMS','QR label','Edit','Archive']) {
    assert.ok(source.includes(action), `missing quick action: ${action}`);
  }
});

test('inventory presentation CSS reduces density while preserving visible focus and trust state', async () => {
  const [mobile,physical] = await Promise.all([
    read('css/components/inventory-mobile.css'),
    read('css/components/physical-spool.css'),
  ]);
  assert.match(mobile,/@media \(max-width: 640px\)/);
  assert.match(mobile,/\.inventory-command-hint\s*\{\s*display: none/);
  assert.match(mobile,/\.fi-page-header-actions\s*\{[^}]*width: auto/s);
  assert.match(mobile,/\.spool-action-bar\s*\{\s*display: none/);
  assert.match(mobile,/\.bulk-selection-mode[^}]*\.spool-card-more\s*\{\s*display: none/);
  assert.match(mobile,/\.inventory-evidence-chip\[data-evidence="measured"\]/);
  assert.match(mobile,/\.inventory-evidence-chip\[data-evidence="estimated"\]/);
  assert.match(mobile,/\.inventory-evidence-chip\[data-evidence="unknown"\]/);
  assert.match(physical,/\.spool-card-primary:focus-visible/);
  assert.match(physical,/\.inventory-card-menu-dialog/);
  assert.doesNotMatch(mobile,/!important/);
  assert.doesNotMatch(physical,/!important/);
});
