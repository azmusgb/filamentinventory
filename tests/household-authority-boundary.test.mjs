import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../household-client.js', import.meta.url), 'utf8');

test('household summary consumes canonical inventory semantics', () => {
  assert.match(source,/FilamentInventorySpoolContract/);
  assert.match(source,/spoolContract\?\.normalizeSpool/);
  assert.match(source,/spoolContract\?\.measurement/);
  assert.match(source,/spoolContract\?\.reorderNeeded/);
  assert.match(source,/spoolContract\?\.normalizeState/);
});

test('household summary has no independent physical-placement editor', () => {
  assert.match(source,/This household view is read-only for physical state/);
  assert.match(source,/Manage placement in Printer/);
  assert.doesNotMatch(source,/id="placementV8"/);
  assert.doesNotMatch(source,/id="printerV8"/);
  assert.doesNotMatch(source,/id="feederV8"/);
  assert.doesNotMatch(source,/id="slotV8"/);
  assert.doesNotMatch(source,/id="loadSpoolV8"/);
  assert.doesNotMatch(source,/id="storeSpoolV8"/);
});

test('household summary cannot directly transfer ownership', () => {
  assert.match(source,/Ownership transfer remains gated until the member-scoped migration is complete/);
  assert.doesNotMatch(source,/data-v8-transfer/);
  assert.doesNotMatch(source,/function transferOwner/);
  assert.doesNotMatch(source,/spool\.owner=normalizeOwner/);
});

test('placement actions hand off to the canonical Printer surface', () => {
  assert.match(source,/data-v8-manage-placement/);
  assert.match(source,/function navigatePrinter\(id=''/);
  assert.match(source,/\.tab\[data-view="printer"\]/);
  assert.match(source,/FilamentInventoryPrinterUI\?\.openLoad/);
  assert.match(source,/typeof openLoad === 'function'/);
  assert.match(source,/openLoad\(id\)/);
});

test('unknown placement is rendered as unknown rather than silently stored', () => {
  assert.match(source,/placementState:'Unknown'/);
  assert.match(source,/Placement unknown · verify/);
  assert.match(source,/const hh=normalizeHousehold\(s\)/);
  assert.match(source,/loadedLabel\(\{\.\.\.s,\.\.\.hh\}\)/);
});
