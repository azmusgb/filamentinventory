import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('AMS-first Printer runtime is published, loaded and available offline', async () => {
  const [version,assets,sw] = await Promise.all([
    read('app-version.js'),
    read('scripts/public-assets.mjs'),
    read('sw.js'),
  ]);
  assert.match(version,/APP_VERSION = '10\.3\.0'/);
  assert.ok(version.includes('/css/components/printer-ams.css'));
  assert.ok(version.includes("loadRuntimeScript('/printer-ams-ui.js')"));
  for (const asset of ['printer-ams-ui.js','css/components/printer-ams.css']) {
    assert.ok(assets.includes(`'${asset}'`),`${asset} must be published`);
    assert.ok(sw.includes(`'/${asset}'`),`${asset} must be precached`);
  }
});

test('AMS board renders configured feeder capacity including empty physical slots', async () => {
  const source = await read('printer-ams-ui.js');
  assert.match(source,/slotsForFeeder\(feeder\)/);
  assert.match(source,/slots\.map\(slot => slotCard/);
  assert.match(source,/ams-slot-empty/);
  assert.match(source,/data-ams-empty-load/);
  assert.match(source,/\$\{loaded\.length\} of \$\{slots\.length\} loaded/);
});

test('loaded slot actions use progressive disclosure and canonical spool actions', async () => {
  const source = await read('printer-ams-ui.js');
  assert.match(source,/<details class=\"ams-slot-actions\">/);
  for (const action of ['data-printer-weigh','data-printer-edit-load','data-printer-unload','data-spool-actions-open']) assert.ok(source.includes(action));
  assert.match(source,/Not measured/);
  assert.match(source,/Weigh required/);
  assert.match(source,/Visual estimate/);
  assert.match(source,/Measured/);
});

test('attention is promoted inline and the redundant attention panel is retired', async () => {
  const source = await read('printer-ams-ui.js');
  assert.match(source,/ams-inline-attention/);
  assert.match(source,/attentionPanel\.hidden = true/);
  assert.match(source,/data\.amsAttentionJump/);
  assert.match(source,/scrollIntoView/);
});

test('mobile AMS layout stays two-column with compact slot cards', async () => {
  const css = await read('css/components/printer-ams.css');
  assert.match(css,/\.ams-grid \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/@media \(max-width:620px\)[\s\S]*?\.ams-slot \{ min-height:132px;/);
  assert.match(css,/\.ams-slot-menu/);
  assert.match(css,/\.printer-details-prompt/);
});
