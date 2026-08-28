import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { buildAuditEvents, mergeAuditLogs, normalizeAuditLog } = require('../audit-core.js');

const at = minute => `2026-08-27T04:${String(minute).padStart(2,'0')}:00.000Z`;
const spool = (id, updatedAt, extra = {}) => ({
  id,
  brand:'Inland',
  material:'PLA+',
  colorName:'Black',
  owner:'Bill',
  placementState:'Stored',
  printerName:'',
  feederName:'',
  feederSlot:'',
  updatedAt,
  ...extra,
});
const job = (status, extra = {}) => ({
  id:'J1',spoolId:'S001',jobName:'Bracket',material:'PLA+',color:'Black',modelGrams:200,requiredGrams:220,
  status,plannedAt:at(5),updatedAt:at(5),...extra,
});

function context() {
  let n = 0;
  return { actor:'Bill', device:'iPhone', now:() => at(30), makeId:() => `evt-${++n}` };
}

test('records a new spool as one inventory addition', () => {
  const events = buildAuditEvents({spools:[],weighLog:[]}, {spools:[spool('S001',at(1))],weighLog:[]}, context());
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'inventory.added');
  assert.equal(events[0].spoolId, 'S001');
  assert.match(events[0].summary, /Inland/);
});

test('records a measurement without duplicating gross, tare or location as a generic edit', () => {
  const before = {spools:[spool('S001',at(1),{location:'Rack'})],weighLog:[]};
  const after = {
    spools:[spool('S001',at(2),{gross:800,tare:200,location:'AMS'})],
    weighLog:[{id:'S001',at:at(2),gross:800,tare:200,remaining:600,percent:60,location:'AMS',note:'Fresh reading'}],
  };
  const events = buildAuditEvents(before, after, context());
  assert.equal(events.filter(row => row.type === 'measurement.saved').length, 1);
  assert.equal(events.filter(row => row.type === 'inventory.updated').length, 0);
  assert.match(events[0].summary, /600 g remaining/);
});

test('records owner transfer and printer placement independently', () => {
  const before = {spools:[spool('S001',at(1))],weighLog:[]};
  const after = {spools:[spool('S001',at(2),{
    owner:'Aimee', placementState:'Loaded', printerName:'P1S', feederName:'AMS 1', feederSlot:'3', loadedAt:at(2),
  })],weighLog:[]};
  const events = buildAuditEvents(before, after, context());
  assert.deepEqual(events.map(row => row.type).sort(), ['ownership.transferred','placement.loaded']);
  assert.match(events.find(row => row.type === 'ownership.transferred').summary, /Bill → Aimee/);
  assert.match(events.find(row => row.type === 'placement.loaded').summary, /P1S/);
});

test('records print plan, start, completion and cancellation as explicit usage activity', () => {
  const baseSpool = spool('S001',at(1),{gross:800,tare:200,placementState:'Loaded',printerName:'P1S'});
  const planned = job('planned');
  const plannedEvents = buildAuditEvents({spools:[baseSpool],printJobs:[]},{spools:[baseSpool],printJobs:[planned]},context());
  assert.equal(plannedEvents.length,1);
  assert.equal(plannedEvents[0].type,'usage.print-planned');

  const running = job('in-progress',{startedAt:at(10),updatedAt:at(10),remainingAtStart:600});
  const startEvents = buildAuditEvents({spools:[baseSpool],printJobs:[planned]},{spools:[baseSpool],printJobs:[running]},context());
  assert.equal(startEvents.length,1);
  assert.equal(startEvents[0].type,'usage.print-started');

  const completed = job('completed',{startedAt:at(10),completedAt:at(20),updatedAt:at(20),remainingAtStart:600,consumedGrams:190,remainingAfter:410});
  const projectedSpool = spool('S001',at(20),{
    tare:200,gross:null,placementState:'Loaded',printerName:'P1S',estimatedRemainingGrams:410,visualPercent:null,
    remainingEvidenceSource:'print-job',remainingEvidenceAt:at(20),lastUsedAt:at(20),lastPrintJobId:'J1',lastPrintConsumptionGrams:190,
  });
  const completedEvents = buildAuditEvents({spools:[baseSpool],printJobs:[running]},{spools:[projectedSpool],printJobs:[completed]},context());
  assert.equal(completedEvents.filter(row => row.type === 'usage.print-completed').length,1);
  assert.equal(completedEvents.filter(row => row.type === 'inventory.updated').length,0);
  assert.match(completedEvents[0].summary,/190 g consumed/);
  assert.match(completedEvents[0].summary,/410 g projected remaining/);

  const cancelled = job('cancelled',{cancelledAt:at(12),updatedAt:at(12)});
  const cancelEvents = buildAuditEvents({spools:[baseSpool],printJobs:[planned]},{spools:[baseSpool],printJobs:[cancelled]},context());
  assert.equal(cancelEvents.length,1);
  assert.equal(cancelEvents[0].type,'usage.print-cancelled');
});

test('records ordinary field edits with compact change details', () => {
  const before = {spools:[spool('S001',at(1),{colorName:'Black',notes:'Old'})],weighLog:[]};
  const after = {spools:[spool('S001',at(2),{colorName:'Galaxy Black',notes:'Dry before nylon'})],weighLog:[]};
  const events = buildAuditEvents(before, after, context());
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'inventory.updated');
  assert.deepEqual(events[0].changes.map(change => change.field).sort(), ['color','notes']);
});

test('records archive, restore and permanent delete lifecycle events', () => {
  const active = spool('S001',at(1));
  const archived = spool('S001',at(2),{archivedAt:at(2)});
  assert.equal(buildAuditEvents({spools:[active]}, {spools:[archived]}, context())[0].type, 'lifecycle.archived');
  assert.equal(buildAuditEvents({spools:[archived]}, {spools:[spool('S001',at(3),{archivedAt:null})]}, context())[0].type, 'lifecycle.restored');
  assert.equal(buildAuditEvents({spools:[active]}, {spools:[]}, context())[0].type, 'inventory.deleted');
});

test('audit merge deduplicates by event id and keeps the newest copy', () => {
  const left = [{id:'same',at:at(1),type:'inventory.updated',summary:'Older',actor:'Bill'}];
  const right = [{id:'same',at:at(2),type:'inventory.updated',summary:'Newer',actor:'Aimee'}];
  const merged = mergeAuditLogs(left,right);
  assert.equal(merged.length,1);
  assert.equal(merged[0].summary,'Newer');
  assert.equal(merged[0].actor,'Aimee');
});

test('invalid audit entries are discarded and retention limit is enforced', () => {
  const rows = [
    {id:'bad',at:'not-a-date',type:'inventory.updated',summary:'Bad'},
    ...Array.from({length:5},(_,i)=>({id:`e${i}`,at:at(i+1),type:'inventory.updated',summary:`Event ${i}`,actor:'Bill'})),
  ];
  const normalized = normalizeAuditLog(rows,3);
  assert.deepEqual(normalized.map(row=>row.id),['e2','e3','e4']);
});
