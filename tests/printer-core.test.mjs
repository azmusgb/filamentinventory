import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const printer = require('../printer-core.js');

const state = {
  spools: [
    {id:'S1',material:'PLA',colorName:'Black',placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'1',gross:320,tare:200,startWeight:1000,reorderThreshold:250},
    {id:'S2',material:'PETG',colorName:'Blue',placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'2',visualPercent:80,startWeight:1000,reorderThreshold:250},
    {id:'S3',material:'PLA',colorName:'White',placementState:'Stored',gross:900,tare:200,startWeight:1000,reorderThreshold:250},
    {id:'S4',material:'PLA',colorName:'Black',placementState:'Loaded',printerName:'A1',feederName:'AMS Lite',feederSlot:'1',startWeight:1000,reorderThreshold:250},
    {id:'OLD',archivedAt:'2026-01-01T00:00:00Z',placementState:'Stored'},
  ],
};

test('printer groups model loaded physical assignments only', () => {
  const groups = printer.printerGroups(state);
  assert.deepEqual(groups.map(group => group.printer), ['A1','P1S']);
  assert.deepEqual(groups.find(group => group.printer === 'P1S').rows.map(row => row.id), ['S1','S2']);
});

test('summary surfaces low and unknown loaded filament', () => {
  const summary = printer.summary(state);
  assert.equal(summary.active, 4);
  assert.equal(summary.loaded, 3);
  assert.equal(summary.printers, 2);
  assert.deepEqual(summary.lowLoaded.map(row => row.id), ['S1']);
  assert.deepEqual(summary.unknownLoaded.map(row => row.id), ['S4']);
  assert.equal(summary.knownLoadedGrams, 920);
});

test('duplicate physical slot assignments are detected explicitly', () => {
  const conflicted = structuredClone(state);
  conflicted.spools.push({id:'S5',placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'1'});
  const conflicts = printer.slotConflicts(conflicted);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].map(row => row.id), ['S1','S5']);
});

test('candidate ranking favors requested material, usable remaining filament and stored spools', () => {
  const ranked = printer.rankedCandidates(state, {material:'PLA',color:'White'});
  assert.equal(ranked[0].spool.id, 'S3');
  assert.equal(ranked.some(row => row.spool.id === 'OLD'), false);
});
