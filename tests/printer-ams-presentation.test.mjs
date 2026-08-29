import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('navigation loader publishes the AMS-first printer presentation', async () => {
  const nav = await read('navigation-architecture.js');
  const assets = await read('scripts/public-assets.mjs');
  const sw = await read('sw.js');
  assert.match(nav, /printer-ams\.css/);
  assert.match(nav, /printer-ams-client\.js/);
  assert.match(assets, /css\/components\/printer-ams\.css/);
  assert.match(assets, /printer-ams-client\.js/);
  assert.match(sw, /filament-inventory-v40/);
  assert.match(sw, /printer-ams\.css/);
  assert.match(sw, /printer-ams-client\.js/);
});

test('AMS board renders physical configured slots and progressive spool actions', async () => {
  const client = await read('printer-ams-client.js');
  assert.match(client, /core\.slotsForFeeder\(feeder\)/);
  assert.match(client, /data-ams-empty-slot/);
  assert.match(client, /data-spool-actions-open/);
  assert.match(client, /Not measured/);
  assert.match(client, /Weigh required/);
  assert.match(client, /ams-attention-banner/);
  assert.doesNotMatch(client, /printer-slot-actions/);
});

test('AMS mobile layout stays a two-column physical board with hidden legacy attention', async () => {
  const css = await read('css/components/printer-ams.css');
  assert.match(css, /\.ams-slot-grid \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.ams-legacy-attention-panel \{ display:none; \}/);
  assert.match(css, /\.ams-slot-more/);
  assert.match(css, /\.ams-slot-empty/);
});
