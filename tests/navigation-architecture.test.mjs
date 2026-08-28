import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('refined navigation preserves the authoritative mobile shell contract', async () => {
  const js = await read('navigation-architecture.js');
  for (const contract of [
    'data-bottom-view="dashboard"',
    'data-bottom-view="inventory"',
    'data-bottom-scan',
    'data-bottom-view="household"',
    'data-bottom-more',
    '<small>Home</small>',
    '<small>Scan</small>',
  ]) assert.ok(js.includes(contract), `missing stable mobile navigation contract: ${contract}`);
  assert.doesNotMatch(js, /<small>Overview<\/small>/);
  assert.doesNotMatch(js, /fiGlobalAddBtn/);
});

test('refined desktop navigation delegates routing and actions to app-shell-client', async () => {
  const js = await read('navigation-architecture.js');
  assert.match(js, /data-shell-view/);
  assert.match(js, /data-shell-action/);
  assert.match(js, /label:'Home'/);
  assert.match(js, /label:'Inventory'/);
  assert.match(js, /label:'Printer'/);
  assert.match(js, /label:'Activity'/);
  assert.doesNotMatch(js, /addEventListener\(['"]click['"]/);
});

test('refined navigation is published and available offline', async () => {
  const [assets, sw] = await Promise.all([read('scripts/public-assets.mjs'), read('sw.js')]);
  assert.match(assets, /'navigation-architecture\.js'/);
  assert.match(sw, /'\/navigation-architecture\.js'/);
});
