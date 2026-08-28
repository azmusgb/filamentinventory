import assert from 'node:assert/strict';
import test from 'node:test';

import { mergePrintJobs, mergeStates, normalizeState } from '../netlify/functions/sync.mts';
import { reconcileConcurrentState } from '../netlify/lib/sync-reconcile.mts';

const at = minute => `2026-08-28T18:${String(minute).padStart(2,'0')}:00.000Z`;
const spool = (id, updatedAt = at(1), extra = {}) => ({id,material:'PLA',colorName:'Black',updatedAt,...extra});
const job = (id, status, updatedAt, extra = {}) => ({
  id,
  spoolId:'S1',
  jobName:'Bracket',
  material:'PLA',
  color:'Black',
  modelGrams:200,
  requiredGrams:220,
  status,
  plannedAt:at(1),
  updatedAt,
  ...extra,
});

test('cloud normalizeState retains a bounded normalized print-job ledger', () => {
  const value = normalizeState({
    version:10,
    spools:[spool('S1')],
    weighLog:[],
    auditLog:[],
    tombstones:{},
    printJobs:[
      job('J1','planned',at(2)),
      {id:'bad',spoolId:'',plannedAt:at(2)},
    ],
  });
  assert.equal(value.version,10);
  assert.equal(value.printJobs.length,1);
  assert.equal(value.printJobs[0].id,'J1');
  assert.equal(value.printJobs[0].status,'planned');
});

test('cloud merge keeps independent jobs and newest lifecycle transition for a shared job id', () => {
  const remote = [job('J1','planned',at(2)), job('J2','completed',at(4),{completedAt:at(4),consumedGrams:150})];
  const incoming = [job('J1','in-progress',at(3),{startedAt:at(3)}), job('J3','planned',at(5))];
  const merged = mergePrintJobs(remote,incoming);
  assert.deepEqual(merged.map(row => row.id),['J1','J2','J3']);
  assert.equal(merged.find(row => row.id === 'J1').status,'in-progress');
  assert.equal(merged.find(row => row.id === 'J2').consumedGrams,150);
});

test('two-way cloud state merge preserves print jobs from both devices', () => {
  const remote = {version:10,spools:[spool('S1',at(2))],weighLog:[],auditLog:[],tombstones:{},printJobs:[job('J1','planned',at(2))]};
  const incoming = {version:10,spools:[spool('S1',at(3))],weighLog:[],auditLog:[],tombstones:{},printJobs:[job('J2','planned',at(3))]};
  const merged = mergeStates(remote,incoming);
  assert.deepEqual(merged.state.printJobs.map(row => row.id),['J1','J2']);
});

test('three-way spool reconciliation does not strip the already merged print-job ledger', () => {
  const baseSpool = spool('S1',at(1),{notes:'base',location:'Rack'});
  const remoteSpool = {...baseSpool,updatedAt:at(2),notes:'remote'};
  const incomingSpool = {...baseSpool,updatedAt:at(3),location:'AMS'};
  const base = {spools:[baseSpool],printJobs:[job('J0','completed',at(1),{completedAt:at(1)})]};
  const remote = {spools:[remoteSpool],printJobs:[job('J1','planned',at(2))]};
  const incoming = {spools:[incomingSpool],printJobs:[job('J2','planned',at(3))]};
  const merged = mergeStates(remote,incoming).state;
  const reconciled = reconcileConcurrentState(base,remote,incoming,merged);
  assert.deepEqual(reconciled.state.printJobs.map(row => row.id),['J1','J2']);
  assert.equal(reconciled.state.spools[0].notes,'remote');
  assert.equal(reconciled.state.spools[0].location,'AMS');
});
