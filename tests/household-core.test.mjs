import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';

const require=createRequire(import.meta.url);
const contract=require('../spool-contract-core.js');

const household=contract.normalizeHousehold({
  householdId:'home-1',
  members:[
    {memberId:'bill',displayName:'Bill',status:'Active'},
    {memberId:'aimee',displayName:'Aimee',status:'Active'},
    {memberId:'guest',displayName:'Guest',status:'Inactive'},
  ],
});

test('resource scope is private by default and never carries an implicit share list', () => {
  const scope=contract.normalizeResourceScope({householdId:'home-1',ownerMemberId:'bill',sharedWithMemberIds:['aimee']});
  assert.equal(scope.visibility,'Private');
  assert.equal(scope.ownerMemberId,'bill');
  assert.deepEqual(scope.sharedWithMemberIds,[]);
});

test('shared scope preserves only explicit member identifiers and excludes the owner', () => {
  const scope=contract.normalizeResourceScope({
    householdId:'home-1',
    ownerMemberId:'bill',
    visibility:'Shared',
    sharedWithMemberIds:['aimee','bill','AIMEE'],
  });
  assert.equal(scope.visibility,'Shared');
  assert.deepEqual(scope.sharedWithMemberIds,['aimee']);
});

test('state validation rejects owners and shares outside the household membership', () => {
  const invalidOwner=contract.validateState({
    profile:'Bill',
    household,
    spools:[{id:'S1',resourceScope:{householdId:'home-1',ownerMemberId:'nobody',visibility:'Private'}}],
  });
  assert.equal(invalidOwner.valid,false);
  assert.equal(invalidOwner.errors.some(issue=>issue.code==='spool-owner-member-missing'),true);

  const invalidShare=contract.validateState({
    profile:'Bill',
    household,
    spools:[{id:'S1',resourceScope:{householdId:'home-1',ownerMemberId:'bill',visibility:'Shared',sharedWithMemberIds:['nobody']}}],
  });
  assert.equal(invalidShare.valid,false);
  assert.equal(invalidShare.errors.some(issue=>issue.code==='spool-share-member-missing'),true);
});

test('state validation rejects cross-household resource scope', () => {
  const result=contract.validateState({
    profile:'Bill',
    household,
    spools:[{id:'S1',resourceScope:{householdId:'other-home',ownerMemberId:'bill',visibility:'Private'}}],
  });
  assert.equal(result.valid,false);
  assert.equal(result.errors.some(issue=>issue.code==='spool-household-mismatch'),true);
});

test('legacy Bill/Aimee owner fields map deterministically into canonical member IDs without creating sharing', () => {
  const bill=contract.normalizeSpool({id:'S1',owner:'Bill'},{owner:'Bill',householdId:'home-1'});
  const aimee=contract.normalizeSpool({id:'S2',owner:'Aimee'},{owner:'Aimee',householdId:'home-1'});
  assert.equal(bill.ownerMemberId,'bill');
  assert.equal(aimee.ownerMemberId,'aimee');
  assert.equal(bill.visibility,'Private');
  assert.equal(aimee.visibility,'Private');
  assert.deepEqual(bill.sharedWithMemberIds,[]);
  assert.deepEqual(aimee.sharedWithMemberIds,[]);
});

test('inactive household members cannot remain authoritative owners', () => {
  const result=contract.validateState({
    profile:'Bill',
    household,
    spools:[{id:'S1',resourceScope:{householdId:'home-1',ownerMemberId:'guest',visibility:'Private'}}],
  });
  assert.equal(result.valid,false);
  assert.equal(result.errors.some(issue=>issue.code==='spool-owner-member-missing'),true);
});
