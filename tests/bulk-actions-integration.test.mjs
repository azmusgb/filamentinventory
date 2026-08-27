import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('browser loads bulk selectors before the bulk client and app', async () => {
  const html = await read('index.html');
  const names = ['bulk-actions-core.js','user-isolation.js','bulk-actions-client.js','app.js'];
  const positions = names.map(name => html.indexOf(`/${name}`));
  assert.ok(positions.every(value => value >= 0), 'all bulk-action assets must be browser-loaded');
  assert.deepEqual(positions, [...positions].sort((a,b) => a-b));
});

test('bulk mode provides explicit selection and safe batch actions', async () => {
  const client = await read('bulk-actions-client.js');
  for (const contract of ['data-bulk-start','data-bulk-visible','data-bulk-move','data-bulk-store','data-bulk-labels','data-bulk-archive','data-bulk-restore','bulkMoveDialog']) {
    assert.ok(client.includes(contract), `missing bulk interaction contract: ${contract}`);
  }
  assert.match(client, /confirm\(`Archive \$\{summary\.activeCount\}/);
  assert.match(client, /sessionStorage\.setItem\('filament-bulk-message'/);
});

test('bulk Select control uses an attribute-aware singleton guard', async () => {
  const client = await read('bulk-actions-client.js');
  assert.match(client, /document\.querySelector\('\[data-bulk-start\]'\)/);
  assert.doesNotMatch(client, /\$\('\[data-bulk-start\]'\)/);
});

test('bulk mutations are one logical inventory write so audit and isolation wrappers remain authoritative', async () => {
  const client = await read('bulk-actions-client.js');
  const writes = client.match(/localStorage\.setItem\(STORAGE_KEY/g) || [];
  assert.equal(writes.length, 1, 'bulk feature should centralize state persistence in one write helper');
  assert.doesNotMatch(client, /Storage\.prototype\.setItem\s*=/, 'bulk feature must not replace storage routing/audit wrappers');
  assert.doesNotMatch(client, /auditLog\s*=|tombstones\s*=/, 'bulk feature must let the authoritative audit/tombstone layers manage derived state');
});

test('bulk logical writes remain visible to the existing audit diff interceptor', async () => {
  const [bulkClient, auditClient] = await Promise.all([read('bulk-actions-client.js'), read('audit-client.js')]);
  assert.match(bulkClient, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(nextState\)\)/);
  assert.match(auditClient, /Storage\.prototype\.setItem = function\(key, value\)/);
  assert.match(auditClient, /api\.buildAuditEvents\(before, after/);
  assert.match(auditClient, /key !== STORAGE_KEY/);
});

test('bulk UI stays in the authoritative UI system and supports mobile safe areas', async () => {
  const css = await read('ui-system.css');
  assert.match(css, /\.fi-ui \.bulk-action-dock/);
  assert.match(css, /\.fi-ui \.bulk-select-control/);
  assert.match(css, /\.fi-ui \.bulk-move-dialog/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test('bulk QR labels reuse the existing label picker instead of a second QR engine', async () => {
  const client = await read('bulk-actions-client.js');
  for (const contract of ['.tab[data-view="labels"]','labelSearch','data-label-id','labelPreviewGrid']) assert.ok(client.includes(contract));
  assert.doesNotMatch(client, /\/qr\?spool=/, 'bulk feature should not generate QR URLs itself');
});

test('bulk QR preparation re-queries the live picker after each rerender', async () => {
  const client = await read('bulk-actions-client.js');
  assert.match(client, /function selectLabelsSequentially\(ids, index = 0\)/);
  assert.match(client, /clearLabelsBtn/);
  assert.match(client, /setTimeout\(\(\) => selectLabelsSequentially\(ids, index \+ 1\), 20\)/);
  assert.match(client, /\[\.\.\.document\.querySelectorAll\('\[data-label-id\]'\)\]\.find/);
  assert.doesNotMatch(client, /document\.querySelectorAll\('\[data-label-id\]'\)\.forEach/);
});

test('legacy shared-household audit copy is removed at the source', async () => {
  const audit = await read('audit-client.js');
  for (const stale of ['Shared household ledger','Household activity','Recent household activity','No household activity recorded yet.','Bill + Aimee']) {
    assert.equal(audit.includes(stale), false, `legacy shared copy remains: ${stale}`);
  }
});

test('PWA and CI publish bulk action assets while schema remains 10', async () => {
  const [assets, sw, ci, version] = await Promise.all([read('scripts/public-assets.mjs'), read('sw.js'), read('.github/workflows/ci.yml'), read('app-version.js')]);
  for (const file of ['bulk-actions-core.js','bulk-actions-client.js']) {
    assert.ok(assets.includes(`'${file}'`));
    assert.ok(sw.includes(`/${file}`));
    assert.ok(ci.includes(`dist/${file}`));
  }
  assert.match(sw, /const CACHE = 'filament-inventory-v\d+'/);
  assert.match(version, /DATA_SCHEMA_VERSION = 10/);
});
