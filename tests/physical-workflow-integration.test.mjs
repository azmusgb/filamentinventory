import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('bootstrap loads physical workflow core before its client', async () => {
  const source = await read('app-version.js');
  const coreIndex = source.indexOf('/physical-workflow-core.js');
  const clientIndex = source.indexOf('/physical-workflow-client.js');
  assert.notEqual(coreIndex, -1);
  assert.notEqual(clientIndex, -1);
  assert.ok(coreIndex < clientIndex);
  assert.match(source, /ensurePhysicalWorkflowRuntime/);
});

test('physical workflow assets are published and precached', async () => {
  const [assets, serviceWorker] = await Promise.all([
    read('scripts/public-assets.mjs'),
    read('sw.js'),
  ]);
  for (const asset of ['physical-workflow-core.js','physical-workflow-client.js','css/components/physical-workflow.css']) {
    assert.ok(assets.includes(`'${asset}'`), `${asset} must be published`);
    assert.ok(serviceWorker.includes(`'/${asset}'`), `${asset} must be precached`);
  }
});

test('physical workflow UI connects scan detail, printer evidence, weigh evidence and use recording', async () => {
  const source = await read('physical-workflow-client.js');
  assert.ok(source.includes('spoolActionDialog'));
  assert.ok(source.includes('.printer-slot'));
  assert.ok(source.includes('weighEvidenceStatus'));
  assert.ok(source.includes('data-physical-mark-used'));
  assert.ok(source.includes("FilamentInventoryEvents?.emit('spool:used'"));
});

test('workflow CSS keeps detail progressive and mobile friendly', async () => {
  const css = await read('css/components/physical-workflow.css');
  assert.match(css, /physical-workflow-steps/);
  assert.match(css, /physical-workflow-details/);
  assert.match(css, /@media \(max-width:559px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
