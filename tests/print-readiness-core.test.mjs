import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const require = createRequire(import.meta.url);
const core = require('../print-readiness-core.js');
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('ready candidate includes safety margin and favors loaded usable spool', () => {
  const spools = [{id:'S1',material:'PLA',colorName:'Matte Black',gross:748,tare:212,startWeight:1000,placementState:'Loaded',updatedAt:'2026-08-27T12:00:00Z'},{id:'S2',material:'PLA',colorName:'Black',gross:1100,tare:200,startWeight:1000,updatedAt:'2026-08-27T12:00:00Z'}];
  const result = core.evaluate(spools,{material:'PLA',color:'Black',grams:286,safetyMargin:10},Date.parse('2026-08-27T13:00:00Z'));
  assert.equal(result.status,'ready'); assert.equal(result.required,315); assert.equal(result.recommended.spool.id,'S1'); assert.equal(result.recommended.after,221);
});

test('unknown matching spool requests measurement', () => {
  const result = core.evaluate([{id:'S1',material:'PLA',colorName:'Black'}],{material:'PLA',color:'Black',grams:300,safetyMargin:10});
  assert.equal(result.status,'measurement-needed'); assert.equal(result.recommended.spool.id,'S1');
});

test('known insufficient inventory reports not enough', () => {
  const result = core.evaluate([{id:'S1',material:'PLA',colorName:'Black',gross:450,tare:210,startWeight:1000}],{material:'PLA',color:'Black',grams:286,safetyMargin:10});
  assert.equal(result.status,'not-enough'); assert.equal(result.recommended.grams,240);
});

test('archived and wrong-material spools are excluded', () => {
  const result = core.evaluate([{id:'S1',material:'PETG',colorName:'Black',gross:900,tare:200},{id:'S2',material:'PLA',colorName:'Black',gross:900,tare:200,archivedAt:'2026-01-01'}],{material:'PLA',color:'Black',grams:100,safetyMargin:0});
  assert.equal(result.status,'no-match');
});

test('current shell loads readiness modules and client injects launcher', async () => {
  const shell = await read('app-shell-client.js');
  const client = await read('print-readiness-client.js');
  assert.match(shell, /print-readiness-core\.js/);
  assert.match(shell, /print-readiness-client\.js/);
  assert.match(client, /(?:dataset\.printReadiness\s*=|data-print-readiness)/);
  assert.match(client, /\[data-print-readiness\]/);
  assert.match(client, /Can I print this\?/);
});
