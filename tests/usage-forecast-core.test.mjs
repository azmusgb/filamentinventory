import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const contract = require('../spool-contract-core.js');

const currentSpool = (overrides={}) => ({
  id:'S1',
  material:'PLA',
  startWeight:1000,
  reorderThreshold:250,
  quantityEvidence:[{
    evidenceId:'qe-current',
    spoolId:'S1',
    method:'Measured',
    grossGrams:800,
    tareGrams:200,
    observedAt:'2026-09-20T12:00:00Z',
    confidence:'Confirmed',
  }],
  ...overrides,
});

const event = (eventId, observedAt, consumedGrams=100, extra={}) => contract.normalizeUsageEvent({
  eventId,
  spoolId:'S1',
  printerId:'P1S',
  printJobId:eventId.replace(/^usage-/,'print-'),
  beforeGrams:700,
  afterGrams:700-consumedGrams,
  consumedGrams,
  source:'Reported',
  observedAt,
  confidence:'Medium',
  beforeEvidenceId:'qe-start',
  afterEvidenceId:'qe-complete',
  ...extra,
});

test('canonical UsageEvent preserves physical quantity lineage and source metadata', () => {
  const row=event('usage-print-1','2026-09-01T12:00:00Z',150);
  assert.equal(row.eventId,'usage-print-1');
  assert.equal(row.spoolId,'S1');
  assert.equal(row.consumedGrams,150);
  assert.equal(row.beforeEvidenceId,'qe-start');
  assert.equal(row.afterEvidenceId,'qe-complete');
  assert.deepEqual(row.quantityEvidenceIds,['qe-start','qe-complete']);
});

test('appendUsageEvent is idempotent and conflicting durable IDs fail closed', () => {
  const row=event('usage-1','2026-09-01T12:00:00Z',100);
  const first=contract.appendUsageEvent({usageEvents:[]},row);
  assert.equal(first.changed,true);
  const again=contract.appendUsageEvent(first.state,row);
  assert.equal(again.changed,false);
  assert.equal(again.reason,'usage-event-exists');
  const conflict=contract.appendUsageEvent(first.state,event('usage-1','2026-09-01T12:00:00Z',90));
  assert.equal(conflict.changed,false);
  assert.equal(conflict.reason,'usage-event-id-conflict');
});

test('forecast refuses unknown or verification-required current quantity', () => {
  const unknown=contract.usageForecast({id:'S1'},[],Date.parse('2026-09-20T18:00:00Z'));
  assert.equal(unknown.status,'Undetermined');
  assert.equal(unknown.reason,'quantity-evidence-not-current');

  const conflicted=currentSpool({quantityEvidence:[
    {evidenceId:'a',spoolId:'S1',method:'Measured',grossGrams:800,tareGrams:200,observedAt:'2026-09-20T12:00:00Z'},
    {evidenceId:'b',spoolId:'S1',method:'Measured',grossGrams:700,tareGrams:200,observedAt:'2026-09-20T12:02:00Z'},
  ]});
  const blocked=contract.usageForecast(conflicted,[
    event('u1','2026-09-01T12:00:00Z'),
    event('u2','2026-09-10T12:00:00Z'),
    event('u3','2026-09-19T12:00:00Z'),
  ],Date.parse('2026-09-20T18:00:00Z'),{minEvents:3,minSpanDays:7});
  assert.equal(blocked.status,'Undetermined');
  assert.equal(blocked.reason,'quantity-evidence-not-current');
});

test('forecast policy requires enough event count and time span', () => {
  const spool=currentSpool();
  const two=[event('u1','2026-09-01T12:00:00Z'),event('u2','2026-09-10T12:00:00Z')];
  const tooFew=contract.usageForecast(spool,two,Date.parse('2026-09-20T18:00:00Z'),{minEvents:3,minSpanDays:7});
  assert.equal(tooFew.status,'Undetermined');
  assert.equal(tooFew.reason,'insufficient-usage-history');

  const short=[event('u1','2026-09-18T12:00:00Z'),event('u2','2026-09-19T12:00:00Z'),event('u3','2026-09-20T12:00:00Z')];
  const tooShort=contract.usageForecast(spool,short,Date.parse('2026-09-20T18:00:00Z'),{minEvents:3,minSpanDays:7});
  assert.equal(tooShort.status,'Undetermined');
  assert.equal(tooShort.reason,'usage-window-too-short');
});

test('forecast is deterministic and cites every UsageEvent plus current quantity evidence', () => {
  const rows=[
    event('u1','2026-09-01T12:00:00Z'),
    event('u2','2026-09-05T12:00:00Z'),
    event('u3','2026-09-09T12:00:00Z'),
    event('other','2026-09-09T12:00:00Z',999,{spoolId:'S2'}),
  ];
  const result=contract.usageForecast(
    currentSpool(),
    rows,
    Date.parse('2026-09-10T12:00:00Z'),
    {minEvents:3,minSpanDays:7,reorderThresholdGrams:250,leadTimeDays:2},
  );
  assert.equal(result.status,'Projected');
  assert.equal(result.method,'historical-usage-rate');
  assert.equal(result.totalConsumedGrams,300);
  assert.equal(result.dailyGrams,37.5);
  assert.equal(result.daysRemaining,16);
  assert.deepEqual(result.eventIds,['u1','u2','u3']);
  assert.equal(result.quantityEvidenceId,'qe-current');
  assert.equal(result.reorderThresholdGrams,250);
  assert.equal(result.leadTimeDays,2);
  assert.equal(result.confidence,'Low');
  assert.ok(Date.parse(result.orderByDate) <= Date.parse(result.thresholdDate));
});
