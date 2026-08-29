import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read = p => readFile(new URL(`../${p}`, import.meta.url),'utf8');

test('Printer AMS component reserves mobile navigation space and separates metric typography', async () => {
  const css = await read('css/components/printer.css');
  assert.match(css,/padding-bottom:\s*calc\(76px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css,/\.printer-metric strong\s*\{[^}]*display:\s*block/s);
  assert.match(css,/\.printer-metric span,.printer-metric small\s*\{\s*display:\s*block/s);
});

test('Printer AMS component has explicit print simplification', async () => {
  const css = await read('css/components/printer.css');
  assert.match(css,/@media print/);
  assert.match(css,/\.printer-form\s*\{\s*display:none/);
  assert.match(css,/\.printer-layout:last-child\s*\{[^}]*display:none/);
});

test('Printer AMS component is published and activated', async () => {
  const [assets, bootstrap] = await Promise.all([read('scripts/public-assets.mjs'), read('app-version.js')]);
  for (const asset of ['css/components/printer.css','css/components/printer-ams.css']) {
    assert.ok(assets.includes(`'${asset}'`), `${asset} must be published`);
    assert.ok(bootstrap.includes(`'/${asset}'`), `${asset} must be registered by the component style loader`);
  }
  assert.match(bootstrap,/function|ensureComponentStyles/);
  assert.match(bootstrap,/link\.rel = 'stylesheet'/);
  assert.match(bootstrap,/root\.document\.head\.append\(link\)/);
});
