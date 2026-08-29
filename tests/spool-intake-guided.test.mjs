import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('guided spool intake keeps the existing spool model authoritative while adding reusable choices', async () => {
  const source = await read('spool-intake-client.js');
  assert.match(source, /const STORAGE_KEY = 'filament-inventory-v1'/);
  assert.doesNotMatch(source, /localStorage\.setItem/, 'guided UI must not create a second state writer');
  for (const field of ['brand','material','colorName','location','purchaseSource']) assert.ok(source.includes(`${field}:Object.freeze`) || source.includes(`${field}: Object.freeze`), `missing guided field ${field}`);
  assert.match(source, /Other \/ custom…/);
  assert.match(source, /learned\(field\)/);
  assert.match(source, /Use the Printer page for loaded AMS \/ feeder placement/);
});

test('guided spool intake supports fast repeat entry without copying quantity or placement evidence', async () => {
  const source = await read('spool-intake-client.js');
  assert.match(source, /Save & add another/);
  assert.match(source, /Duplicate as new/);
  assert.match(source, /const TEMPLATE_FIELDS = Object\.freeze\(\['brand','material','colorName','colorHex','spoolType','startWeight','confidence','reorderThreshold'\]\)/);
  for (const unsafe of ['visualPercent','gross','tare','placementV8','printerV8','feederV8','slotV8']) {
    assert.ok(!source.match(new RegExp(`TEMPLATE_FIELDS[^;]*${unsafe}`)), `duplicate template must not copy ${unsafe}`);
  }
  assert.match(source, /recentTemplates\(\)/);
  assert.match(source, /data-spool-template/);
  assert.match(source, /Product details only — never quantity or printer placement/);
  assert.match(source, /reopenAfterSave/);
  assert.match(source, /form\.requestSubmit\(submit\)/);
});

test('guided spool intake exposes profile defaults, next-required guidance and a post-save continuation path', async () => {
  const source = await read('spool-intake-client.js');
  assert.match(source, /profilePreferences\(\)/);
  assert.match(source, /defaultStartWeight/);
  assert.match(source, /defaultReorderGrams/);
  assert.match(source, /Next: \$\{GUIDED\[next\]\.shortLabel\}/);
  assert.match(source, /What next\?/);
  assert.match(source, /Weigh now/);
  assert.match(source, /Open spool/);
  assert.match(source, /Add another/);
  assert.match(source, /FilamentInventorySpoolActions\?\.open/);
  assert.match(source, /FilamentInventoryNavigation\?\.navigate\?\.\('weigh'/);
});

test('guided spool intake exposes quick quantity, color and size choices with responsive mobile controls', async () => {
  const [source,css,assets] = await Promise.all([
    read('spool-intake-client.js'),
    read('css/components/spool-intake.css'),
    read('scripts/public-assets.mjs'),
  ]);
  assert.match(source, /Starting filament quick choices/);
  assert.match(source, /Visual estimate quick choices/);
  assert.match(source, /Common filament colors/);
  assert.match(css, /\.spool-number-choices/);
  assert.match(css, /\.spool-color-presets/);
  assert.match(css, /\.spool-template-strip/);
  assert.match(css, /\.spool-next-dialog/);
  assert.match(css, /@media \(max-width:640px\)/);
  assert.ok(assets.includes("'spool-intake-client.js'"));
  assert.ok(assets.includes("'css/components/spool-intake.css'"));
});