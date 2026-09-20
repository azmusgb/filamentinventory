import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const contract = require('../spool-contract-core.js');
const readiness = require('../print-readiness-core.js');

test('canonical spool identity and resource scope preserve private-by-default ownership', () => {
  const state = contract.normalizeState({
    profile:'Bill',
    household:{
      householdId:'workshop-home',
      members:[
        {memberId:'bill',displayName:'Bill'},
        {memberId:'aimee',displayName:'Aimee'},
      ],
    },
    spools:[{
      id:'S-001',
      ownerMemberId:'bill',
      visibility:'Private',
      material:'PLA',
    }],
  });
  assert.equal(state.household.householdId,'workshop-home');
  assert.equal(state.spools[0].spoolId,'S-001');
  assert.equal(state.spools[0].ownerMemberId,'bill');
  assert.equal(state.spools[0].visibility,'Private');
  assert.deepEqual(state.spools[0].sharedWithMemberIds,[]);
});

test('shared resource scope is explicit and rejects members outside the household', () => {
  const result = contract.validateState({
    profile:'Bill',
    household:{
      householdId:'home',
      members:[{memberId:'bill'},{memberId:'aimee'}],
    },
    spools:[{
      id:'S-002',
      ownerMemberId:'bill',
      visibility:'Shared',
      sharedWithMemberIds:['aimee','outsider'],
    }],
  });
  assert.equal(result.valid,false);
  assert.equal(result.errors.some(row=>row.code==='spool-share-member-missing' && row.memberId==='outsider'),true);
});

test('canonical AMS placement requires explicit printer feeder and slot identifiers', () => {
  const valid = contract.normalizeSpool({
    id:'S-AMS',
    placement:{kind:'ams',printerId:'p1s',feederId:'ams-1',slot:2,source:'operator',observedAt:'2026-09-20T12:00:00Z'},
  });
  assert.equal(valid.placement.state,'Loaded');
  assert.equal(valid.placement.status,'Current');
  assert.equal(valid.placement.verificationRequired,false);
  assert.equal(valid.placement.printerId,'p1s');
  assert.equal(valid.placement.feederId,'ams-1');
  assert.equal(valid.placement.slot,2);

  const invalid = contract.normalizeSpool({
    id:'S-BAD',
    placement:{kind:'ams',printerId:'p1s',source:'telemetry',observedAt:'2026-09-20T12:00:00Z'},
  });
  assert.equal(invalid.placement.status,'Conflict');
  assert.equal(invalid.placement.verificationRequired,true);
});

test('external spool path is represented explicitly and never invents an AMS slot', () => {
  const spool = contract.normalizeSpool({
    id:'S-EXT',
    placement:{kind:'external',printerId:'p1s',source:'operator',observedAt:'2026-09-20T12:00:00Z'},
  });
  assert.equal(spool.placement.state,'Loaded');
  assert.equal(spool.placement.external,true);
  assert.equal(spool.placement.feederId,null);
  assert.equal(spool.placement.slot,null);
  assert.equal(spool.placement.status,'Current');
});

test('state validation rejects two spools in one canonical physical slot', () => {
  const result = contract.validateState({
    profile:'Bill',
    spools:[
      {id:'S1',placement:{kind:'ams',printerId:'p1s',feederId:'ams-1',slot:1}},
      {id:'S2',placement:{kind:'ams',printerId:'p1s',feederId:'ams-1',slot:1}},
    ],
  });
  assert.equal(result.valid,false);
  assert.equal(result.errors.some(row=>row.code==='slot-conflict'),true);
});

