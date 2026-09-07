import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const scan = require('../scan-core.js');
const origin = 'https://filamentinventory.netlify.app';

test('raw spool IDs are accepted without inventing a profile', () => {
  assert.deepEqual(scan.parseScanValue('S022', origin), {ok:true, spoolId:'S022', profile:null, source:'id'});
});

test('legacy same-origin label URL may expose a compatibility profile hint without making it authoritative', () => {
  const result = scan.parseScanValue(`${origin}/?spool=A12&scan=1#filament-user=Aimee`, origin);
  assert.equal(result.ok, true);
  assert.equal(result.spoolId, 'A12');
  assert.equal(result.profile, 'Aimee');
  assert.equal(result.source, 'url');
});

test('legacy scan profile hints are stripped before user-isolation bootstrap', () => {
  const result = scan.neutralizeLegacyProfileHint(`${origin}/?spool=A12&scan=1#filament-user=Aimee&keep=1`);
  assert.equal(result.changed, true);
  assert.equal(result.url.searchParams.get('spool'), 'A12');
  assert.equal(result.url.searchParams.get('scan'), '1');
  const hash = new URLSearchParams(result.url.hash.slice(1));
  assert.equal(hash.get('filament-user'), null);
  assert.equal(hash.get('keep'), '1');

  const ordinaryProfileLink = scan.neutralizeLegacyProfileHint(`${origin}/#filament-user=Aimee`);
  assert.equal(ordinaryProfileLink.changed, false);
  assert.equal(new URLSearchParams(ordinaryProfileLink.url.hash.slice(1)).get('filament-user'), 'Aimee');
});

test('foreign QR URLs are rejected instead of being followed', () => {
  const result = scan.parseScanValue('https://example.com/?spool=S022&scan=1', origin);
  assert.deepEqual(result, {ok:false, reason:'foreign-origin'});
});

test('canonical target URLs preserve scan intent but encode no private profile', () => {
  const target = new URL(scan.buildSpoolTarget({spoolId:'S022', profile:'Bill'}, origin));
  assert.equal(target.origin, origin);
  assert.equal(target.searchParams.get('spool'), 'S022');
  assert.equal(target.searchParams.get('scan'), '1');
  assert.equal(target.searchParams.get('profile'), null);
  assert.equal(new URLSearchParams(target.hash.slice(1)).get('filament-user'), null);
});

test('scan resolution is limited to the active private workspace', () => {
  const states = {
    Bill:{spools:[{id:'B01'}]},
    Aimee:{spools:[{id:'A01'}]},
  };
  assert.equal(scan.resolveProfile('A01', 'Bill', states), null);
  assert.equal(scan.resolveProfile('B01', 'Bill', states), 'Bill');
  assert.equal(scan.resolveProfile('missing', 'Aimee', states), null);
});
