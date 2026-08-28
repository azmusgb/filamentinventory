import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('app bootstrap loads the canonical spool core before the client bridge', async () => {
  const source = await read('app-version.js');
  const coreIndex = source.indexOf("/spool-contract-core.js");
  const clientIndex = source.indexOf("/spool-contract-client.js");
  assert.notEqual(coreIndex, -1);
  assert.notEqual(clientIndex, -1);
  assert.ok(coreIndex < clientIndex);
  assert.match(source, /coreReady\s*\.then/);
});

test('canonical spool runtime is included in the public build and offline shell', async () => {
  const [assets, serviceWorker] = await Promise.all([
    read('scripts/public-assets.mjs'),
    read('sw.js'),
  ]);
  for (const asset of ['spool-contract-core.js', 'spool-contract-client.js']) {
    assert.ok(assets.includes(`'${asset}'`), `${asset} must be published`);
    assert.ok(serviceWorker.includes(`'/${asset}'`), `${asset} must be precached`);
  }
  assert.match(serviceWorker, /filament-inventory-v38/);
});

test('client bridge adds richer product fields and protects full-fidelity import/export', async () => {
  const source = await read('spool-contract-client.js');
  for (const id of ['productLineV11','diameterV11','manufacturerSkuV11','lotBatchV11']) {
    assert.ok(source.includes(id), `${id} must be wired into the spool editor`);
  }
  assert.ok(source.includes('Product Line'));
  assert.ok(source.includes('Measurement Source'));
  assert.ok(source.includes('Physical State'));
  assert.ok(source.includes('canonicalizeState'));
  assert.ok(source.includes('pendingFormMeta'));
});
