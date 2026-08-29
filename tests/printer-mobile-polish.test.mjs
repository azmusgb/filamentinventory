import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobile Printer removes the redundant hero and uses one compact metric strip', async () => {
  const css = await read('css/components/printer.css');
  assert.match(css, /@media \(max-width:620px\)[\s\S]*?\.printer-hero \{ display:none; \}/);
  assert.match(css, /\.printer-metrics \{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\);[\s\S]*?gap:0;/);
  assert.match(css, /\.printer-metric small \{ display:none; \}/);
});

test('mobile Printer keeps one actionable printer card and compresses empty states', async () => {
  const css = await read('css/components/printer.css');
  assert.match(css, /\.printer-registry-actions \{[\s\S]*?grid-template-columns:1fr 1fr;/);
  assert.match(css, /\.printer-registry-main p \{ display:none; \}/);
  assert.match(css, /\.printer-board \.printer-empty > \.btn \{ display:none; \}/);
  assert.match(css, /\.printer-panel:has\(#printerAttention \.printer-empty\) \{ display:none; \}/);
});

test('small phones retain a two-column printer spec summary rather than returning to a tall list', async () => {
  const css = await read('css/components/printer.css');
  assert.match(css, /@media \(max-width:420px\)[\s\S]*?\.printer-spec-grid \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\); \}/);
});
