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

test('compact cards use canonical evidence and make remaining amount primary', async () => {
  const source = await read('inventory-card-client.js');
  assert.match(source,/FilamentInventorySpoolContract/);
  assert.match(source,/contract\.workflowSummary/);
  for (const evidence of ['Measured · scale','Estimated · usage','Estimated · visual','Unknown · verify']) {
    assert.ok(source.includes(`'${evidence}'`), `missing evidence label ${evidence}`);
  }
  assert.match(source,/className = 'inventory-quantity-primary'/);
  assert.match(source,/className = 'inventory-quantity-amount'/);
  assert.match(source,/className = 'inventory-quantity-percent'/);
  assert.match(source,/Amount unknown/);
  assert.match(source,/`≈\$\{Math\.round\(Number\(measurement\.grams\)\)\} g`/);
  assert.match(source,/progress\.setAttribute\('role','progressbar'\)/);
});

test('stock, placement and identification attention remain independent of quantity evidence', async () => {
  const source = await read('inventory-card-client.js');
  assert.match(source,/ID_ATTENTION = new Set\(\['Medium','Low','Unknown'\]\)/);
  assert.match(source,/stock === 'Low'/);
  assert.match(source,/stateChip\('Low stock','low'\)/);
  assert.match(source,/stateChip\('Loaded','loaded'\)/);
  assert.match(source,/Stored · \$\{spool\.location \|\| 'Unassigned'\}/);
  assert.match(source,/inventory-id-chip/);
  assert.match(source,/badge\.hidden = true/);
  assert.match(source,/card\.dataset\.stockState/);
  assert.match(source,/card\.dataset\.placementState/);
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

test('inventory presentation CSS expresses evidence authority before physical state', async () => {
  const [mobile,physical] = await Promise.all([
    read('css/components/inventory-mobile.css'),
    read('css/components/physical-spool.css'),
  ]);
  assert.match(mobile,/@media \(max-width: 640px\)/);
  assert.match(mobile,/\.inventory-command-hint\s*\{\s*display: none/);
  assert.match(mobile,/\.fi-page-header-actions\s*\{[^}]*width: auto/s);
  assert.match(mobile,/\.spool-action-bar\s*\{\s*display: none/);
  assert.match(mobile,/\.bulk-selection-mode[^}]*\.spool-card-more\s*\{\s*display: none/);
  assert.match(mobile,/\.inventory-quantity-primary/);
  assert.match(mobile,/\.inventory-quantity-amount/);
  assert.match(mobile,/\.inventory-evidence-chip\[data-evidence="measured"\]/);
  assert.match(mobile,/\.inventory-evidence-chip\[data-evidence="estimated"\]/);
  assert.match(mobile,/\.inventory-evidence-chip\[data-evidence="unknown"\]/);
  assert.match(mobile,/\.inventory-state-chip\[data-state="low"\]/);
  assert.match(mobile,/\.inventory-state-chip\[data-state="loaded"\]/);
  assert.match(mobile,/\.inventory-placement/);
  assert.match(mobile,/\.inventory-id-chip/);
  assert.match(physical,/\.spool-card-primary:focus-visible/);
  assert.match(physical,/\.inventory-card-menu-dialog/);
  assert.doesNotMatch(mobile,/!important/);
  assert.doesNotMatch(physical,/!important/);
});
