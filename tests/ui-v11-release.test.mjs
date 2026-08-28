import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('V11 design assets are published through browser, build and PWA contracts', async () => {
  const [html, assets, sw, bridge] = await Promise.all([
    read('index.html'), read('scripts/public-assets.mjs'), read('sw.js'), read('ui-v10-client.js'),
  ]);
  assert.match(html, /href="\/css\/tokens\.css"/);
  assert.match(html, /href="\/css\/components\/v11\.css"/);
  assert.match(assets, /'css\/components\/v11\.css'/);
  assert.match(assets, /'css\/components\/v11-workflows\.css'/);
  assert.match(sw, /\/css\/components\/v11\.css/);
  assert.match(sw, /\/css\/components\/v11-workflows\.css/);
  assert.match(sw, /const CACHE = 'filament-inventory-v\d+'/);
  assert.match(bridge, /\/css\/components\/v11-workflows\.css/);
});

test('V11 retains its compatibility bridge without restoring V10 presentation authority', async () => {
  const [html, assets, sw, bridge] = await Promise.all([
    read('index.html'), read('scripts/public-assets.mjs'), read('sw.js'), read('ui-v10-client.js'),
  ]);
  assert.match(html, /\/ui-v10-client\.js/);
  assert.match(assets, /'ui-v10-client\.js'/);
  assert.match(sw, /\/ui-v10-client\.js/);
  assert.match(bridge, /retired:true/);
});

test('V11 UI preserves current release and schema authorities', async () => {
  const [pkg, version] = await Promise.all([read('package.json'), read('app-version.js')]);
  const packageVersion = JSON.parse(pkg).version;
  const appVersion = version.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/u)?.[1];
  const schemaVersion = Number(version.match(/DATA_SCHEMA_VERSION\s*=\s*(\d+)/u)?.[1]);
  assert.equal(appVersion, packageVersion, 'app-version.js must agree with package.json');
  assert.equal(schemaVersion, 10, 'V11 presentation work must not change the data schema');
});
