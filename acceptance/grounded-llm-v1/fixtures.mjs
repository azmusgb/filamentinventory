export const FIXTURE_VERSION = 'grounded-llm-fixture-v1';

const spool = ({
  id, owner, brand, material, colorName, location,
  gross = null, tare = null, visualPercent = null, reorderThreshold = 250,
  loaded = false, loadedIn = '',
}) => Object.freeze({
  id, owner, brand, material, colorName, colorHex:'#808080',
  spoolType:'Synthetic test fixture', startWeight:1000,
  gross, tare, visualPercent, location,
  confidence:gross !== null ? 'Confirmed' : (visualPercent !== null ? 'Estimated' : 'Unknown'),
  opened:'Yes', bagged:'No', purchaseSource:'', purchasePrice:null, purchaseDate:'',
  reorderThreshold, lastDriedDate:'', notes:'', loaded, loadedIn,
  createdAt:'2026-09-06T12:00:00.000Z',
  updatedAt:'2026-09-06T12:00:00.000Z',
  archivedAt:null,
});

const state = (profile, spools) => Object.freeze({
  version:10,
  appVersion:'10.2.0',
  profile,
  savedAt:'2026-09-06T12:00:00.000Z',
  meta:Object.freeze({fixture:true, fixtureVersion:FIXTURE_VERSION}),
  spools:Object.freeze(spools),
  printers:Object.freeze([]),
  weighLog:Object.freeze([]),
  auditLog:Object.freeze([]),
  printJobs:Object.freeze([]),
  tombstones:Object.freeze({}),
});

export const acceptanceFixtures = Object.freeze({
  schemaVersion:1,
  fixtureVersion:FIXTURE_VERSION,
  synthetic:true,
  note:'Synthetic acceptance fixtures only. They are not authoritative physical inventory.',
  profiles:Object.freeze({
    Bill:state('Bill',[
      spool({id:'B-PLA-BLK-001',owner:'Bill',brand:'Inland',material:'PLA',colorName:'Black',location:'Bill Rack A',gross:620,tare:220}),
      spool({id:'B-PETG-BLU-002',owner:'Bill',brand:'Bambu Lab',material:'PETG',colorName:'Blue',location:'Bill Dry Box 2',gross:350,tare:250,reorderThreshold:200,loaded:true,loadedIn:'P1 · AMS A · Slot 2'}),
      spool({id:'B-PLA-WHT-003',owner:'Bill',brand:'Polymaker',material:'PLA',colorName:'White',location:'Bill Shelf B',visualPercent:55}),
      spool({id:'B-TPU-RED-004',owner:'Bill',brand:'Overture',material:'TPU',colorName:'Red',location:'Bill Drawer 3'}),
      spool({id:'B-ASA-BLK-005',owner:'Bill',brand:'Polymaker',material:'ASA',colorName:'Black',location:'Bill Dry Box 1',gross:900,tare:250,loaded:true,loadedIn:'P1 · External Spool'}),
    ]),
    Aimee:state('Aimee',[
      spool({id:'A-PLA-BLK-001',owner:'Aimee',brand:'eSUN',material:'PLA',colorName:'Black',location:'Aimee Rack 1',gross:950,tare:250,loaded:true,loadedIn:'P2 · AMS B · Slot 1'}),
      spool({id:'A-PETG-BLU-002',owner:'Aimee',brand:'Overture',material:'PETG',colorName:'Blue',location:'Aimee Dry Box',gross:400,tare:250,reorderThreshold:200}),
      spool({id:'A-PLA-WHT-003',owner:'Aimee',brand:'Hatchbox',material:'PLA',colorName:'White',location:'Aimee Shelf 2',visualPercent:30}),
      spool({id:'A-TPU-RED-004',owner:'Aimee',brand:'Bambu Lab',material:'TPU',colorName:'Red',location:'Aimee Drawer'}),
      spool({id:'A-ASA-BLK-005',owner:'Aimee',brand:'Polymaker',material:'ASA',colorName:'Black',location:'Aimee Dry Box 2',gross:500,tare:250,reorderThreshold:300,loaded:true,loadedIn:'P2 · External Spool'}),
    ]),
  }),
});
