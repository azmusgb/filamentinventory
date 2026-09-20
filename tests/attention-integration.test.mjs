import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('browser loads canonical spool contract before attention and dashboard', async () => {
  const html = await read('index.html');
  const contract = html.indexOf('/spool-contract-core.js');
  const attention = html.indexOf('/attention-core.js');
  const dashboard = html.indexOf('/personal-dashboard.js');
  assert.ok(contract >= 0);
  assert.ok(attention > contract);
  assert.ok(dashboard > attention);
  assert.equal(html.includes('/usage-forecast-core.js'),false);
  assert.equal(html.includes('/household-core.js'),false);
});

test('Workshop Inbox is driven by evidence-aware attention rather than the legacy low/unknown-only queue', async () => {
  const source = await read('personal-dashboard.js');
  assert.match(source,/FilamentInventoryAttention/);
  assert.match(source,/buildAttention/);
  assert.match(source,/forecastHorizonDays:7/);
  assert.doesNotMatch(source,/core\(\)\.workshopInbox\(snapshot,owner,99\)/);
});

test('attention core is present in deploy, offline cache, and exact build gates', async () => {
  const [assets,sw,netlify,ci] = await Promise.all([
    read('scripts/public-assets.mjs'),
    read('sw.js'),
    read('netlify.toml'),
    read('.github/workflows/ci.yml'),
  ]);
  assert.match(assets,/'attention-core\.js'/);
  assert.match(sw,/\/attention-core\.js/);
  assert.match(netlify,/\/attention-core\.js/);
  assert.match(ci,/dist\/attention-core\.js/);
});
