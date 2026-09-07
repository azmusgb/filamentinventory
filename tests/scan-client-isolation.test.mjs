import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source=fs.readFileSync(new URL('../scan-client.js',import.meta.url),'utf8');

test('scanner resolves only against the active private inventory',()=>{
  assert.doesNotMatch(source,/allProfileStates\s*\(/);
  assert.doesNotMatch(source,/core\.resolveProfile\s*\(/);
  assert.doesNotMatch(source,/Switching to .*private inventory/);
  assert.match(source,/const state=readState\(\)/);
  assert.match(source,/core\.stateHasSpool\(state,parsed\.spoolId\)/);
  assert.match(source,/profile:current/);
});

test('scanner does not treat QR profile hints as authorization',()=>{
  assert.doesNotMatch(source,/parsed\.profile\s*\|\|/);
  assert.doesNotMatch(source,/profile:parsed\.profile/);
});

test('scanner guards stale camera sessions when the active profile changes',()=>{
  assert.match(source,/scannerProfile=currentProfile\(\)/);
  assert.match(source,/scannerProfile&&scannerProfile!==currentProfile\(\)/);
  assert.match(source,/Inventory changed/);
});

test('legacy scan reconciliation stays active-profile scoped',()=>{
  assert.match(source,/const current=currentProfile\(\),exists=core\.stateHasSpool\(readState\(\),spoolId\)/);
  assert.doesNotMatch(source,/profileFromUrl\s*\(/);
});
