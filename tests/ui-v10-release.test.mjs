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

test('v10 UI preserves the current release and schema authorities', async () => {
  const [pkg, version] = await Promise.all([read('package.json'), read('app-version.js')]);
  const packageVersion = JSON.parse(pkg).version;
  const appVersion = version.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/u)?.[1];
  const schemaVersion = Number(version.match(/DATA_SCHEMA_VERSION\s*=\s*(\d+)/u)?.[1]);

  assert.equal(appVersion, packageVersion, 'app-version.js must agree with package.json');
  assert.equal(schemaVersion, 10, 'CSS/UI work must not change the data schema');
});
