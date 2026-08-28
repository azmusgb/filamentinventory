import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url),'utf8');

test('mobile primary navigation contains durable destinations plus Scan action and More disclosure', async () => {
  const js = await read('app-shell-client.js');
  assert.match(js,/Home<\/small>/);
  assert.match(js,/Inventory<\/small>/);
  assert.match(js,/Scan<\/small>/);
  assert.match(js,/Printer<\/small>/);
  assert.match(js,/More<\/small>/);
  assert.doesNotMatch(js,/data-bottom-view="weigh"/);
  assert.doesNotMatch(js,/data-bottom-view="history"/);
  assert.match(js,/fi-more-sheet/);
  assert.match(js,/\['Workflow',\[\['weigh','Weigh spool'\],\['print','Can I print this\?'\]\]\]/);
  assert.match(js,/\['Manage',\[\['history','Activity'\],\['labels','QR labels'\]\]\]/);
});

test('spool editing and inventory filtering use semantic progressive disclosure', async () => {
  const js = await read('app-shell-client.js');
  assert.match(js,/spool-form-essentials/);
  assert.match(js,/spool-form-advanced/);
  assert.match(js,/document\.createElement\('details'\)/);
  assert.match(js,/inventory-filter-dialog/);
  assert.match(js,/document\.createElement\('dialog'\)/);
  assert.match(js,/data-filter-reset/);
  assert.match(js,/data-filter-apply/);
});

test('empty Home and dashboard reporting remain intentionally compact', async () => {
  const [dashboard, v11] = await Promise.all([read('css/components/dashboard.css'),read('css/components/v11.css')]);
  assert.match(dashboard,/\.dashboard-view\[data-empty="true"\] \.metrics/);
  assert.match(v11,/\.fi-home-empty/);
  assert.doesNotMatch(dashboard,/!important/);
  assert.doesNotMatch(v11,/!important/);
});

test('V11 disclosure assets are published', async () => {
  const assets = await read('scripts/public-assets.mjs');
  assert.match(assets,/'css\/components\/dashboard\.css'/);
  assert.match(assets,/'css\/components\/v11\.css'/);
  assert.match(assets,/'app-shell-client\.js'/);
});
