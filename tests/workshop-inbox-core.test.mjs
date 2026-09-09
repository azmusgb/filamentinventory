import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const personal = require('../personal-core.js');

const state = {
  spools:[
    {
      id:'B-LOW', owner:'Bill', material:'PLA', colorName:'Black',
      gross:320, tare:250, startWeight:1000, reorderThreshold:250,
      placementState:'Stored', location:'Shelf A',
    },
    {
      id:'B-UNKNOWN', owner:'Bill', material:'PETG', colorName:'White',
      placementState:'Stored', location:'Dry box', updatedAt:'2026-09-01T12:00:00Z',
    },
    {
      id:'B-LOADED', owner:'Bill', material:'PLA', colorName:'Blue',
      gross:900, tare:250, startWeight:1000, placementState:'Loaded',
      printerName:'P1S', feederName:'AMS A', feederSlot:'2',
    },
    {
      id:'A-PRIVATE', owner:'Aimee', material:'PLA', colorName:'Red',
      placementState:'Stored', updatedAt:'2026-08-01T12:00:00Z',
    },
  ],
};

test('Workshop Inbox is profile scoped and contains only actionable evidence states', () => {
  const inbox = personal.workshopInbox(state, 'Bill', 10);
  assert.deepEqual(inbox.map(item => item.spoolId), ['B-LOW','B-UNKNOWN']);
  assert.equal(inbox.some(item => item.spoolId === 'A-PRIVATE'), false);
  assert.equal(inbox.some(item => item.spoolId === 'B-LOADED'), false);
});

test('low-stock Inbox item reports measured evidence without inventing placement', () => {
  const item = personal.workshopInbox(state, 'Bill', 10)[0];
  assert.equal(item.kind, 'low');
  assert.equal(item.detail, '70 g remaining · Measured');
  assert.equal(item.action, 'open');
  assert.equal(item.detail.includes('AMS'), false);
  assert.equal(item.detail.includes('Shelf'), false);
});

test('unknown quantity stays explicitly unknown and routes to weighing', () => {
  const item = personal.workshopInbox(state, 'Bill', 10).find(row => row.spoolId === 'B-UNKNOWN');
  assert.ok(item);
  assert.equal(item.kind, 'unknown');
  assert.equal(item.detail, 'Quantity unknown · No trusted quantity evidence');
  assert.equal(item.action, 'weigh');
  assert.equal(item.actionLabel, 'Weigh spool');
});

test('Workshop status derives only from the current profile summary', () => {
  const bill = personal.workshopStatus(state, 'Bill');
  assert.equal(bill.state, 'attention');
  assert.equal(bill.attentionCount, 2);

  const aimee = personal.workshopStatus(state, 'Aimee');
  assert.equal(aimee.state, 'attention');
  assert.equal(aimee.attentionCount, 1);
});

test('evidence labels distinguish measured, estimate, and unknown', () => {
  assert.equal(personal.evidenceLabel({gross:900,tare:250,startWeight:1000}), 'Measured');
  assert.equal(personal.evidenceLabel({startWeight:1000,visualPercent:50}), 'Visual estimate');
  assert.equal(personal.evidenceLabel({}), 'Unknown');
});

test('healthy inventory status is scoped and never claims print readiness', () => {
  const healthyState = {
    spools:[{
      id:'HEALTHY', owner:'Bill', material:'PLA', colorName:'Green',
      gross:1000, tare:250, startWeight:1000, reorderThreshold:200,
      placementState:'Loaded', printerName:'P1S', feederName:'AMS A', feederSlot:'1',
    }],
  };
  const status = personal.workshopStatus(healthyState, 'Bill');
  assert.equal(status.state, 'healthy');
  assert.equal(status.label, 'INVENTORY HEALTHY');
  assert.equal(status.title, 'No inventory actions need attention');
  assert.match(status.detail, /Print readiness is evaluated separately/);
  assert.equal(status.attentionCount, 0);
});
