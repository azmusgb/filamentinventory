import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Smart Weigh loads pure planning before its client and before app measurement mutations', async () => {
  const html = await read('index.html');
  const order = ['intake-core.js','weigh-core.js','user-isolation.js','weigh-client.js','app.js'].map(name => html.indexOf(`/${name}`));
  assert.ok(order.every(index => index >= 0), 'all Smart Weigh assets must be browser-loaded');
  assert.deepEqual(order, [...order].sort((a,b) => a-b));
});

test('Smart Weigh enhances the existing weigh form instead of creating a second save engine', async () => {
  const [client, app] = await Promise.all([read('weigh-client.js'), read('app.js')]);
  assert.match(client, /\$\('weighForm'\)/);
  assert.match(client, /form\.addEventListener\('submit'/);
  assert.match(client, /setTimeout\(handleSuccessfulSubmit, 100\)/);
  assert.match(app, /function saveMeasurement\(event\)/);
  assert.match(app, /weighLog\.push\(normalizeLogEntry/);
  assert.doesNotMatch(client, /localStorage\.setItem\(/, 'Smart Weigh must never persist inventory state itself');
  assert.doesNotMatch(client, /weighLog\.push|spool\.gross\s*=|spool\.tare\s*=/, 'measurement mutations stay in app.js');
});

test('tare guidance reuses Smart Intake inference and requires an explicit use action', async () => {
  const client = await read('weigh-client.js');
  assert.match(client, /FilamentInventoryIntake/);
  assert.match(client, /inferredTare/);
  assert.match(client, /core\.tareSuggestion/);
  assert.match(client, /data-weigh-use-tare/);
  assert.match(client, /Use \$\{Math\.round\(suggestion\.grams\)\} g/);
  assert.doesNotMatch(client, /tareWeight'\)\.value\s*=\s*suggestion\.grams/, 'inference cannot silently populate tare');
});

test('Smart Weigh exposes quick choices next-to-measure ranking and live reorder impact', async () => {
  const client = await read('weigh-client.js');
  for (const contract of ['weighQuickChoices','weighNextQueue','core.quickSpools','core.nextToMeasure','core.reasonFor','weighImpactV103','core.preview']) {
    assert.ok(client.includes(contract), `missing Smart Weigh contract: ${contract}`);
  }
  assert.match(client, /Reorder attention/);
  assert.match(client, /Above threshold/);
});

test('successful measurement follow-up supports next measurement and Physical Spool Mode', async () => {
  const client = await read('weigh-client.js');
  assert.match(client, /weighNextDialog/);
  assert.match(client, /data-weigh-next="next"/);
  assert.match(client, /data-weigh-next="spool"/);
  assert.match(client, /FilamentInventorySpoolActions\?\.open\?\.\(id\)/);
  assert.match(client, /dataset\.nextSpoolId/);
});

test('Smart Weigh composes existing UI-system primitives instead of adding runtime or parallel CSS', async () => {
  const [client, css] = await Promise.all([read('weigh-client.js'), read('ui-system.css')]);
  assert.doesNotMatch(client, /createElement\(['"]style['"]\)|injectStyles|style\.textContent/);
  for (const primitive of ['quick-list','quick-item','quick-button','qr-private-note','calc','calc-row','spool-action-dialog','spool-action-grid']) {
    assert.ok(client.includes(primitive), `Smart Weigh should compose existing primitive: ${primitive}`);
  }
  for (const selector of ['.quick-item','.calc','.spool-action-dialog','.spool-action-grid']) {
    assert.ok(css.includes(selector), `authoritative UI system must own primitive: ${selector}`);
  }
});

test('PWA and CI publish Smart Weigh while the feature remains schema 10', async () => {
  const [assets, sw, ci, netlify, version] = await Promise.all([
    read('scripts/public-assets.mjs'), read('sw.js'), read('.github/workflows/ci.yml'), read('netlify.toml'), read('app-version.js'),
  ]);
  for (const file of ['weigh-core.js','weigh-client.js']) {
    assert.ok(assets.includes(`'${file}'`));
    assert.ok(sw.includes(`/${file}`));
    assert.ok(ci.includes(`dist/${file}`));
    assert.ok(netlify.includes(`for = "/${file}"`));
  }
  assert.match(version, /DATA_SCHEMA_VERSION = 10/);
});
