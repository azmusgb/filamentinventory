import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const prefs=require('../profile-preferences-core.js');

test('profile defaults are owner-specific and schema-independent',()=>{
  const bill=prefs.defaults('Bill'); const aimee=prefs.defaults('Aimee');
  assert.equal(bill.version,1); assert.equal(aimee.version,1);
  assert.equal(bill.appearance.accent,'cyan'); assert.equal(aimee.appearance.accent,'violet');
  assert.equal(bill.printing.safetyMargin,10); assert.equal(bill.printing.defaultReorderGrams,250);
});

test('normalization constrains unsafe and invalid preference values',()=>{
  const p=prefs.normalize({identity:{displayName:'  Custom User  ',initials:'cu'},appearance:{theme:'neon',accent:'red',density:'tiny'},workspace:{startView:'data',dashboardDetail:'everything'},printing:{safetyMargin:999,defaultReorderGrams:-1,defaultStartWeight:0}},'Bill');
  assert.equal(p.identity.displayName,'Custom User'); assert.equal(p.identity.initials,'CU');
  assert.equal(p.appearance.theme,'system'); assert.equal(p.appearance.accent,'cyan'); assert.equal(p.appearance.density,'comfortable');
  assert.equal(p.workspace.startView,'dashboard'); assert.equal(p.workspace.dashboardDetail,'focused');
  assert.equal(p.printing.safetyMargin,100); assert.equal(p.printing.defaultReorderGrams,0); assert.equal(p.printing.defaultStartWeight,1);
});

test('merge preserves untouched preference groups',()=>{
  const next=prefs.merge(prefs.defaults('Aimee'),{appearance:{density:'compact'},printing:{safetyMargin:15}},'Aimee');
  assert.equal(next.appearance.accent,'violet'); assert.equal(next.appearance.density,'compact'); assert.equal(next.printing.safetyMargin,15); assert.equal(next.workspace.startView,'dashboard');
});
