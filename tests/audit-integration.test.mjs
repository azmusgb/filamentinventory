import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { mergeBackupStates } = require('../state-merge.js');

const at = minute => `2026-08-27T05:${String(minute).padStart(2,'0')}:00.000Z`;
const event = (id, minute, summary) => ({id,at:at(minute),type:'inventory.updated',summary,actor:'Bill',spoolId:'S001'});

test('backup merge preserves and deduplicates shared activity events', () => {
  const merged = mergeBackupStates(
    {version:9,spools:[],weighLog:[],tombstones:{},auditLog:[event('a',1,'Local'),event('same',2,'Older')]},
    {version:9,spools:[],weighLog:[],tombstones:{},auditLog:[event('b',3,'Backup'),event('same',4,'Newer')]},
  );
  assert.deepEqual(merged.auditLog.map(row => row.id), ['a','b','same']);
  assert.equal(merged.auditLog.find(row => row.id === 'same').summary, 'Newer');
});

test('browser loads audit core before sync and audit UI before app mutations', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const core = html.indexOf('/audit-core.js');
  const sync = html.indexOf('/sync-client.js');
  const household = html.indexOf('/household-client.js');
  const ui = html.indexOf('/audit-client.js');
  const app = html.indexOf('/app.js');
  assert.ok(core >= 0 && core < sync, 'audit-core.js must load before sync-client.js');
  assert.ok(ui > household && ui < app, 'audit-client.js must wrap final household mutations before app.js runs');
});

test('sync client sends, fingerprints and applies the shared audit ledger', async () => {
  const source = await readFile(new URL('../sync-client.js', import.meta.url), 'utf8');
  assert.match(source, /auditLog:Array\.isArray\(local\.auditLog\) \? local\.auditLog : \[\]/);
  assert.match(source, /auditLog:state\.auditLog \|\| \[\]/);
  assert.match(source, /auditLog:Array\.isArray\(remote\.auditLog\) \? remote\.auditLog : \[\]/);
});

test('sync function normalizes and merges audit events alongside printer and print-job ledgers', async () => {
  const source = await readFile(new URL('../netlify/functions/sync.mts', import.meta.url), 'utf8');
  assert.match(source, /const MAX_AUDIT = 1500;/);
  assert.match(source, /const MAX_PRINTERS = 50;/);
  assert.match(source, /const MAX_PRINT_JOBS = 250;/);
  assert.match(source, /printers:normalizePrinters\(value\?\.printers\)/);
  assert.match(source, /auditLog:normalizeAuditLog\(value\?\.auditLog\)/);
  assert.match(source, /printJobs:normalizePrintJobs\(value\?\.printJobs\)/);
  assert.match(source, /const printers = mergePrinters\(remote\.printers, incoming\.printers\);/);
  assert.match(source, /const auditLog = normalizeAuditLog\(\[\.\.\.remote\.auditLog, \.\.\.incoming\.auditLog\]\);/);
  assert.match(source, /const printJobs = mergePrintJobs\(remote\.printJobs, incoming\.printJobs\);/);
  assert.match(source, /state:\{ version, spools, printers, weighLog, auditLog, printJobs, tombstones \}/);
});
