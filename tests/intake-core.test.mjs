import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const intake = require('../intake-core.js');

const state = {
  spools:[
    {id:'S1',brand:'Inland',material:'PLA+',colorName:'Black',spoolType:'Cardboard',startWeight:1000,tare:215,location:'Rack A',purchaseSource:'Micro Center',updatedAt:'2026-08-20T10:00:00Z'},
    {id:'S2',brand:'Inland',material:'PLA+',colorName:'White',spoolType:'Cardboard',startWeight:1000,tare:220,location:'Rack A',purchaseSource:'Micro Center',updatedAt:'2026-08-21T10:00:00Z'},
    {id:'S3',brand:'Polymaker',material:'PLA',colorName:'Black',spoolType:'Cardboard',startWeight:750,tare:190,location:'Dry box',updatedAt:'2026-08-22T10:00:00Z'},
    {id:'S4',brand:'Unknown',material:'Unknown',colorName:'Unknown',spoolType:'Plastic',startWeight:1000,archivedAt:'2026-08-01T00:00:00Z'},
  ]
};

test('suggestions rank active repeated private inventory values and omit unknown/archive noise', () => {
  const suggestions = intake.suggestions(state);
  assert.equal(suggestions.brands[0], 'Inland');
  assert.equal(suggestions.locations[0], 'Rack A');
  assert.equal(suggestions.purchaseSources[0], 'Micro Center');
  assert.equal(suggestions.brands.includes('Unknown'), false);
});

test('recent presets surface useful private spool patterns by recency without duplicate combinations', () => {
  const presets = intake.recentPresets(state, 4);
  assert.equal(presets[0].id, 'S3');
  assert.equal(presets[0].brand, 'Polymaker');
  assert.equal(presets[1].brand, 'Inland');
  assert.equal(presets.filter(row => row.brand === 'Inland').length, 1);
  assert.equal(presets.some(row => row.brand === 'Unknown'), false);
});

test('preferred defaults remember common private storage and purchase source', () => {
  assert.deepEqual(intake.preferredDefaults(state), {location:'Rack A',purchaseSource:'Micro Center'});
});

test('duplicate candidate requires matching brand material and color and ignores archived rows', () => {
  const matches = intake.duplicateCandidates(state, {brand:'inland',material:'pla+',colorName:'black'});
  assert.deepEqual(matches.map(spool => spool.id), ['S1']);
  assert.deepEqual(intake.duplicateCandidates(state, {brand:'Inland',material:'PLA+',colorName:'Blue'}), []);
});

test('tare inference prefers similar brand and spool format without inventing a measured value', () => {
  const inferred = intake.inferredTare(state, {brand:'Inland',material:'PLA+',spoolType:'Cardboard'});
  assert.deepEqual(inferred, {grams:218,samples:2,confidence:'high'});
  assert.equal(intake.inferredTare(state, {brand:'New Brand',spoolType:'Spoolless / refill'}), null);
});

test('starting-weight inference learns nominal spool amount from matching inventory', () => {
  const inferred = intake.inferredStartWeight(state, {brand:'Inland',material:'PLA+',spoolType:'Cardboard'});
  assert.deepEqual(inferred, {grams:1000,samples:2,confidence:'high'});
  assert.equal(intake.inferredStartWeight(state, {brand:'New Brand',spoolType:'Spoolless / refill'}), null);
});

test('add-another template preserves reusable batch metadata but excludes color and measurements', () => {
  const template = intake.templateFromDraft({brand:'Inland',material:'PETG+',spoolType:'Cardboard',startWeight:'1000',location:'Rack B',purchaseSource:'Micro Center',purchaseDate:'2026-08-26',reorderThreshold:'300',placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'2',colorName:'Blue',gross:'800',tare:'220'});
  assert.equal(template.brand, 'Inland');
  assert.equal(template.material, 'PETG+');
  assert.equal(template.startWeight, 1000);
  assert.equal(template.purchaseDate, '2026-08-26');
  assert.equal('colorName' in template, false);
  assert.equal('gross' in template, false);
  assert.equal('tare' in template, false);
});
