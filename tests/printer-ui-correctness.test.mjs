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

test('Printer AMS component is a published build asset', async () => {
  const assets = await read('scripts/public-assets.mjs');
  assert.match(assets,/'css\/components\/printer\.css'/);
});
