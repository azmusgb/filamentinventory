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
  assert.match(sw,/filament-inventory-v40/);
  assert.match(navigation,/ensurePresentationAssets/);
  assert.match(navigation,/inventory-mobile\.css/);
  assert.match(navigation,/inventory-card-client\.js/);
});

test('compact cards distinguish quantity evidence from identification confidence', async () => {
  const source = await read('inventory-card-client.js');
  for (const evidence of ['Measured','Visual estimate','Unknown']) assert.ok(source.includes(`'${evidence}'`), `missing evidence label ${evidence}`);
  assert.match(source,/Identification confidence:/);
  assert.match(source,/button\.dataset\.spoolActionsOpen = id/);
  assert.match(source,/Not measured/);
  assert.match(source,/progress\.hidden = evidence\.tone === 'unknown'/);
});

test('mobile inventory CSS reduces control and card density without hiding trust state', async () => {
  const css = await read('css/components/inventory-mobile.css');
  assert.match(css,/@media \(max-width: 640px\)/);
  assert.match(css,/\.inventory-command-hint\s*\{\s*display: none/);
  assert.match(css,/\.fi-page-header-actions\s*\{[^}]*width: auto/s);
  assert.match(css,/\.spool-action-bar\s*\{\s*display: none/);
  assert.match(css,/\.bulk-selection-mode[^}]*\.spool-card-more\s*\{\s*display: none/);
  assert.doesNotMatch(css,/!important/);
  assert.match(css,/\.inventory-evidence-chip\[data-evidence="measured"\]/);
  assert.match(css,/\.inventory-evidence-chip\[data-evidence="estimated"\]/);
  assert.match(css,/\.inventory-evidence-chip\[data-evidence="unknown"\]/);
});
