import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const usage = require('../usage-forecast-core.js');

test('usage event preserves physical quantity lineage and source metadata', () => {
  const event = usage.normalizeUsageEvent({
    usageEventId:'usage-print-1',
    spoolId:'S1',
    printerId:'P1S',
    projectId:'print-1',
    beforeGrams:650,
    afterGrams:500,
    consumedGrams:150,
    source:'PrinterReported',
    observedAt:'2026-09-01T12:00:00Z',
    confidence:'Medium',
    beforeEvidenceId:'qe-start',
    afterEvidenceId:'qe-complete',
  });
  assert.equal(event.spoolId,'S1');
  assert.equal(event.consumedGrams,150);
  assert.equal(event.beforeEvidenceId,'qe-start');
  assert.equal(event.afterEvidenceId,'qe-complete');
  assert.equal(usage.validateUsageEvent(event).valid,true);
});

test('usage event rejects impossible physical deltas', () => {
  const result = usage.validateUsageEvent({
    usageEventId:'usage-bad',
    spoolId:'S1',
    beforeGrams:100,
    afterGrams:150,
    consumedGrams:25,
    source:'Manual',
    observedAt:'2026-09-01T12:00:00Z',
  });
  assert.equal(result.valid,false);
  assert.equal(result.errors.some(issue => issue.code === 'usage-after-exceeds-before'),true);
});

test('usage event append is idempotent and conflicting duplicate IDs fail closed', () => {
  const base = {
    usageEventId:'usage-1',
    spoolId:'S1',
    beforeGrams:500,
    afterGrams:400,
    consumedGrams:100,
    source:'PrinterReported',
    observedAt:'2026-09-01T12:00:00Z',
    beforeEvidenceId:'qe-a',
    afterEvidenceId:'qe-b',
  };
  const first = usage.appendUsageEvent({usageEvents:[]},base);
  assert.equal(first.changed,true);
  const second = usage.appendUsageEvent(first.state,base);
  assert.equal(second.changed,false);
  assert.equal(second.reason,'usage-event-exists');
  const conflict = usage.appendUsageEvent(first.state,{...base,consumedGrams:90});
  assert.equal(conflict.changed,false);
  assert.equal(conflict.reason,'usage-event-id-conflict');
  assert.equal(conflict.valid,false);
});

test('forecast refuses to predict from unknown or unverified current quantity', () => {
  assert.equal(usage.forecastDepletion({spoolId:'S1',remainingGrams:null,usageEvents:[]}).status,'unknown-remaining');
  assert.equal(usage.forecastDepletion({spoolId:'S1',remainingGrams:500,remainingStatus:'Conflict',verificationRequired:true,usageEvents:[]}).status,'verification-required');
});

test('forecast requires enough events and enough time span instead of fabricating precision', () => {
  const events = [
    {usageEventId:'u1',spoolId:'S1',consumedGrams:100,source:'PrinterReported',observedAt:'2026-09-01T12:00:00Z'},
    {usageEventId:'u2',spoolId:'S1',consumedGrams:100,source:'PrinterReported',observedAt:'2026-09-02T12:00:00Z'},
  ];
  assert.equal(usage.forecastDepletion({spoolId:'S1',remainingGrams:500,usageEvents:events,minEvents:3,minSpanDays:7}).status,'insufficient-evidence');

  const three = [...events,{usageEventId:'u3',spoolId:'S1',consumedGrams:100,source:'PrinterReported',observedAt:'2026-09-03T12:00:00Z'}];
  assert.equal(usage.forecastDepletion({spoolId:'S1',remainingGrams:500,usageEvents:three,minEvents:3,minSpanDays:7}).status,'insufficient-span');
});

test('forecast is deterministic and cites every usage event used', () => {
  const events = [
    {usageEventId:'u1',spoolId:'S1',consumedGrams:100,source:'PrinterReported',observedAt:'2026-09-01T12:00:00Z'},
    {usageEventId:'u2',spoolId:'S1',consumedGrams:100,source:'PrinterReported',observedAt:'2026-09-05T12:00:00Z'},
    {usageEventId:'u3',spoolId:'S1',consumedGrams:100,source:'PrinterReported',observedAt:'2026-09-09T12:00:00Z'},
    {usageEventId:'other',spoolId:'S2',consumedGrams:999,source:'PrinterReported',observedAt:'2026-09-09T12:00:00Z'},
  ];
  const result = usage.forecastDepletion({
    spoolId:'S1',
    remainingGrams:600,
    remainingEvidenceId:'qe-current',
    remainingStatus:'Current',
    usageEvents:events,
    reorderThresholdGrams:250,
    leadTimeDays:2,
    now:new Date('2026-09-10T12:00:00Z'),
    minEvents:3,
    minSpanDays:7,
  });
  assert.equal(result.status,'forecast');
  assert.equal(result.method,'historical-usage-rate');
  assert.equal(result.totalConsumedGrams,300);
  assert.equal(result.spanDays,8);
  assert.equal(result.dailyGrams,37.5);
  assert.equal(result.daysRemaining,16);
  assert.deepEqual(result.evidenceEventIds,['u1','u2','u3']);
  assert.equal(result.remainingEvidenceId,'qe-current');
  assert.equal(result.confidence,'Low');
});

test('completed print can be converted to a traceable usage event', () => {
  const event = usage.usageEventFromCompletedPrint({
    job:{
      id:'print-abc',
      spoolId:'S9',
      remainingAtStart:600,
      remainingAfter:475,
      consumedGrams:125,
      completedAt:'2026-09-10T12:00:00Z',
      quantityEvidenceAtStart:{evidenceId:'qe-start'},
      completionEvidenceId:'qe-complete',
    },
    spool:{id:'S9',printerName:'P1S'},
    afterEvidence:{evidenceId:'qe-complete',remainingGrams:475},
  });
  assert.equal(event.usageEventId,'usage-print-abc');
  assert.equal(event.spoolId,'S9');
  assert.equal(event.printerId,'P1S');
  assert.equal(event.beforeGrams,600);
  assert.equal(event.afterGrams,475);
  assert.equal(event.consumedGrams,125);
  assert.equal(event.beforeEvidenceId,'qe-start');
  assert.equal(event.afterEvidenceId,'qe-complete');
});
