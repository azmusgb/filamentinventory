import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const printer = require('../printer-core.js');
const merge = require('../state-merge.js');
const users = require('../user-isolation.js');
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('printer registry normalizes hardware and AMS slot configuration', () => {
  const rows = printer.normalizePrinters([{
    id:'p1s',
    name:'P1S',
    manufacturer:'Bambu Lab',
    model:'P1S',
    nozzleSize:'0.4 mm',
    nozzleMaterial:'Hardened steel',
    feeders:[{id:'ams-1',name:'AMS 1',type:'AMS',slotCount:4}],
    updatedAt:'2026-08-29T00:00:00.000Z',
  }]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].manufacturer,'Bambu Lab');
  assert.equal(rows[0].feeders[0].slotCount,4);
  assert.deepEqual(printer.slotsForFeeder(rows[0].feeders[0]),['1','2','3','4']);
});

test('legacy loaded placements become inferred printer records without inventing duplicates', () => {
  const state = {
    printers:[{id:'p1s',name:'P1S',feeders:[{id:'ams',name:'AMS 1',type:'AMS',slotCount:4}]}],
    spools:[
      {id:'S1',placementState:'Loaded',printerName:'P1S',feederName:'AMS 1',feederSlot:'1'},
      {id:'S2',placementState:'Loaded',printerName:'A1 mini',feederName:'External',feederSlot:'1'},
    ],
  };
  const configured = printer.configuredPrinters(state);
  assert.deepEqual(configured.map(row => row.name).sort(),['A1 mini','P1S']);
  assert.equal(configured.find(row => row.name === 'A1 mini').legacyInferred,true);
});

test('slot identity prefers stable printer and feeder IDs', () => {
  const left = {placementState:'Loaded',printerId:'p1',printerName:'Old name',feederId:'ams1',feederName:'AMS Old',feederSlot:'2'};
  const right = {...left,printerName:'New name',feederName:'AMS New'};
  assert.equal(printer.slotKey(left),printer.slotKey(right));
});

test('backup merge keeps newest printer metadata independently of spools', () => {
  const merged = merge.mergeBackupStates(
    {version:10,spools:[],printers:[{id:'p1',name:'P1S',location:'Office',updatedAt:'2026-08-29T00:00:00.000Z'}]},
    {version:10,spools:[],printers:[{id:'p1',name:'P1S',location:'Print room',updatedAt:'2026-08-29T01:00:00.000Z'}]},
  );
  assert.equal(merged.printers.length,1);
  assert.equal(merged.printers[0].location,'Print room');
});

test('printer records remain private to each profile', () => {
  const split = users.splitLegacyState({
    version:10,
    spools:[{id:'B1',owner:'Bill'},{id:'A1',owner:'Aimee'}],
    printers:[{id:'pb',name:'Bill P1S',owner:'Bill'},{id:'pa',name:'Aimee A1',owner:'Aimee'}],
    weighLog:[],auditLog:[],printJobs:[],tombstones:{},
  },{schemaVersion:10,at:'2026-08-29T00:00:00.000Z'});
  assert.deepEqual(split.Bill.printers.map(row => row.id),['pb']);
  assert.deepEqual(split.Aimee.printers.map(row => row.id),['pa']);
  assert.equal(users.emptyState('Bill',10).printers.length,0);
});

test('browser and Netlify sync contracts include printers and print jobs', async () => {
  const [client,server,reconcile,dashboard] = await Promise.all([
    read('sync-client.js'),
    read('netlify/functions/sync.mts'),
    read('netlify/lib/sync-reconcile.mts'),
    read('printer-dashboard.js'),
  ]);
  assert.match(client,/printers:Array\.isArray\(local\.printers\)/);
  assert.match(client,/printJobs:Array\.isArray\(local\.printJobs\)/);
  assert.match(client,/printers:Array\.isArray\(remote\.printers\)/);
  assert.match(client,/printJobs:Array\.isArray\(remote\.printJobs\)/);
  assert.match(server,/MAX_PRINTERS = 50/);
  assert.match(server,/printers:normalizePrinters\(value\?\.printers\)/);
  assert.match(server,/const printers = mergePrinters\(remote\.printers, incoming\.printers\)/);
  assert.match(reconcile,/printerId/);
  assert.match(reconcile,/feederId/);
  assert.match(dashboard,/data-printer-add/);
  assert.match(dashboard,/printerConfigManufacturer/);
  assert.match(dashboard,/printerConfigNozzleSize/);
  assert.match(dashboard,/printerFeederRows/);
});
