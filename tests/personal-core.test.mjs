import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { activeForOwner, isReorder, recentActivity, recommendedActions, remaining, summarizeOwner } = require('../personal-core.js');

const at = minute => `2026-08-27T06:${String(minute).padStart(2,'0')}:00.000Z`;
const spool = (id, owner, extra = {}) => ({id,owner,brand:'Inland',material:'PLA+',colorName:'Black',startWeight:1000,reorderThreshold:250,updatedAt:at(1),...extra});

const state = {
  spools:[
    spool('B001','Bill',{gross:380,tare:200,placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'1'}),
    spool('B002','Bill',{visualPercent:60}),
    spool('B003','Bill',{startWeight:1000}),
    spool('B004','Bill',{visualPercent:10,archivedAt:at(4)}),
    spool('A001','Aimee',{gross:900,tare:200}),
  ],
  auditLog:[
    {id:'e1',at:at(5),type:'measurement.saved',summary:'Bill measurement',actor:'Bill',owner:'Bill'},
    {id:'e2',at:at(6),type:'inventory.updated',summary:'Aimee edit',actor:'Aimee',owner:'Aimee'},
    {id:'e3',at:at(7),type:'ownership.transferred',summary:'Transferred to Bill',actor:'Aimee',owner:'Bill'},
  ]
};

test('measured remaining overrides visual and calculates percent', () => {
  const result = remaining({gross:600,tare:200,startWeight:1000,visualPercent:90});
  assert.equal(result.grams,400);
  assert.equal(result.percent,40);
  assert.equal(result.source,'measured');
});

test('owner selector excludes archived and other household owner', () => {
  assert.deepEqual(activeForOwner(state,'Bill').map(row=>row.id),['B001','B002','B003']);
  assert.deepEqual(activeForOwner(state,'Aimee').map(row=>row.id),['A001']);
});

test('summary produces owner-specific actionable counts', () => {
  const summary = summarizeOwner(state,'Bill');
  assert.equal(summary.activeCount,3);
  assert.equal(summary.loadedCount,1);
  assert.equal(summary.reorderCount,1);
  assert.equal(summary.unknownCount,1);
  assert.equal(Math.round(summary.knownGrams),780);
  assert.equal(summary.lowStock[0].spool.id,'B001');
  assert.equal(summary.needsMeasurement[0].id,'B003');
});

test('reorder calculation respects configured threshold', () => {
  assert.equal(isReorder(spool('S','Bill',{gross:449,tare:200,reorderThreshold:250})),true);
  assert.equal(isReorder(spool('S','Bill',{gross:451,tare:200,reorderThreshold:250})),false);
});

test('recommended actions prioritize reorder, unknown measurements and loaded state', () => {
  const actions = recommendedActions(state,'Bill');
  assert.deepEqual(actions.map(action=>action.kind),['reorder','measure','loaded']);
  assert.equal(actions[0].spoolId,'B001');
  assert.equal(actions[1].spoolId,'B003');
});

test('recent activity includes events acted by or belonging to the profile', () => {
  const bill = recentActivity(state,'Bill',5);
  assert.deepEqual(bill.map(row=>row.id),['e3','e1']);
  const aimee = recentActivity(state,'Aimee',5);
  assert.deepEqual(aimee.map(row=>row.id),['e3','e2']);
});