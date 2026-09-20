import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const household = require('../household-core.js');

const model = household.normalizeHousehold({
  householdId:'home-1',
  name:'Workshop',
  members:[
    {memberId:'bill',displayName:'Bill',status:'Active',legacyProfile:'Bill'},
    {memberId:'aimee',displayName:'Aimee',status:'Active',legacyProfile:'Aimee'},
    {memberId:'guest',displayName:'Guest',status:'Inactive'},
  ],
});

test('private resource is visible only to its explicit owner', () => {
  const scope = household.normalizeResourceScope({
    householdId:'home-1',
    ownerMemberId:'bill',
    visibility:'Private',
    sharedWithMemberIds:['aimee'],
  });
  assert.equal(scope.visibility,'Private');
  assert.deepEqual(scope.sharedWithMemberIds,[]);
  assert.equal(household.canMemberAccess(scope,'bill'),true);
  assert.equal(household.canMemberAccess(scope,'aimee'),false);
});

test('shared resource exposes only explicitly selected active members', () => {
  const scope = household.normalizeResourceScope({
    householdId:'home-1',
    ownerMemberId:'bill',
    visibility:'Shared',
    sharedWithMemberIds:['aimee'],
  });
  assert.equal(household.canMemberAccess(scope,'bill'),true);
  assert.equal(household.canMemberAccess(scope,'aimee'),true);
  assert.equal(household.canMemberAccess(scope,'someone-else'),false);
  assert.equal(household.validateResourceScope(scope,model).valid,true);
});

test('share mutation requires ownership and creates an auditable event', () => {
  const state = {
    resources:[{id:'S1',resourceScope:{householdId:'home-1',ownerMemberId:'bill',visibility:'Private',sharedWithMemberIds:[]}}],
    resourceAudit:[],
  };
  const denied = household.shareResource(state,'S1','aimee',['bill'],model,'2026-09-20T18:00:00Z');
  assert.equal(denied.changed,false);
  assert.equal(denied.reason,'owner-required');

  const shared = household.shareResource(state,'S1','bill',['aimee'],model,'2026-09-20T18:00:00Z');
  assert.equal(shared.changed,true);
  assert.equal(shared.resource.resourceScope.visibility,'Shared');
  assert.deepEqual(shared.resource.resourceScope.sharedWithMemberIds,['aimee']);
  assert.equal(shared.audit.action,'Share');
  assert.equal(shared.audit.actorMemberId,'bill');
});

test('sharing fails closed for inactive or nonexistent household members', () => {
  const state = {
    resources:[{id:'S1',resourceScope:{householdId:'home-1',ownerMemberId:'bill',visibility:'Private',sharedWithMemberIds:[]}}],
  };
  const inactive = household.shareResource(state,'S1','bill',['guest'],model);
  assert.equal(inactive.changed,false);
  assert.equal(inactive.reason,'share-target-not-active-member');
  const missing = household.shareResource(state,'S1','bill',['nobody'],model);
  assert.equal(missing.changed,false);
  assert.equal(missing.reason,'share-target-not-active-member');
});

test('ownership transfer is explicit, audited, and resets sharing to private', () => {
  const state = {
    resources:[{id:'S1',resourceScope:{householdId:'home-1',ownerMemberId:'bill',visibility:'Shared',sharedWithMemberIds:['aimee']}}],
    resourceAudit:[],
  };
  const result = household.transferResourceOwnership(state,'S1','bill','aimee',model,'2026-09-20T18:05:00Z');
  assert.equal(result.changed,true);
  assert.equal(result.resource.resourceScope.ownerMemberId,'aimee');
  assert.equal(result.resource.resourceScope.visibility,'Private');
  assert.deepEqual(result.resource.resourceScope.sharedWithMemberIds,[]);
  assert.equal(result.audit.action,'TransferOwnership');
  assert.equal(result.audit.fromOwnerMemberId,'bill');
  assert.equal(result.audit.toOwnerMemberId,'aimee');
});

test('legacy Bill/Aimee data is never silently promoted into household authority', () => {
  const withoutMapping = household.migrateLegacyResourceScope({id:'S1',owner:'Bill'},model,{});
  assert.equal(withoutMapping.status,'unmapped');
  assert.equal(withoutMapping.resourceScope,null);

  const explicit = household.migrateLegacyResourceScope({id:'S1',owner:'Bill'},model,{Bill:'bill',Aimee:'aimee'});
  assert.equal(explicit.status,'mapped');
  assert.equal(explicit.resourceScope.ownerMemberId,'bill');
  assert.equal(explicit.resourceScope.visibility,'Private');
});

test('visibleResources enforces zero implicit cross-member visibility', () => {
  const resources = [
    {id:'B1',resourceScope:{householdId:'home-1',ownerMemberId:'bill',visibility:'Private'}},
    {id:'A1',resourceScope:{householdId:'home-1',ownerMemberId:'aimee',visibility:'Private'}},
    {id:'S1',resourceScope:{householdId:'home-1',ownerMemberId:'bill',visibility:'Shared',sharedWithMemberIds:['aimee']}},
    {id:'U1'},
  ];
  assert.deepEqual(household.visibleResources(resources,'bill').map(row=>row.id),['B1','S1']);
  assert.deepEqual(household.visibleResources(resources,'aimee').map(row=>row.id),['A1','S1']);
});
