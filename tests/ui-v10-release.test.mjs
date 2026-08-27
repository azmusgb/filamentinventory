import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('v10 client is published through browser, PWA, Netlify and CI contracts', async () => {
  const [html, assets, sw, netlify, ci] = await Promise.all([
    read('index.html'), read('scripts/public-assets.mjs'), read('sw.js'), read('netlify.toml'), read('.github/workflows/ci.yml')
  ]);
  assert.match(html, /\/ui-v10-client\.js/);
  assert.match(assets, /'ui-v10-client\.js'/);
  assert.match(sw, /\/ui-v10-client\.js/);
  assert.match(netlify, /for = "\/ui-v10-client\.js"/);
  assert.match(ci, /dist\/ui-v10-client\.js/);
});

test('v10.2 release advances the service-worker cache without changing schema', async () => {
  const [sw, version] = await Promise.all([read('sw.js'), read('app-version.js')]);
  assert.match(sw, /filament-inventory-v28/);
  assert.match(version, /APP_VERSION = '10\.2\.0'/);
  assert.match(version, /DATA_SCHEMA_VERSION = 10/);
});