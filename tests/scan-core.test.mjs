import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const scan = require('../scan-core.js');
const origin = 'https://filamentinventory.netlify.app';

test('raw spool IDs are accepted without inventing a profile', () => {
  assert.deepEqual(scan.parseScanValue('S022', origin), {ok:true, spoolId:'S022', profile:null, source:'id'});
});

test('legacy same-origin label URLs resolve only the durable spool identity', () => {
  const result = scan.parseScanValue(`${origin}/?spool=A12&scan=1&profile=Aimee#filament-user=Aimee`, origin);
  assert.equal(result.ok, true);
  assert.equal(result.spoolId, 'A12');
  assert.equal(result.profile, null);
  assert.equal(result.source, 'url');
  const canonical = new URL(result.url);
  assert.equal(canonical.searchParams.get('profile'), null);
  assert.equal(new URLSearchParams(canonical.hash.slice(1)).get('filament-user'), null);
});

test('foreign QR URLs are rejected instead of being followed', () => {
  const result = scan.parseScanValue('https://example.com/?spool=S022&scan=1', origin);
  assert.deepEqual(result, {ok:false, reason:'foreign-origin'});
});

test('target URLs preserve scan intent but never encode a private profile', () => {
  const target = new URL(scan.buildSpoolTarget({spoolId:'S022', profile:'Bill'}, origin));
  assert.equal(target.origin, origin);
  assert.equal(target.searchParams.get('spool'), 'S022');
  assert.equal(target.searchParams.get('scan'), '1');
  assert.equal(target.searchParams.get('profile'), null);
  assert.equal(new URLSearchParams(target.hash.slice(1)).get('filament-user'), null);
});

test('profile resolution never searches another private workspace', () => {
  const states = {
    Bill:{spools:[{id:'B01'}]},
    Aimee:{spools:[{id:'A01'}]},
  };
  assert.equal(scan.resolveProfile('B01', 'Bill', states), 'Bill');
  assert.equal(scan.resolveProfile('A01', 'Bill', states), null);
  assert.equal(scan.resolveProfile('A01', 'Aimee', states), 'Aimee');
  assert.equal(scan.resolveProfile('missing', 'Aimee', states), null);
});

test('incoming scan URLs drop legacy mutable profile hints before profile bootstrapping', () => {
  let replaced = '';
  const host = {
    location:{href:`${origin}/?spool=A01&scan=1&profile=Aimee#filament-user=Aimee&view=inventory`},
    history:{state:{test:true},replaceState(_state,_title,next){replaced=next;}},
  };
  assert.equal(scan.sanitizeIncomingScanUrl(host), true);
  const next = new URL(replaced, origin);
  assert.equal(next.searchParams.get('spool'), 'A01');
  assert.equal(next.searchParams.get('scan'), '1');
  assert.equal(next.searchParams.get('profile'), null);
  const hash = new URLSearchParams(next.hash.slice(1));
  assert.equal(hash.get('filament-user'), null);
  assert.equal(hash.get('view'), 'inventory');
});

test('non-scan profile links are left untouched', () => {
  let replaced = false;
  const host = {
    location:{href:`${origin}/#filament-user=Aimee`},
    history:{state:null,replaceState(){replaced=true;}},
  };
  assert.equal(scan.sanitizeIncomingScanUrl(host), false);
  assert.equal(replaced, false);
});