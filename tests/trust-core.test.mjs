import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function core() {
  const source = await readFile(new URL('../trust-core.js', import.meta.url),'utf8');
  const context = {globalThis:{}}; vm.createContext(context); vm.runInContext(source, context);
  return context.globalThis.FilamentInventoryTrust;
}

test('snapshot and restore are isolated copies', async () => {
  const api = await core();
  const state = {spools:[{id:'S014',gross:748}],weighLog:[]};
  const snap = api.snapshot(state,'measurement'); state.spools[0].gross = 900;
  assert.equal(api.restore(snap).spools[0].gross,748);
});

test('merge preview exposes additions, conflicts and duplicate incoming IDs', async () => {
  const api = await core();
  const result = api.previewMerge([{id:'S1',brand:'A'}],[{id:'S1',brand:'B'},{id:'S2',brand:'C'},{id:'S2',brand:'C'}]);
  assert.deepEqual([...result.conflicts].map(x=>x.id),['S1']);
  assert.deepEqual([...result.additions].map(x=>x.id),['S2']);
  assert.deepEqual([...result.duplicates].map(x=>x.id),['S2']);
  assert.equal(result.safe,false);
});

test('spool identity is case insensitive during import preview', async () => {
  const api = await core();
  const result = api.previewMerge([{id:'S014',brand:'Inland'}],[{id:'s014',brand:'Overture'},{id:'S2'},{id:'s2'}]);
  assert.deepEqual([...result.conflicts].map(x=>x.id),['s014']);
  assert.deepEqual([...result.additions].map(x=>x.id),['S2']);
  assert.deepEqual([...result.duplicates].map(x=>x.id),['s2']);
});

test('destructive confirmations are explicit', async () => {
  const api = await core();
  assert.equal(api.destructiveConfirmation('reset'),'RESET INVENTORY');
  assert.equal(api.destructiveConfirmation('delete',3),'DELETE 3 SPOOLS');
});
