import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read = path => readFile(new URL(`../${path}`, import.meta.url),'utf8');

test('mobile primary navigation contains durable destinations only', async () => {
  const js = await read('ui-v10-client.js');
  assert.match(js,/Home<\/small>/);
  assert.match(js,/Spools<\/small>/);
  assert.match(js,/Printer<\/small>/);
  assert.match(js,/More<\/small>/);
  assert.doesNotMatch(js,/data-bottom-view="weigh"/);
  assert.doesNotMatch(js,/data-bottom-view="history"/);
});

test('dashboard component collapses nonessential empty-state reporting', async () => {
  const css = await read('css/components/dashboard.css');
  assert.match(css,/#dashboardView\[data-empty="true"\] \.metrics/);
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});

test('dashboard component is published', async () => {
  const assets = await read('scripts/public-assets.mjs');
  assert.match(assets,/'css\/components\/dashboard\.css'/);
});
