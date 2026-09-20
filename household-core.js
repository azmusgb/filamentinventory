(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventoryHousehold = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const VISIBILITY = Object.freeze(['Private','Shared']);
  const MEMBER_STATUS = Object.freeze(['Active','Inactive']);
  const AUDIT_ACTIONS = Object.freeze(['Share','Unshare','TransferOwnership']);
  const clean = (value, max = 120) => String(value ?? '').trim().slice(0, max);
  const lower = value => clean(value, 120).toLowerCase();
  const iso = value => value && !Number.isNaN(Date.parse(String(value))) ? new Date(String(value)).toISOString() : null;
  const uniqueIds = value => [...new Set((Array.isArray(value) ? value : []).map(row => clean(row,64)).filter(Boolean).map(id => id.toLowerCase()))];

  function normalizeMember(input = {}) {
    return Object.freeze({
      memberId:clean(input.memberId || input.id, 64),
      displayName:clean(input.displayName || input.name, 80),
      status:MEMBER_STATUS.includes(String(input.status)) ? String(input.status) : 'Active',
      legacyProfile:clean(input.legacyProfile, 32),
    });
  }

  function normalizeHousehold(input = {}) {
    const members = (Array.isArray(input.members) ? input.members : []).map(normalizeMember).filter(member => member.memberId);
    return Object.freeze({
      householdId:clean(input.householdId || input.id, 64),
      name:clean(input.name, 80),
      members:Object.freeze(members),
    });
  }

  function normalizeResourceScope(input = {}) {
    const visibility = VISIBILITY.includes(String(input.visibility)) ? String(input.visibility) : 'Private';
    const ownerMemberId = clean(input.ownerMemberId,64).toLowerCase();
    const sharedWithMemberIds = visibility === 'Shared'
      ? uniqueIds(input.sharedWithMemberIds).filter(id => id !== ownerMemberId)
      : [];
    return Object.freeze({
      householdId:clean(input.householdId,64),
      ownerMemberId,
      visibility,
      sharedWithMemberIds:Object.freeze(sharedWithMemberIds),
    });
  }

  function validateHousehold(input = {}) {
    const household = normalizeHousehold(input);
    const errors = [];
    const ids = new Set();
    if (!household.householdId) errors.push({code:'household-id-required',field:'householdId',message:'Household ID is required.'});
    for (const member of household.members) {
      const id = lower(member.memberId);
      if (ids.has(id)) errors.push({code:'duplicate-member-id',memberId:member.memberId,message:'Household member IDs must be unique.'});
      ids.add(id);
    }
    return {household,errors,valid:errors.length === 0};
  }

  function validateResourceScope(input = {}, householdInput = {}) {
    const scope = normalizeResourceScope(input);
    const household = normalizeHousehold(householdInput);
    const errors = [];
    const activeIds = new Set(household.members.filter(m => m.status === 'Active').map(m => lower(m.memberId)));
    if (!scope.householdId) errors.push({code:'resource-household-id-required',field:'householdId',message:'Resource household ID is required.'});
    if (!scope.ownerMemberId) errors.push({code:'resource-owner-required',field:'ownerMemberId',message:'Resource owner member ID is required.'});
    if (scope.householdId && household.householdId && lower(scope.householdId) !== lower(household.householdId)) errors.push({code:'resource-household-mismatch',field:'householdId',message:'Resource belongs to a different household.'});
    if (scope.ownerMemberId && !activeIds.has(lower(scope.ownerMemberId))) errors.push({code:'resource-owner-not-active-member',field:'ownerMemberId',message:'Resource owner must be an active household member.'});
    for (const memberId of scope.sharedWithMemberIds) if (!activeIds.has(lower(memberId))) errors.push({code:'resource-share-member-not-active',memberId,message:'Shared resource target must be an active household member.'});
    if (scope.visibility === 'Private' && scope.sharedWithMemberIds.length) errors.push({code:'private-resource-has-share-list',field:'sharedWithMemberIds',message:'Private resources cannot expose a share list.'});
    return {scope,errors,valid:errors.length === 0};
  }

  function canMemberAccess(scopeInput = {}, memberId = '') {
    const scope = normalizeResourceScope(scopeInput);
    const target = lower(memberId);
    if (!target || !scope.ownerMemberId) return false;
    if (target === lower(scope.ownerMemberId)) return true;
    return scope.visibility === 'Shared' && scope.sharedWithMemberIds.includes(target);
  }

  function visibleResources(resources = [], memberId = '') {
    return (Array.isArray(resources) ? resources : []).filter(resource => canMemberAccess(resource?.resourceScope, memberId));
  }

  function auditId(action, resourceId, at) {
    const stamp = String(at || new Date().toISOString()).replace(/\D/g,'').slice(0,14);
    return ('resource-' + String(action || '').toLowerCase() + '-' + clean(resourceId,48).toLowerCase() + '-' + stamp).slice(0,120);
  }

  function auditRow({action, resourceId, actorMemberId, fromOwnerMemberId = '', toOwnerMemberId = '', sharedWithMemberIds = [], at}) {
    return Object.freeze({
      auditId:auditId(action,resourceId,at),
      action,
      resourceId:clean(resourceId,64),
      actorMemberId:clean(actorMemberId,64).toLowerCase(),
      fromOwnerMemberId:clean(fromOwnerMemberId,64).toLowerCase(),
      toOwnerMemberId:clean(toOwnerMemberId,64).toLowerCase(),
      sharedWithMemberIds:Object.freeze(uniqueIds(sharedWithMemberIds)),
      observedAt:iso(at) || new Date().toISOString(),
    });
  }

  function mutateResourceScope(stateRaw = {}, resourceId = '', actorMemberId = '', mutate) {
    const state = {
      ...stateRaw,
      resources:(Array.isArray(stateRaw.resources) ? stateRaw.resources : []).map(row => ({...row,resourceScope:row?.resourceScope ? {...row.resourceScope,sharedWithMemberIds:Array.isArray(row.resourceScope.sharedWithMemberIds)?[...row.resourceScope.sharedWithMemberIds]:[]} : row?.resourceScope})),
      resourceAudit:Array.isArray(stateRaw.resourceAudit) ? stateRaw.resourceAudit.map(row=>({...row})) : [],
    };
    const targetId = lower(resourceId);
    const index = state.resources.findIndex(resource => lower(resource?.id || resource?.spoolId) === targetId);
    if (index < 0) return {changed:false,reason:'resource-not-found',state};
    const resource = state.resources[index];
    const scope = normalizeResourceScope(resource.resourceScope);
    if (!scope.ownerMemberId) return {changed:false,reason:'resource-scope-unknown',state,resource};
    if (lower(actorMemberId) !== lower(scope.ownerMemberId)) return {changed:false,reason:'owner-required',state,resource};
    const result = mutate({resource,scope,state});
    if (!result?.scope) return {changed:false,reason:result?.reason || 'invalid-mutation',state,resource};
    state.resources[index] = {...resource,resourceScope:normalizeResourceScope(result.scope)};
    if (result.audit) state.resourceAudit = [...state.resourceAudit,result.audit];
    return {changed:true,state,resource:state.resources[index],audit:result.audit || null};
  }

  function shareResource(stateRaw = {}, resourceId = '', actorMemberId = '', memberIds = [], householdInput = {}, at = new Date().toISOString()) {
    const household = normalizeHousehold(householdInput);
    const active = new Set(household.members.filter(m=>m.status==='Active').map(m=>lower(m.memberId)));
    return mutateResourceScope(stateRaw,resourceId,actorMemberId,({scope}) => {
      const requested = uniqueIds(memberIds).filter(id => id !== lower(scope.ownerMemberId));
      if (requested.some(id => !active.has(id))) return {reason:'share-target-not-active-member'};
      const next = {...scope,visibility:requested.length ? 'Shared' : 'Private',sharedWithMemberIds:requested};
      return {scope:next,audit:auditRow({action:requested.length?'Share':'Unshare',resourceId,actorMemberId,fromOwnerMemberId:scope.ownerMemberId,sharedWithMemberIds:requested,at})};
    });
  }

  function transferResourceOwnership(stateRaw = {}, resourceId = '', actorMemberId = '', toMemberId = '', householdInput = {}, at = new Date().toISOString()) {
    const household = normalizeHousehold(householdInput);
    const active = new Set(household.members.filter(m=>m.status==='Active').map(m=>lower(m.memberId)));
    const targetOwner = lower(toMemberId);
    if (!targetOwner || !active.has(targetOwner)) return {changed:false,reason:'target-owner-not-active-member',state:stateRaw};
    return mutateResourceScope(stateRaw,resourceId,actorMemberId,({scope}) => {
      if (targetOwner === lower(scope.ownerMemberId)) return {reason:'already-owner'};
      const next = {...scope,ownerMemberId:targetOwner,visibility:'Private',sharedWithMemberIds:[]};
      return {scope:next,audit:auditRow({action:'TransferOwnership',resourceId,actorMemberId,fromOwnerMemberId:scope.ownerMemberId,toOwnerMemberId:targetOwner,at})};
    });
  }

  function migrateLegacyResourceScope(resource = {}, householdInput = {}, legacyProfileToMemberId = {}) {
    const household = normalizeHousehold(householdInput);
    const legacyOwner = clean(resource.owner || resource.profile,32);
    const mapped = clean(legacyProfileToMemberId?.[legacyOwner],64).toLowerCase();
    const active = new Set(household.members.filter(m=>m.status==='Active').map(m=>lower(m.memberId)));
    if (!legacyOwner || !mapped || !active.has(mapped)) {
      return Object.freeze({status:'unmapped',resourceScope:null,legacyOwner:legacyOwner || null});
    }
    return Object.freeze({
      status:'mapped',
      legacyOwner,
      resourceScope:normalizeResourceScope({householdId:household.householdId,ownerMemberId:mapped,visibility:'Private',sharedWithMemberIds:[]}),
    });
  }

  return Object.freeze({
    VISIBILITY,
    MEMBER_STATUS,
    AUDIT_ACTIONS,
    normalizeMember,
    normalizeHousehold,
    normalizeResourceScope,
    validateHousehold,
    validateResourceScope,
    canMemberAccess,
    visibleResources,
    shareResource,
    transferResourceOwnership,
    migrateLegacyResourceScope,
  });
});