test('usage events are normalized, evidence-addressable, and validate spool references', () => {
  const state = contract.normalizeState({
    profile:'Bill',
    spools:[{id:'S1'}],
    usageEvents:[
      {eventId:'u1',spoolId:'S1',beforeGrams:700,afterGrams:650,source:'Printer',observedAt:'2026-09-18T12:00:00Z'},
      {eventId:'u2',spoolId:'S1',consumedGrams:75,source:'Reported',observedAt:'2026-09-20T12:00:00Z',quantityEvidenceIds:['qe-1','qe-2']},
    ],
  });
  assert.equal(state.usageEvents.length,2);
  assert.equal(state.usageEvents[0].consumedGrams,50);
  assert.deepEqual(state.usageEvents[1].quantityEvidenceIds,['qe-1','qe-2']);

  const invalid = contract.validateState({
    profile:'Bill',
    spools:[{id:'S1'}],
    usageEvents:[{eventId:'bad',spoolId:'S404',consumedGrams:10,observedAt:'2026-09-20T12:00:00Z'}],
  });
  assert.equal(invalid.valid,false);
  assert.equal(invalid.errors.some(row=>row.code==='usage-event-spool-missing'),true);
});

test('forecasting remains undetermined without current quantity evidence', () => {
  const spool = contract.normalizeSpool({id:'S1'});
  const forecast = contract.usageForecast(spool,[
    {eventId:'u1',spoolId:'S1',consumedGrams:50,observedAt:'2026-09-18T12:00:00Z'},
    {eventId:'u2',spoolId:'S1',consumedGrams:50,observedAt:'2026-09-20T12:00:00Z'},
  ],Date.parse('2026-09-20T12:00:00Z'));
  assert.equal(forecast.status,'Undetermined');
  assert.equal(forecast.reason,'quantity-evidence-not-current');
});

test('forecasting is deterministic and traceable when current quantity and history are evidence-backed', () => {
  const spool = contract.normalizeSpool({
    id:'S1',
    quantityEvidence:[{
      evidenceId:'qe-current',
      method:'Measured',
      grossGrams:700,
      tareGrams:200,
      source:'scale',
      observedAt:'2026-09-20T12:00:00Z',
    }],
  });
  const forecast = contract.usageForecast(spool,[
    {eventId:'u1',spoolId:'S1',consumedGrams:50,source:'Printer',observedAt:'2026-09-18T12:00:00Z'},
    {eventId:'u2',spoolId:'S1',consumedGrams:50,source:'Printer',observedAt:'2026-09-20T12:00:00Z'},
  ],Date.parse('2026-09-20T12:00:00Z'));
  assert.equal(forecast.status,'Projected');
  assert.equal(forecast.dailyGrams,50);
  assert.equal(forecast.daysRemaining,10);
  assert.equal(forecast.quantityEvidenceId,'qe-current');
  assert.deepEqual(forecast.eventIds,['u1','u2']);
});

test('print readiness consumes canonical placement and blocks verification-required loaded state', () => {
  const clean = contract.normalizeSpool({
    id:'S1',
    material:'PLA',
    colorName:'Black',
    quantityEvidence:[{
      evidenceId:'qe-1',
      method:'Measured',
      grossGrams:800,
      tareGrams:200,
      observedAt:'2026-09-20T12:00:00Z',
    }],
    placement:{kind:'ams',printerId:'p1s',feederId:'ams-1',slot:1,source:'operator',observedAt:'2026-09-20T12:00:00Z'},
  });
  const evaluated = readiness.evaluate([clean],{material:'PLA',color:'Black',grams:400},Date.parse('2026-09-20T12:10:00Z'));
  assert.equal(evaluated.recommended.loaded,true);
  assert.equal(evaluated.recommended.verificationRequired,false);

  const conflicted = contract.normalizeSpool({
    ...clean,
    id:'S2',
    placement:{kind:'ams',printerId:'p1s',source:'telemetry',observedAt:'2026-09-20T12:00:00Z'},
  });
  const result = readiness.evaluate([conflicted],{material:'PLA',color:'Black',grams:400},Date.parse('2026-09-20T12:10:00Z'));
  assert.equal(result.recommended.verificationRequired,true);
});

test('archiving clears canonical placement and prevents a loaded archived state', () => {
  const spool = contract.normalizeSpool({
    id:'S-ARCH',
    archivedAt:'2026-09-20T12:00:00Z',
    placement:{kind:'ams',printerId:'p1s',feederId:'ams-1',slot:3},
  });
  assert.equal(spool.placement.state,'Stored');
  assert.equal(spool.placementState,'Stored');
});
