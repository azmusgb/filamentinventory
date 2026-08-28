import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const prefs=require('../profile-preferences-core.js');

test('profile defaults are owner-specific and independent from inventory schema',()=>{
  const bill=prefs.defaults('Bill'); const aimee=prefs.defaults('Aimee');
  assert.equal(prefs.VERSION,2); assert.equal(bill.version,2); assert.equal(aimee.version,2);
  assert.equal(bill.appearance.accent,'teal'); assert.equal(aimee.appearance.accent,'violet');
  assert.equal(bill.printing.safetyMargin,10); assert.equal(bill.printing.defaultReorderGrams,250);
  assert.equal(bill.workspace.startView,'dashboard');
});

test('normalization constrains unsafe and invalid preference values',()=>{
  const p=prefs.normalize({identity:{displayName:'  Custom User  ',initials:'cu'},appearance:{theme:'neon',accent:'red',density:'tiny'},workspace:{startView:'data',dashboardDetail:'everything'},printing:{safetyMargin:999,defaultReorderGrams:-1,defaultStartWeight:0}},'Bill');
  assert.equal(p.identity.displayName,'Custom User'); assert.equal(p.identity.initials,'CU');
  assert.equal(p.appearance.theme,'system'); assert.equal(p.appearance.accent,'teal'); assert.equal(p.appearance.density,'comfortable');
  assert.equal(p.workspace.startView,'dashboard'); assert.equal(p.workspace.dashboardDetail,'focused');
  assert.equal(p.printing.safetyMargin,100); assert.equal(p.printing.defaultReorderGrams,0); assert.equal(p.printing.defaultStartWeight,1);
});

test('legacy accent aliases normalize into V11 semantic accents',()=>{
  assert.equal(prefs.normalize({appearance:{accent:'cyan'}},'Bill').appearance.accent,'teal');
  assert.equal(prefs.normalize({appearance:{accent:'amber'}},'Bill').appearance.accent,'orange');
  assert.equal(prefs.normalize({appearance:{accent:'rose'}},'Bill').appearance.accent,'violet');
});

test('merge preserves untouched preference groups',()=>{
  const next=prefs.merge(prefs.defaults('Aimee'),{appearance:{density:'compact'},printing:{safetyMargin:15}},'Aimee');
  assert.equal(next.appearance.accent,'violet'); assert.equal(next.appearance.density,'compact'); assert.equal(next.printing.safetyMargin,15); assert.equal(next.workspace.startView,'dashboard');
});
