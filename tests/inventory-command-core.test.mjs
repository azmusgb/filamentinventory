import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const command = require('../inventory-command-core.js');

const state = {
  spools:[
    {id:'S001',startWeight:1000,gross:420,tare:220,reorderThreshold:250,placementState:'Loaded',updatedAt:'2026-08-27T10:00:00Z'},
    {id:'S002',startWeight:1000,visualPercent:60,placementState:'Stored',updatedAt:'2026-08-27T11:00:00Z'},
    {id:'S003',startWeight:1000,visualPercent:null,gross:null,tare:null,placementState:'Stored',updatedAt:'2026-08-27T12:00:00Z'},
    {id:'S004',startWeight:1000,visualPercent:10,reorderThreshold:150,placementState:'Stored',updatedAt:'2026-08-27T09:00:00Z'},
    {id:'S005',startWeight:1000,visualPercent:80,archivedAt:'2026-08-26T00:00:00Z',placementState:'Loaded',updatedAt:'2026-08-27T13:00:00Z'},
  ],
};

test('measurement prioritizes gross minus tare over visual estimate', () => {
  const measured = command.measurement({startWeight:1000,gross:700,tare:200,visualPercent:90});
  assert.deepEqual(measured, {grams:500,percent:50,source:'Measured'});
});

test('summary reports active operational counts without archived leakage', () => {
  const summary = command.summarize(state);
  assert.equal(summary.activeCount, 4);
  assert.equal(summary.archivedCount, 1);
  assert.equal(summary.knownCount, 3);
  assert.equal(summary.knownGrams, 900);
  assert.equal(summary.reorderCount, 2);
  assert.equal(summary.measurementCount, 1);
  assert.equal(summary.loadedCount, 1);
});

test('quick modes select deterministic private inventory slices', () => {
  assert.deepEqual(command.selectMode(state,'reorder').map(row => row.id), ['S004','S001']);
  assert.deepEqual(command.selectMode(state,'measure').map(row => row.id), ['S003']);
  assert.deepEqual(command.selectMode(state,'loaded').map(row => row.id), ['S001']);
  assert.deepEqual(command.selectMode(state,'recent',2).map(row => row.id), ['S003','S002']);
  assert.equal(command.selectMode(state,'all').some(row => row.id === 'S005'), false);
});

test('mode counts are bounded to active inventory', () => {
  assert.deepEqual(command.modeCounts(state), {all:4,reorder:2,measure:1,loaded:1,recent:4});
});

test('filter tokens omit default lifecycle and sort while retaining meaningful filters', () => {
  assert.deepEqual(command.filterTokens({search:'black',material:'PLA+',status:'',location:'Rack A',lifecycle:'active',sort:'id'}), [
    {key:'search',label:'Search',value:'black'},
    {key:'material',label:'Material',value:'PLA+'},
    {key:'location',label:'Location',value:'Rack A'},
  ]);
});
