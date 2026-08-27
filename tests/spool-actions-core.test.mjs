import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const core = require('../spool-actions-core.js');

test('measured remaining is authoritative over visual estimate', () => {
  const result = core.measurement({startWeight:1000, visualPercent:80, gross:640, tare:210});
  assert.deepEqual(result, {grams:430, percent:43, source:'Measured'});
});

test('active stored spool exposes the complete physical lifecycle without a second mutation engine', () => {
  const spool = {id:'S1', startWeight:1000, visualPercent:60, reorderThreshold:250, placementState:'Stored'};
  assert.deepEqual(core.actionsFor(spool).map(row => row.key), ['weigh','placement','empty','edit','label','link','archive']);
  assert.equal(core.actionsFor(spool).find(row => row.key === 'placement').label, 'Load / move');
  assert.equal(core.actionsFor(spool).find(row => row.key === 'empty').label, 'Mark empty');
  assert.equal(core.placementLabel(spool), 'Stored / unassigned');
});

test('loaded spool reports its physical destination and recommends placement control', () => {
  const spool = {id:'S2', startWeight:1000, gross:850, tare:200, reorderThreshold:250, placementState:'Loaded', printerName:'Bambu P1S', feederName:'AMS 1', feederSlot:'3'};
  assert.equal(core.isLoaded(spool), true);
  assert.equal(core.placementLabel(spool), 'Bambu P1S · AMS 1 · Slot 3');
  assert.equal(core.actionsFor(spool).find(row => row.key === 'placement').label, 'Move / unload');
  assert.equal(core.attentionFor(spool).key, 'loaded');
  assert.equal(core.primaryActionFor(spool).key, 'placement');
});

test('unknown remaining makes weighing the physical spool recommendation', () => {
  const spool = {id:'S3', placementState:'Stored', location:'Rack A'};
  assert.deepEqual(core.attentionFor(spool), {
    key:'measure',
    label:'Measurement needed',
    detail:'Remaining filament is unknown. Weigh this spool for a reliable amount.',
    tone:'warning',
    action:'weigh',
  });
  assert.equal(core.primaryActionFor(spool).key, 'weigh');
  assert.equal(core.remainingLabel(spool), 'Unknown');
  assert.equal(core.percentLabel(spool), '—');
});

test('low measured spool exposes reorder attention with exact physical amount', () => {
  const spool = {id:'S4', startWeight:1000, gross:410, tare:210, reorderThreshold:250, placementState:'Stored'};
  const attention = core.attentionFor(spool);
  assert.equal(attention.key, 'reorder');
  assert.equal(attention.tone, 'danger');
  assert.match(attention.detail, /200 g remaining/);
  assert.equal(core.remainingLabel(spool), '200 g');
  assert.equal(core.percentLabel(spool), '20%');
});

test('archived spool removes active mutations and exposes guarded lifecycle actions', () => {
  const spool = {id:'S5', archivedAt:'2026-08-27T12:00:00.000Z', placementState:'Loaded'};
  const actions = core.actionsFor(spool);
  assert.deepEqual(actions.map(row => row.key), ['restore','edit','label','link','delete']);
  assert.equal(core.isLoaded(spool), false);
  assert.equal(core.stockLabel(spool), 'Archived');
  assert.equal(actions.find(row => row.key === 'delete').kind, 'danger');
  assert.equal(core.primaryActionFor(spool).key, 'restore');
});

test('summary combines physical status, recommendation and placement without mutating the spool', () => {
  const spool = {id:'S6', brand:'Inland', material:'PLA+', colorName:'Black', colorHex:'#111827', startWeight:1000, gross:420, tare:200, reorderThreshold:250, location:'Rack A', updatedAt:'2026-08-27T12:00:00.000Z'};
  const before = structuredClone(spool);
  const summary = core.summary(spool);
  assert.equal(summary.grams, 220);
  assert.equal(summary.remainingLabel, '220 g');
  assert.equal(summary.percentLabel, '22%');
  assert.equal(summary.stock, 'Reorder');
  assert.equal(summary.placement, 'Rack A');
  assert.equal(summary.colorHex, '#111827');
  assert.equal(summary.attention.key, 'reorder');
  assert.equal(summary.primaryAction.key, 'weigh');
  assert.deepEqual(spool, before);
});