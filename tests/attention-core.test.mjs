import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const attention = require('../attention-core.js');

const measured = (overrides={}) => ({
  id:'S1',
  material:'PLA',
  startWeight:1000,
  reorderThreshold:250,
  quantityEvidence:[{
    evidenceId:'qe-current',
    spoolId:'S1',
    method:'Measured',
    grossGrams:700,
    tareGrams:200,
    observedAt:'2026-09-20T12:00:00Z',
    confidence:'Confirmed',
  }],
  placement:{kind:'stored',source:'operator',observedAt:'2026-09-20T12:00:00Z'},
  ...overrides,
});

const usageEvent=(eventId,observedAt,consumedGrams=100,extra={})=>({
  eventId,
  spoolId:'S1',
  printerId:'p1s',
  printJobId:eventId,
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

test('unknown quantity produces one actionable weigh signal', () => {
  const rows=attention.buildAttention({
    profile:'Bill',
    spools:[{
      id:'S1',
      quantityEvidence:[{evidenceId:'u',spoolId:'S1',method:'Unknown',observedAt:'2026-09-20T12:00:00Z'}],
      placement:{kind:'stored',source:'operator',observedAt:'2026-09-20T12:00:00Z'},
    }],
  },{now:Date.parse('2026-09-20T18:00:00Z')});
  assert.equal(rows.length,1);
  assert.equal(rows[0].kind,'quantity-unknown');
  assert.equal(rows[0].action,'weigh');
});

test('conflicting quantity evidence suppresses routine low-stock and forecast messaging', () => {
  const spool=measured({
    quantityEvidence:[
      {evidenceId:'a',spoolId:'S1',method:'Measured',grossGrams:420,tareGrams:200,observedAt:'2026-09-20T12:00:00Z'},
      {evidenceId:'b',spoolId:'S1',method:'Measured',grossGrams:360,tareGrams:200,observedAt:'2026-09-20T12:02:00Z'},
    ],
  });
  const rows=attention.buildAttention({profile:'Bill',spools:[spool],usageEvents:[
    usageEvent('u1','2026-09-01T12:00:00Z'),
    usageEvent('u2','2026-09-10T12:00:00Z'),
    usageEvent('u3','2026-09-19T12:00:00Z'),
  ]},{now:Date.parse('2026-09-20T12:03:00Z'),forecastHorizonDays:30});
  assert.equal(rows.some(row=>row.kind==='quantity-conflict'),true);
  assert.equal(rows.some(row=>row.kind==='low-stock'),false);
  assert.equal(rows.some(row=>row.kind==='forecast-reorder'),false);
});

test('current measured low stock produces one reorder signal and suppresses redundant forecast signal', () => {
  const spool=measured({
    quantityEvidence:[{evidenceId:'qe-current',spoolId:'S1',method:'Measured',grossGrams:420,tareGrams:200,observedAt:'2026-09-20T12:00:00Z'}],
  });
  const rows=attention.buildAttention({profile:'Bill',spools:[spool],usageEvents:[
    usageEvent('u1','2026-09-01T12:00:00Z'),
    usageEvent('u2','2026-09-10T12:00:00Z'),
    usageEvent('u3','2026-09-19T12:00:00Z'),
  ]},{now:Date.parse('2026-09-20T18:00:00Z'),forecastHorizonDays:30});
  const low=rows.filter(row=>row.kind==='low-stock');
  assert.equal(low.length,1);
  assert.equal(low[0].action,'reorder');
  assert.equal(low[0].remainingGrams,220);
  assert.equal(rows.some(row=>row.kind==='forecast-reorder'),false);
});

test('incomplete explicit loaded placement is surfaced as a critical placement conflict', () => {
  const spool=measured({
    placement:{kind:'ams',printerId:'p1s',source:'operator',observedAt:'2026-09-20T12:00:00Z'},
  });
  const rows=attention.buildAttention({profile:'Bill',spools:[spool]},{now:Date.parse('2026-09-20T18:00:00Z')});
  const conflict=rows.find(row=>row.kind==='placement-conflict');
  assert.ok(conflict);
  assert.equal(conflict.severity,'critical');
  assert.equal(conflict.action,'verify');
});

test('forecast reorder signal requires evidence count, span, current quantity, and a near action window', () => {
  const usageEvents=[
    usageEvent('u1','2026-08-20T12:00:00Z'),
    usageEvent('u2','2026-08-28T12:00:00Z'),
    usageEvent('u3','2026-09-05T12:00:00Z'),
    usageEvent('u4','2026-09-12T12:00:00Z'),
    usageEvent('u5','2026-09-19T12:00:00Z'),
  ];
  const spool=measured({
    reorderThreshold:250,
    quantityEvidence:[{evidenceId:'qe-current',spoolId:'S1',method:'Measured',grossGrams:650,tareGrams:200,observedAt:'2026-09-20T12:00:00Z'}],
  });
  const rows=attention.buildAttention(
    {profile:'Bill',spools:[spool],usageEvents},
    {now:Date.parse('2026-09-20T18:00:00Z'),forecastHorizonDays:30,leadTimeDays:3,minForecastEvents:3,minForecastSpanDays:7},
  );
  const forecast=rows.find(row=>row.kind==='forecast-reorder');
  assert.ok(forecast);
  assert.deepEqual(forecast.evidenceEventIds,['u1','u2','u3','u4','u5']);
  assert.equal(forecast.quantityEvidenceId,'qe-current');
  assert.ok(forecast.orderByDate);
  assert.ok(forecast.depletionDate);
});

test('insufficient usage history produces no forecast alert', () => {
  const rows=attention.buildAttention({
    profile:'Bill',
    spools:[measured()],
    usageEvents:[usageEvent('u1','2026-09-19T12:00:00Z')],
  },{now:Date.parse('2026-09-20T18:00:00Z'),forecastHorizonDays:30});
  assert.equal(rows.some(row=>row.kind==='forecast-reorder'),false);
});

test('notification transitions emit only new or materially changed signals', () => {
  const current=[{key:'quantity-unknown:s1',kind:'quantity-unknown',spoolId:'S1',severity:'warning',action:'weigh',message:'Weigh it'}];
  assert.equal(attention.notificationTransitions([],current).length,1);
  assert.equal(attention.notificationTransitions(current,current).length,0);
  const changed=[{...current[0],severity:'critical',action:'verify'}];
  assert.equal(attention.notificationTransitions(current,changed).length,1);
});

test('suppression blocks delivery until expiry without deleting the underlying condition', () => {
  const row={key:'low-stock:s1',kind:'low-stock',spoolId:'S1',severity:'warning',action:'reorder',message:'Reorder'};
  const suppressions=attention.suppressionMap({},row.key,'2026-09-22T00:00:00Z');
  assert.equal(attention.notificationTransitions([], [row], {now:Date.parse('2026-09-21T00:00:00Z'),suppressions}).length,0);
  assert.equal(attention.notificationTransitions([], [row], {now:Date.parse('2026-09-23T00:00:00Z'),suppressions}).length,1);
});
