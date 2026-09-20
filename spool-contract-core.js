(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FilamentInventorySpoolContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DEFAULT_REORDER_GRAMS = 250;
  const OWNERS = Object.freeze(['Bill', 'Aimee']);
  const PLACEMENT_STATES = Object.freeze(['Stored', 'Loaded']);
  const LIFECYCLE_STATES = Object.freeze(['Available', 'Loaded', 'Low', 'Empty', 'Archived']);
  const STOCK_STATES = Object.freeze(['Unknown', 'Available', 'Low', 'Empty', 'Archived']);
  const CONFIDENCE_LEVELS = Object.freeze(['Confirmed', 'High', 'Medium', 'Low', 'Unknown']);
  const TRI_STATES = Object.freeze(['Yes', 'No', 'Unknown']);
  const RESOURCE_VISIBILITY = Object.freeze(['Private', 'Shared']);
  const PLACEMENT_KINDS = Object.freeze(['Stored', 'Feeder', 'External', 'Unknown']);
  const USAGE_SOURCES = Object.freeze(['Printer', 'Reported', 'Calculated', 'Imported', 'Manual', 'Unknown']);
  const QUANTITY_EVIDENCE_METHODS = Object.freeze(['Measured','Calculated from measured','Printer-estimated usage','Visual estimate','Imported estimate','Unknown']);
  const QUANTITY_EVIDENCE_PRIORITY = Object.freeze({'Measured':600,'Calculated from measured':500,'Printer-estimated usage':400,'Visual estimate':300,'Imported estimate':200,'Unknown':0});
  const QUANTITY_CONFLICT_WINDOW_MS = 5 * 60 * 1000;
  const QUANTITY_CONFLICT_MIN_GRAMS = 10;

  const isFiniteNumber = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
  const numberOrNull = value => isFiniteNumber(value) ? Number(value) : null;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const safeText = (value, max = 120) => String(value ?? '').trim().slice(0, max);
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
  const validIso = value => value && !Number.isNaN(Date.parse(String(value))) ? String(value) : null;
  const validHex = value => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : '#64748b';
  const normalizeTriState = value => TRI_STATES.includes(String(value)) ? String(value) : 'Unknown';
  const normalizeOwner = (value, fallback = 'Bill') => OWNERS.includes(String(value)) ? String(value) : (OWNERS.includes(String(fallback)) ? String(fallback) : 'Bill');
  const lowerId = value => safeText(value, 120).toLowerCase();

  function normalizeQuantityEvidence(input = {}, {spoolId = ''} = {}) {
    const method = QUANTITY_EVIDENCE_METHODS.includes(String(input.method)) ? String(input.method) : 'Unknown';
    const grossGrams = isFiniteNumber(input.grossGrams) ? Math.max(0, Number(input.grossGrams)) : null;
    const tareGrams = isFiniteNumber(input.tareGrams) ? Math.max(0, Number(input.tareGrams)) : null;
    let remainingGrams = isFiniteNumber(input.remainingGrams) ? Math.max(0, Number(input.remainingGrams)) : null;
    if (method === 'Measured' && grossGrams !== null && tareGrams !== null && grossGrams >= tareGrams) remainingGrams = Math.max(0, grossGrams - tareGrams);
    if (method === 'Unknown') remainingGrams = null;
    return Object.freeze({
      evidenceId:safeText(input.evidenceId,120), spoolId:safeText(input.spoolId || spoolId,64), method,
      grossGrams, tareGrams, remainingGrams, source:safeText(input.source,120), observedAt:validIso(input.observedAt),
      confidence:CONFIDENCE_LEVELS.includes(String(input.confidence)) ? String(input.confidence) : 'Unknown',
      staleAfter:validIso(input.staleAfter), derivedFromEvidenceId:safeText(input.derivedFromEvidenceId,120),
    });
  }

  function normalizeQuantityEvidenceList(value, {spoolId = ''} = {}) {
    if (!Array.isArray(value)) return [];
    return value.map(row => normalizeQuantityEvidence(row,{spoolId}));
  }

  function legacyQuantityEvidence(spool = {}) {
    const spoolId = safeText(spool.id,64);
    if (isFiniteNumber(spool.gross) && isFiniteNumber(spool.tare) && Number(spool.gross) >= Number(spool.tare)) return normalizeQuantityEvidence({spoolId,method:'Measured',grossGrams:Number(spool.gross),tareGrams:Number(spool.tare),remainingGrams:Number(spool.gross)-Number(spool.tare),source:'legacy-scale',observedAt:spool.remainingEvidenceAt || spool.updatedAt,confidence:'Confirmed'},{spoolId});
    if (isFiniteNumber(spool.estimatedRemainingGrams)) return normalizeQuantityEvidence({spoolId,method:'Printer-estimated usage',remainingGrams:Number(spool.estimatedRemainingGrams),source:'legacy-usage',observedAt:spool.remainingEvidenceAt || spool.updatedAt,confidence:spool.confidence},{spoolId});
    if (isFiniteNumber(spool.visualPercent)) {
      const nominal = isFiniteNumber(spool.startWeight) && Number(spool.startWeight)>0 ? Number(spool.startWeight) : null;
      const percent = clamp(Number(spool.visualPercent),0,100);
      return normalizeQuantityEvidence({spoolId,method:'Visual estimate',remainingGrams:nominal===null ? null : Math.round(nominal*percent/100),source:'legacy-visual',observedAt:spool.remainingEvidenceAt || spool.updatedAt,confidence:spool.confidence},{spoolId});
    }
    return normalizeQuantityEvidence({spoolId,method:'Unknown',source:'legacy-unknown'},{spoolId});
  }

  function evidenceTimestamp(evidence = {}) {
    const stamp = Date.parse(evidence.observedAt || '');
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function quantityEvidenceLineage(spool = {}) {
    const explicit = normalizeQuantityEvidenceList(spool.quantityEvidence,{spoolId:spool.id});
    const byId = new Map();
    const children = new Map();
    const issues = [];
    for (const evidence of explicit) {
      const id = lowerId(evidence.evidenceId);
      if (id && !byId.has(id)) byId.set(id,evidence);
    }
    for (const evidence of explicit) {
      const id = lowerId(evidence.evidenceId);
      const parentId = lowerId(evidence.derivedFromEvidenceId);
      if (!parentId) continue;
      if (!id) { issues.push(Object.freeze({code:'derived-evidence-id-required',evidenceId:null,parentEvidenceId:evidence.derivedFromEvidenceId})); continue; }
      if (id === parentId) { issues.push(Object.freeze({code:'quantity-evidence-self-reference',evidenceId:evidence.evidenceId,parentEvidenceId:evidence.derivedFromEvidenceId})); continue; }
      const parent = byId.get(parentId);
      if (!parent) { issues.push(Object.freeze({code:'quantity-evidence-parent-missing',evidenceId:evidence.evidenceId,parentEvidenceId:evidence.derivedFromEvidenceId})); continue; }
      if (lowerId(parent.spoolId || spool.id) !== lowerId(evidence.spoolId || spool.id)) { issues.push(Object.freeze({code:'quantity-evidence-parent-spool-mismatch',evidenceId:evidence.evidenceId,parentEvidenceId:evidence.derivedFromEvidenceId})); continue; }
      const list = children.get(parentId) || [];
      list.push(evidence);
      children.set(parentId,list);
    }

    const cycleIds = new Set();
    for (const evidence of explicit) {
      const start = lowerId(evidence.evidenceId);
      if (!start) continue;
      const seen = new Set();
      let current = evidence;
      while (current?.derivedFromEvidenceId) {
        const currentId = lowerId(current.evidenceId);
        if (seen.has(currentId)) { seen.forEach(id => cycleIds.add(id)); break; }
        seen.add(currentId);
        const parentId = lowerId(current.derivedFromEvidenceId);
        if (!parentId || parentId === currentId) break;
        current = byId.get(parentId);
        if (!current) break;
      }
    }
    if (cycleIds.size) issues.push(Object.freeze({code:'quantity-evidence-cycle',evidenceIds:Object.freeze([...cycleIds])}));

    const validChildIds = new Set();
    for (const [parentId,list] of children) {
      if (cycleIds.has(parentId)) continue;
      for (const child of list) if (!cycleIds.has(lowerId(child.evidenceId))) validChildIds.add(parentId);
    }
    let terminals = explicit.filter(evidence => {
      const id = lowerId(evidence.evidenceId);
      return !id || (!validChildIds.has(id) && !cycleIds.has(id));
    });
    if (!terminals.length) terminals = explicit.slice();
    const newest = Math.max(0,...terminals.map(evidenceTimestamp));
    const currentHeads = terminals.filter(evidence => newest === 0 || newest - evidenceTimestamp(evidence) <= QUANTITY_CONFLICT_WINDOW_MS);
    const selectedPool = currentHeads.length ? currentHeads : terminals;
    const selected = selectedPool.slice().sort((a,b) => {
      const timeDelta = evidenceTimestamp(b) - evidenceTimestamp(a);
      if (Math.abs(timeDelta) > QUANTITY_CONFLICT_WINDOW_MS) return timeDelta;
      const priority = (QUANTITY_EVIDENCE_PRIORITY[b.method] || 0) - (QUANTITY_EVIDENCE_PRIORITY[a.method] || 0);
      return priority || timeDelta;
    })[0] || legacyQuantityEvidence(spool);
    return Object.freeze({explicit:Object.freeze(explicit),terminals:Object.freeze(terminals),currentHeads:Object.freeze(currentHeads),selected,issues:Object.freeze(issues),cycleEvidenceIds:Object.freeze([...cycleIds])});
  }

  function strongestQuantityEvidence(spool = {}) {
    const explicit = normalizeQuantityEvidenceList(spool.quantityEvidence,{spoolId:spool.id});
    if (!explicit.length) return legacyQuantityEvidence(spool);
    return quantityEvidenceLineage(spool).selected;
  }

  function evidenceAgeDays(evidence = {}, now = Date.now()) {
    const stamp=evidenceTimestamp(evidence); return stamp ? Math.max(0,Math.floor((Number(now)-stamp)/86400000)) : null;
  }
  function isEvidenceStale(evidence = {}, now = Date.now()) {
    const staleAt=Date.parse(evidence.staleAfter || ''); return Number.isFinite(staleAt) ? Number(now)>staleAt : false;
  }
  function relatedByLineage(first,second,byId) {
    const firstId=lowerId(first?.evidenceId), secondId=lowerId(second?.evidenceId);
    if (!firstId || !secondId) return false;
    const reaches=(fromId,targetId) => {
      const seen=new Set(); let node=byId.get(fromId);
      while (node?.derivedFromEvidenceId) {
        const parent=lowerId(node.derivedFromEvidenceId);
        if (parent===targetId) return true;
        if (!parent || seen.has(parent)) return false;
        seen.add(parent); node=byId.get(parent);
      }
      return false;
    };
    return reaches(firstId,secondId) || reaches(secondId,firstId);
  }

  function quantityEvidenceAssessment(spool = {}, now = Date.now()) {
    const lineage=quantityEvidenceLineage(spool);
    const explicit=lineage.explicit;
    const selected=explicit.length ? lineage.selected : legacyQuantityEvidence(spool);
    const byId=new Map(explicit.filter(e=>e.evidenceId).map(e=>[lowerId(e.evidenceId),e]));
    const heads=(lineage.currentHeads.length ? lineage.currentHeads : lineage.terminals).filter(e=>e.remainingGrams!==null && e.method!=='Unknown' && evidenceTimestamp(e));
    const conflicts=[];
    for (let i=0;i<heads.length;i+=1) for (let j=i+1;j<heads.length;j+=1) {
      const first=heads[i],second=heads[j];
      if (relatedByLineage(first,second,byId)) continue;
      const timeDelta=Math.abs(evidenceTimestamp(first)-evidenceTimestamp(second));
      if (timeDelta>QUANTITY_CONFLICT_WINDOW_MS) continue;
      const largest=Math.max(first.remainingGrams,second.remainingGrams,1);
      const tolerance=Math.max(QUANTITY_CONFLICT_MIN_GRAMS,largest*0.02);
      if (Math.abs(first.remainingGrams-second.remainingGrams)<=tolerance) continue;
      conflicts.push(Object.freeze({evidenceIds:Object.freeze([first.evidenceId || null,second.evidenceId || null]),remainingGrams:Object.freeze([first.remainingGrams,second.remainingGrams]),observedAt:Object.freeze([first.observedAt,second.observedAt]),differenceGrams:Math.round(Math.abs(first.remainingGrams-second.remainingGrams)*10)/10}));
    }
    const stale=isEvidenceStale(selected,now);
    const lineageInvalid=lineage.issues.some(issue=>['quantity-evidence-self-reference','quantity-evidence-parent-missing','quantity-evidence-parent-spool-mismatch','quantity-evidence-cycle'].includes(issue.code));
    const conflictEvidenceIds=[...new Set(conflicts.flatMap(c=>c.evidenceIds).filter(Boolean))];
    const status=selected.method==='Unknown' || selected.remainingGrams===null ? 'unknown' : lineageInvalid ? 'invalid-lineage' : conflicts.length ? 'conflict' : stale ? 'stale' : 'current';
    return Object.freeze({status,selected,explicit:explicit.length>0,evidenceCount:explicit.length,ageDays:evidenceAgeDays(selected,now),stale,conflict:conflicts.length>0,conflicts:Object.freeze(conflicts),conflictEvidenceIds:Object.freeze(conflictEvidenceIds),terminalEvidenceIds:Object.freeze(lineage.terminals.map(e=>e.evidenceId).filter(Boolean)),currentHeadEvidenceIds:Object.freeze(lineage.currentHeads.map(e=>e.evidenceId).filter(Boolean)),lineageIssues:lineage.issues,verificationRequired:status!=='current'});
  }

  function normalizeMemberId(value) {
    return safeText(value,64).toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');
  }

  function normalizeHouseholdMember(input = {}) {
    const memberId=normalizeMemberId(input.memberId || input.id);
    return Object.freeze({
      memberId,
      displayName:safeText(input.displayName || input.name || memberId,80),
      status:String(input.status)==='Inactive'?'Inactive':'Active',
    });
  }

  function normalizeHousehold(input = {}, {legacyProfile = ''} = {}) {
    const householdId=normalizeMemberId(input.householdId || input.id || 'default-household') || 'default-household';
    const membersRaw=Array.isArray(input.members)?input.members:[];
    let members=membersRaw.map(normalizeHouseholdMember).filter(row=>row.memberId);
    if (!members.length && legacyProfile) {
      const memberId=normalizeMemberId(legacyProfile);
      if (memberId) members=[normalizeHouseholdMember({memberId,displayName:legacyProfile})];
    }
    const seen=new Set();
    members=members.filter(row=>{ if(seen.has(row.memberId)) return false; seen.add(row.memberId); return true; });
    return Object.freeze({householdId,members:Object.freeze(members)});
  }

  function normalizeResourceScope(input = {}, {legacyOwner = '', householdId = 'default-household'} = {}) {
    const ownerMemberId=normalizeMemberId(input.ownerMemberId || input.memberId || legacyOwner);
    const visibility=RESOURCE_VISIBILITY.includes(String(input.visibility))?String(input.visibility):'Private';
    const sharedRaw=Array.isArray(input.sharedWithMemberIds)?input.sharedWithMemberIds:[];
    const sharedWithMemberIds=visibility==='Shared'
      ? [...new Set(sharedRaw.map(normalizeMemberId).filter(id=>id && id!==ownerMemberId))]
      : [];
    return Object.freeze({
      householdId:normalizeMemberId(input.householdId || householdId) || householdId,
      ownerMemberId,
      visibility,
      sharedWithMemberIds:Object.freeze(sharedWithMemberIds),
    });
  }

  function normalizePlacement(input = {}, legacy = {}) {
    const raw=input && typeof input==='object'?input:{};
    const hasExplicit=Object.keys(raw).length>0;
    const fallback=hasExplicit?{}:legacy;
    const source=safeText(raw.source || fallback.source || (hasExplicit?'placement-evidence':'legacy-placement'),120);
    const observedAt=validIso(raw.observedAt || raw.timestamp || fallback.observedAt || fallback.loadedAt || fallback.updatedAt);
    const explicitlyStale=raw.stale===true || String(raw.freshness||'').toLowerCase()==='stale';
    // An explicit placement object is authoritative as an observation. Never
    // complete a partial explicit observation from unrelated legacy fields.
    // Incomplete explicit placement must surface Conflict/Unknown.
    const printerId=safeText(raw.printerId || fallback.printerId || fallback.printerName,64);
    const feederId=safeText(raw.feederId || raw.amsId || fallback.feederId || fallback.feederName,64);
    const slotValue=raw.slot ?? raw.slotId ?? fallback.slot ?? fallback.feederSlot;
    const rawSlot=isFiniteNumber(slotValue) ? Number(slotValue) : null;
    const slot=rawSlot===null?null:Math.trunc(rawSlot);
    const kindText=String(raw.kind || raw.type || raw.state || fallback.kind || fallback.state || '').toLowerCase();
    if (['stored','unloaded'].includes(kindText)) {
      const conflict=Boolean(printerId||feederId||slot!==null||raw.external===true);
      return Object.freeze({kind:'Stored',state:'Stored',printerId:null,feederId:null,slot:null,external:false,source,observedAt,status:conflict?'Conflict':explicitlyStale?'Stale':'Current',verificationRequired:conflict||explicitlyStale});
    }
    if (['external','external-spool'].includes(kindText) || raw.external===true) {
      const conflict=!printerId || Boolean(feederId) || slot!==null;
      return Object.freeze({kind:'External',state:'Loaded',printerId:printerId||null,feederId:null,slot:null,external:true,source,observedAt,status:conflict?'Conflict':explicitlyStale?'Stale':'Current',verificationRequired:conflict||explicitlyStale});
    }
    if (['feeder','ams','loaded'].includes(kindText) || printerId || feederId || slot!==null) {
      const valid=Boolean(printerId&&feederId&&slot!==null&&slot>=0);
      return Object.freeze({kind:'Feeder',state:'Loaded',printerId:printerId||null,feederId:feederId||null,slot:valid?slot:null,external:false,source,observedAt,status:valid?(explicitlyStale?'Stale':'Current'):'Conflict',verificationRequired:!valid||explicitlyStale});
    }
    return Object.freeze({kind:'Unknown',state:'Unknown',printerId:null,feederId:null,slot:null,external:null,source:source||null,observedAt,status:'Unknown',verificationRequired:true});
  }

  function normalizeUsageEvent(input = {}) {
    const beforeGrams=isFiniteNumber(input.beforeGrams)?Math.max(0,Number(input.beforeGrams)):null;
    const afterGrams=isFiniteNumber(input.afterGrams)?Math.max(0,Number(input.afterGrams)):null;
    let consumedGrams=isFiniteNumber(input.consumedGrams)?Math.max(0,Number(input.consumedGrams)):null;
    if (consumedGrams===null&&beforeGrams!==null&&afterGrams!==null&&beforeGrams>=afterGrams) consumedGrams=Math.round((beforeGrams-afterGrams)*10)/10;
    const beforeEvidenceId=safeText(input.beforeEvidenceId,120);
    const afterEvidenceId=safeText(input.afterEvidenceId,120);
    const evidenceIds=[
      ...(Array.isArray(input.quantityEvidenceIds)?input.quantityEvidenceIds:[]),
      beforeEvidenceId,
      afterEvidenceId,
    ].map(v=>safeText(v,120)).filter(Boolean);
    return Object.freeze({
      eventId:safeText(input.eventId || input.usageEventId || input.id,120),
      spoolId:safeText(input.spoolId,64),
      printerId:safeText(input.printerId || input.printer,64),
      projectId:safeText(input.projectId,120),
      printJobId:safeText(input.printJobId || input.jobId,120),
      beforeGrams,afterGrams,consumedGrams,
      source:USAGE_SOURCES.includes(String(input.source))?String(input.source):'Unknown',
      observedAt:validIso(input.observedAt || input.timestamp),
      confidence:CONFIDENCE_LEVELS.includes(String(input.confidence))?String(input.confidence):'Unknown',
      beforeEvidenceId,
      afterEvidenceId,
      quantityEvidenceIds:Object.freeze([...new Set(evidenceIds)]),
    });
  }

  function normalizeUsageEvents(value) {
    if (!Array.isArray(value)) return [];
    const byId=new Map();
    for (const raw of value) {
      const row=normalizeUsageEvent(raw);
      if (!row.eventId || !row.spoolId || !row.observedAt || row.consumedGrams===null || row.consumedGrams<=0) continue;
      const key=lowerId(row.eventId);
      const old=byId.get(key);
      if (!old) byId.set(key,row);
      else if (JSON.stringify(old)!==JSON.stringify(row)) {
        // Keep the first immutable event. Conflict detection belongs at the write/sync boundary.
        continue;
      }
    }
    return [...byId.values()].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt)||a.eventId.localeCompare(b.eventId));
  }

  function appendUsageEvent(stateRaw = {}, eventRaw = {}) {
    const state={...stateRaw,usageEvents:normalizeUsageEvents(stateRaw.usageEvents)};
    const event=normalizeUsageEvent(eventRaw);
    if (!event.eventId) return {changed:false,reason:'usage-event-id-required',state,event};
    if (!event.spoolId) return {changed:false,reason:'usage-event-spool-required',state,event};
    if (!event.observedAt) return {changed:false,reason:'usage-event-time-required',state,event};
    if (event.consumedGrams===null || event.consumedGrams<=0) return {changed:false,reason:'usage-event-consumption-required',state,event};
    if (event.beforeGrams!==null&&event.afterGrams!==null&&event.afterGrams>event.beforeGrams) return {changed:false,reason:'usage-event-negative-consumption',state,event};
    const existing=state.usageEvents.find(row=>lowerId(row.eventId)===lowerId(event.eventId));
    if (existing) {
      const same=JSON.stringify(existing)===JSON.stringify(event);
      return {changed:false,reason:same?'usage-event-exists':'usage-event-id-conflict',state,event:existing};
    }
    state.usageEvents=normalizeUsageEvents([...state.usageEvents,event]);
    return {changed:true,state,event};
  }

  function usageForecast(spool = {}, usageEvents = [], now = Date.now(), options = {}) {
    const current=measurement(spool,now);
    if (current.grams===null || current.verificationRequired) return Object.freeze({status:'Undetermined',reason:'quantity-evidence-not-current',dailyGrams:null,daysRemaining:null,depletionDate:null,eventIds:Object.freeze([]),quantityEvidenceId:current.evidenceId||null});
    const rows=normalizeUsageEvents(usageEvents).filter(row=>lowerId(row.spoolId)===lowerId(spool.id)&&row.consumedGrams!==null&&row.consumedGrams>0);
    const minEvents=Math.max(2,Number(options.minEvents)||2);
    const minSpanDays=Math.max(1,Number(options.minSpanDays)||1);
    if (rows.length<minEvents) return Object.freeze({status:'Undetermined',reason:'insufficient-usage-history',dailyGrams:null,daysRemaining:null,depletionDate:null,eventIds:Object.freeze(rows.map(row=>row.eventId)),quantityEvidenceId:current.evidenceId||null});
    const first=Date.parse(rows[0].observedAt),last=Date.parse(rows[rows.length-1].observedAt);
    const spanDays=(last-first)/86400000;
    if (!Number.isFinite(spanDays)||spanDays<minSpanDays) return Object.freeze({status:'Undetermined',reason:'usage-window-too-short',dailyGrams:null,daysRemaining:null,depletionDate:null,eventIds:Object.freeze(rows.map(row=>row.eventId)),quantityEvidenceId:current.evidenceId||null});
    const total=Math.round(rows.reduce((sum,row)=>sum+row.consumedGrams,0)*10)/10;
    const daily=Math.round((total/spanDays)*10)/10;
    if (!(daily>0)) return Object.freeze({status:'Undetermined',reason:'usage-rate-unavailable',dailyGrams:null,daysRemaining:null,depletionDate:null,eventIds:Object.freeze(rows.map(row=>row.eventId)),quantityEvidenceId:current.evidenceId||null});
    const daysRemaining=Math.max(0,Math.round((current.grams/daily)*10)/10);
    const depletionDate=new Date(Number(now)+daysRemaining*86400000).toISOString();
    const threshold=isFiniteNumber(options.reorderThresholdGrams)?Math.max(0,Number(options.reorderThresholdGrams)):(isFiniteNumber(spool.reorderThreshold)?Math.max(0,Number(spool.reorderThreshold)):DEFAULT_REORDER_GRAMS);
    const daysToThreshold=Math.max(0,Math.round(((Math.max(0,current.grams-threshold))/daily)*10)/10);
    const thresholdDate=new Date(Number(now)+daysToThreshold*86400000).toISOString();
    const leadDays=Math.max(0,Number(options.leadTimeDays)||0);
    const orderByDate=new Date(Math.max(Number(now),Date.parse(thresholdDate)-leadDays*86400000)).toISOString();
    const confidence=rows.length>=10&&spanDays>=30?'High':rows.length>=5&&spanDays>=14?'Medium':'Low';
    return Object.freeze({
      status:'Projected',
      reason:'usage-history',
      method:'historical-usage-rate',
      dailyGrams:daily,
      totalConsumedGrams:total,
      daysRemaining,
      depletionDate,
      reorderThresholdGrams:threshold,
      thresholdDate,
      leadTimeDays:leadDays,
      orderByDate,
      confidence,
      eventIds:Object.freeze(rows.map(row=>row.eventId)),
      quantityEvidenceId:current.evidenceId||null,
    });
  }

  function normalizeSpool(input = {}, {owner = 'Bill', householdId = 'default-household'} = {}) {
    const id=safeText(input.spoolId || input.id,64), nominal=isFiniteNumber(input.startWeight)&&Number(input.startWeight)>0?Number(input.startWeight):null;
    const gross=isFiniteNumber(input.gross)?Math.max(0,Number(input.gross)):null, tare=isFiniteNumber(input.tare)?Math.max(0,Number(input.tare)):null;
    const visualPercent=isFiniteNumber(input.visualPercent)?clamp(Number(input.visualPercent),0,100):null;
    const estimatedRemainingGrams=isFiniteNumber(input.estimatedRemainingGrams)?Math.max(0,Number(input.estimatedRemainingGrams)):null;
    const archivedAt=validIso(input.archivedAt);
    const legacyOwner=normalizeOwner(input.owner,owner);
    const resourceScope=normalizeResourceScope(input.resourceScope || input,{legacyOwner,householdId});
    const legacyPlacement={
      state:input.placementState,
      printerName:input.printerName,
      feederName:input.feederName,
      feederSlot:input.feederSlot,
      loadedAt:input.loadedAt,
      updatedAt:input.updatedAt,
    };
    let placement=normalizePlacement(input.placement,legacyPlacement);
    if (archivedAt) placement=normalizePlacement({kind:'Stored',source:'archive',observedAt:archivedAt});
    const placementState=placement.state==='Loaded'?'Loaded':'Stored';
    // Canonical placement IDs own physical identity. Legacy name fields are
    // presentation-only compatibility labels and must stay human-readable
    // when the caller already supplied them.
    const printerName=placement.state==='Loaded'?(safeText(input.printerName,60)||placement.printerId||''):'';
    const feederName=placement.state==='Loaded'&&!placement.external?(safeText(input.feederName,60)||placement.feederId||''):'';
    const feederSlot=placement.state==='Loaded'&&!placement.external&&placement.slot!==null?String(placement.slot):'';
    return {...input,id,spoolId:id,brand:safeText(input.brand||'Unknown',60)||'Unknown',productLine:safeText(input.productLine,80),material:safeText(input.material||'Unknown',80)||'Unknown',colorName:safeText(input.colorName||'Unknown',80)||'Unknown',colorHex:validHex(input.colorHex),diameterMm:isFiniteNumber(input.diameterMm)&&Number(input.diameterMm)>0?Number(input.diameterMm):null,manufacturerSku:safeText(input.manufacturerSku,80),lotBatch:safeText(input.lotBatch,80),spoolType:safeText(input.spoolType||'Unknown',40)||'Unknown',startWeight:nominal,visualPercent,estimatedRemainingGrams,gross,tare,quantityEvidence:normalizeQuantityEvidenceList(input.quantityEvidence,{spoolId:id}),location:safeText(input.location,80),confidence:CONFIDENCE_LEVELS.includes(String(input.confidence))?String(input.confidence):'Unknown',opened:normalizeTriState(input.opened),bagged:normalizeTriState(input.bagged),purchaseSource:safeText(input.purchaseSource,100),purchasePrice:isFiniteNumber(input.purchasePrice)&&Number(input.purchasePrice)>=0?Number(input.purchasePrice):null,purchaseDate:validDate(input.purchaseDate),reorderThreshold:isFiniteNumber(input.reorderThreshold)&&Number(input.reorderThreshold)>=0?Number(input.reorderThreshold):DEFAULT_REORDER_GRAMS,lastDriedDate:validDate(input.lastDriedDate),owner:legacyOwner,resourceScope,householdId:resourceScope.householdId,ownerMemberId:resourceScope.ownerMemberId,visibility:resourceScope.visibility,sharedWithMemberIds:[...resourceScope.sharedWithMemberIds],placement,placementState,printerName,feederName,feederSlot,loadedAt:placement.state==='Loaded'?(placement.observedAt||validIso(input.loadedAt)||null):null,lastUsedAt:validIso(input.lastUsedAt),notes:safeText(input.notes,1000),createdAt:validIso(input.createdAt),updatedAt:validIso(input.updatedAt),archivedAt};
  }
  function measurement(spool = {}, now = Date.now()) {
    const nominal=isFiniteNumber(spool.startWeight)&&Number(spool.startWeight)>0?Number(spool.startWeight):null;
    if (Array.isArray(spool.quantityEvidence)&&spool.quantityEvidence.length) {
      const assessment=quantityEvidenceAssessment(spool,now),evidence=assessment.selected,grams=evidence.remainingGrams;
      const percent=grams!==null&&nominal?Math.round(clamp(grams/nominal*100,0,100)*10)/10:null;
      const base={evidence:'quantity-evidence',evidenceId:evidence.evidenceId||null,method:evidence.method,observedAt:evidence.observedAt,staleAfter:evidence.staleAfter,derivedFromEvidenceId:evidence.derivedFromEvidenceId||null,stale:assessment.stale,conflict:assessment.conflict,evidenceStatus:assessment.status,verificationRequired:assessment.verificationRequired};
      if (evidence.method==='Measured'||evidence.method==='Calculated from measured') return {...base,grams,percent,source:'Measured',measured:true};
      if (evidence.method!=='Unknown') return {...base,grams,percent,source:'Estimated',measured:false};
      return {...base,grams:null,percent:null,source:'Unknown',measured:false};
    }
    if (isFiniteNumber(spool.gross)&&isFiniteNumber(spool.tare)&&Number(spool.gross)>=Number(spool.tare)) { const grams=Math.max(0,Number(spool.gross)-Number(spool.tare)); return {grams,percent:nominal?Math.round(clamp(grams/nominal*100,0,100)*10)/10:null,source:'Measured',evidence:'scale',measured:true}; }
    if (isFiniteNumber(spool.estimatedRemainingGrams)) { const grams=Math.max(0,Number(spool.estimatedRemainingGrams)); return {grams,percent:nominal?Math.round(clamp(grams/nominal*100,0,100)*10)/10:null,source:'Estimated',evidence:'usage',measured:false}; }
    if (isFiniteNumber(spool.visualPercent)) { const percent=clamp(Number(spool.visualPercent),0,100); return {grams:nominal?Math.round(nominal*percent/100):null,percent,source:'Estimated',evidence:'visual',measured:false}; }
    return {grams:null,percent:null,source:'Unknown',evidence:'none',measured:false};
  }

  function stockState(spool={}) { if (spool.archivedAt) return 'Archived'; const remaining=measurement(spool); if (remaining.grams===null) return 'Unknown'; if (remaining.grams===0) return 'Empty'; const threshold=isFiniteNumber(spool.reorderThreshold)?Number(spool.reorderThreshold):DEFAULT_REORDER_GRAMS; return remaining.grams<=threshold?'Low':'Available'; }
  function lifecycle(spool={}) { if (spool.archivedAt) return 'Archived'; const stock=stockState(spool); if (stock==='Empty') return 'Empty'; if (String(spool.placementState)==='Loaded') return 'Loaded'; if (stock==='Low') return 'Low'; return 'Available'; }
  function reorderNeeded(spool={}) { const stock=stockState(spool); return stock==='Low'||stock==='Empty'; }
  function productLabel(spool={}) { return [spool.brand,spool.productLine,spool.material].map(v=>safeText(v,80)).filter(v=>v&&v!=='Unknown').join(' · ')||'Unknown filament'; }
  function placementLabel(spool={}) { if (spool.archivedAt) return 'Archived'; if (String(spool.placementState)!=='Loaded') return safeText(spool.location,80)||'Stored / unassigned'; return [safeText(spool.printerName,60)||'Loaded',safeText(spool.feederName,60),safeText(spool.feederSlot,24)?`Slot ${safeText(spool.feederSlot,24)}`:''].filter(Boolean).join(' · '); }
  function evidenceLabel(spool={}) { const remaining=measurement(spool),caveat=remaining.conflict?' · conflict':remaining.stale?' · stale':remaining.evidenceStatus==='invalid-lineage'?' · lineage issue':''; if (remaining.source==='Measured') return remaining.method?`${remaining.method} · evidence${caveat}`:'Measured · scale'; if (remaining.evidence==='quantity-evidence'&&remaining.method) return `${remaining.method}${remaining.grams===null?' · amount unknown':''}${caveat}`; if (remaining.evidence==='usage') return remaining.grams===null?'Estimated · usage · amount unknown':'Estimated · usage'; if (remaining.evidence==='visual') return remaining.grams===null?'Estimated · visual · nominal unknown':'Estimated · visual'; return 'Unknown · verify'; }
  function workflowSummary(input={},options={}) { const spool=normalizeSpool(input,options),remaining=measurement(spool),stock=stockState(spool); return Object.freeze({spool,productLabel:productLabel(spool),placementLabel:placementLabel(spool),lifecycle:lifecycle(spool),stock,measurement:remaining,evidenceLabel:evidenceLabel(spool),reorderNeeded:reorderNeeded(spool),needsMeasurement:remaining.grams===null||remaining.source!=='Measured'||Boolean(remaining.verificationRequired),loaded:spool.placementState==='Loaded'&&!spool.archivedAt,archived:Boolean(spool.archivedAt)}); }

  function validateSpool(input={},options={}) {
    const spool=normalizeSpool(input,options),errors=[],warnings=[];
    if (!spool.id) errors.push({code:'id-required',field:'id',message:'Spool ID is required.'});
    if (spool.gross!==null&&spool.tare!==null&&spool.gross<spool.tare) errors.push({code:'gross-below-tare',field:'gross',message:'Gross weight cannot be less than tare weight.'});
    const evidenceIds=new Set();
    for (const evidence of spool.quantityEvidence) {
      if (evidence.spoolId&&lowerId(evidence.spoolId)!==lowerId(spool.id)) errors.push({code:'quantity-evidence-spool-mismatch',field:'quantityEvidence',evidenceId:evidence.evidenceId,message:'Quantity evidence belongs to a different spool.'});
      if (evidence.evidenceId) { const key=lowerId(evidence.evidenceId); if (evidenceIds.has(key)) errors.push({code:'duplicate-quantity-evidence-id',field:'quantityEvidence',evidenceId:evidence.evidenceId,message:`Duplicate quantity evidence ID: ${evidence.evidenceId}.`}); else evidenceIds.add(key); }
      if (evidence.grossGrams!==null&&evidence.tareGrams!==null&&evidence.grossGrams<evidence.tareGrams) errors.push({code:'quantity-evidence-gross-below-tare',field:'quantityEvidence',evidenceId:evidence.evidenceId,message:'Quantity evidence gross weight cannot be less than tare weight.'});
      if (evidence.method==='Measured'&&(evidence.grossGrams===null||evidence.tareGrams===null)) warnings.push({code:'measured-evidence-missing-gross-or-tare',field:'quantityEvidence',evidenceId:evidence.evidenceId,message:'Measured quantity evidence should preserve both gross and tare grams.'});
      if (evidence.method==='Calculated from measured'&&!evidence.derivedFromEvidenceId) warnings.push({code:'derived-evidence-missing-source',field:'quantityEvidence',evidenceId:evidence.evidenceId,message:'Calculated quantity evidence should identify its source evidence.'});
    }
    const assessment=quantityEvidenceAssessment(spool);
    for (const issue of assessment.lineageIssues) {
      if (['quantity-evidence-self-reference','quantity-evidence-parent-missing','quantity-evidence-parent-spool-mismatch','quantity-evidence-cycle'].includes(issue.code)) errors.push({...issue,field:'quantityEvidence',message:issue.code==='quantity-evidence-cycle'?'Quantity evidence derivation contains a cycle.':'Quantity evidence derivation is invalid.'});
      else warnings.push({...issue,field:'quantityEvidence',message:'Quantity evidence derivation is incomplete.'});
    }
    if (assessment.conflict) warnings.push({code:'quantity-evidence-conflict',field:'quantityEvidence',evidenceIds:assessment.conflictEvidenceIds,message:'Current quantity evidence heads conflict; verify before relying on one value.'});
    if (assessment.currentHeadEvidenceIds.length>1&&!assessment.conflict) warnings.push({code:'multiple-quantity-evidence-heads',field:'quantityEvidence',evidenceIds:assessment.currentHeadEvidenceIds,message:'Multiple current quantity evidence heads exist; the best-supported contemporaneous observation is selected while all heads remain inspectable.'});
    const remaining=measurement(spool);
    if (remaining.measured&&spool.startWeight!==null&&remaining.grams!==null&&remaining.grams>spool.startWeight) warnings.push({code:'remaining-above-nominal',field:'gross',message:'Measured filament remaining exceeds the nominal filament weight; verify tare and nominal weight.'});
    if (spool.diameterMm!==null&&(spool.diameterMm<1||spool.diameterMm>3)) warnings.push({code:'diameter-unusual',field:'diameterMm',message:'Filament diameter is outside the typical 1–3 mm range.'});
    if (spool.placementState==='Loaded'&&!spool.printerName) warnings.push({code:'loaded-without-printer',field:'printerName',message:'Loaded spool does not identify a printer.'});
    return {spool,errors,warnings,valid:errors.length===0};
  }

  function normalizeState(input={}, {owner}={}) {
    const profile=normalizeOwner(owner||input.profile,owner||'Bill');
    const household=normalizeHousehold(input.household || {householdId:input.householdId,members:input.members},{legacyProfile:profile});
    const spools=Array.isArray(input.spools)?input.spools.map(spool=>normalizeSpool(spool,{owner:profile,householdId:household.householdId})).filter(spool=>spool.id):[];
    const usageEvents=normalizeUsageEvents(input.usageEvents);
    return {...input,profile,household,householdId:household.householdId,spools,usageEvents};
  }
  function validateState(input={},options={}) {
    const state=normalizeState(input,options),errors=[],warnings=[],ids=new Map(),assignments=new Map(),globalEvidence=new Map();
    const memberIds=new Set(state.household.members.filter(member=>member.status==='Active').map(member=>member.memberId));
    for (const spool of state.spools) for (const evidence of spool.quantityEvidence) if (evidence.evidenceId) globalEvidence.set(lowerId(evidence.evidenceId),{spoolId:spool.id,evidence});
    for (const spool of state.spools) {
      const result=validateSpool(spool,{owner:state.profile,householdId:state.household.householdId}); result.errors.forEach(issue=>errors.push({...issue,spoolId:spool.id})); result.warnings.forEach(issue=>warnings.push({...issue,spoolId:spool.id}));
      if (spool.householdId!==state.household.householdId) errors.push({code:'spool-household-mismatch',spoolId:spool.id,message:'Spool belongs to a different household scope.'});
      if (!spool.ownerMemberId) warnings.push({code:'spool-owner-member-unknown',spoolId:spool.id,message:'Canonical owner member is not yet established.'});
      else if (memberIds.size && !memberIds.has(spool.ownerMemberId)) errors.push({code:'spool-owner-member-missing',spoolId:spool.id,memberId:spool.ownerMemberId,message:'Spool owner is not an active member of this household.'});
      if (spool.visibility==='Shared') for (const memberId of spool.sharedWithMemberIds) if (memberIds.size&&!memberIds.has(memberId)) errors.push({code:'spool-share-member-missing',spoolId:spool.id,memberId,message:'Shared resource references a member outside this household.'});
      for (const evidence of spool.quantityEvidence) if (evidence.derivedFromEvidenceId) { const parent=globalEvidence.get(lowerId(evidence.derivedFromEvidenceId)); if (parent&&lowerId(parent.spoolId)!==lowerId(spool.id)) errors.push({code:'quantity-evidence-parent-spool-mismatch',spoolId:spool.id,evidenceId:evidence.evidenceId,parentEvidenceId:evidence.derivedFromEvidenceId,message:'Derived quantity evidence cannot reference evidence from another spool.'}); }
      const id=lowerId(spool.id); if (ids.has(id)) errors.push({code:'duplicate-id',spoolId:spool.id,message:`Duplicate spool ID: ${spool.id}.`}); else ids.set(id,spool.id);
      const placement=spool.placement;
      if (!spool.archivedAt&&placement?.state==='Loaded') {
        if (placement.verificationRequired) warnings.push({code:'placement-verification-required',spoolId:spool.id,message:'Loaded placement evidence is stale, incomplete, or conflicting.'});
        const key=placement.external?`${lowerId(placement.printerId)}|external`:[placement.printerId,placement.feederId,placement.slot].map(v=>safeText(v).toLowerCase()).join('|');
        if (key && key!=='||') { if (assignments.has(key)) errors.push({code:'slot-conflict',spoolId:spool.id,message:`${spool.id} conflicts with ${assignments.get(key)} in the same physical placement.`}); else assignments.set(key,spool.id); }
      }
      if (spool.archivedAt&&placement?.state==='Loaded') errors.push({code:'archived-spool-loaded',spoolId:spool.id,message:'Archived spools cannot remain loaded.'});
    }
    const usageIds=new Set();
    for (const event of state.usageEvents) {
      const eventKey=lowerId(event.eventId);
      if (usageIds.has(eventKey)) errors.push({code:'duplicate-usage-event-id',eventId:event.eventId,message:'Usage event IDs must be durable and unique.'}); else usageIds.add(eventKey);
      if (!ids.has(lowerId(event.spoolId))) errors.push({code:'usage-event-spool-missing',eventId:event.eventId,spoolId:event.spoolId,message:'Usage event references a spool outside this state.'});
      if (event.beforeGrams!==null&&event.afterGrams!==null&&event.beforeGrams<event.afterGrams) errors.push({code:'usage-event-negative-consumption',eventId:event.eventId,message:'Usage event afterGrams cannot exceed beforeGrams.'});
      if (event.beforeGrams!==null&&event.afterGrams!==null&&event.consumedGrams!==null) {
        const delta=Math.abs((event.beforeGrams-event.afterGrams)-event.consumedGrams);
        if (delta>1) warnings.push({code:'usage-event-consumption-mismatch',eventId:event.eventId,message:'Usage event consumedGrams does not match before/after evidence.'});
      }
    }
    return {state,errors,warnings,valid:errors.length===0};
  }

  return Object.freeze({DEFAULT_REORDER_GRAMS,OWNERS,PLACEMENT_STATES,LIFECYCLE_STATES,STOCK_STATES,CONFIDENCE_LEVELS,RESOURCE_VISIBILITY,PLACEMENT_KINDS,USAGE_SOURCES,QUANTITY_EVIDENCE_METHODS,QUANTITY_CONFLICT_WINDOW_MS,QUANTITY_CONFLICT_MIN_GRAMS,isFiniteNumber,numberOrNull,normalizeOwner,normalizeMemberId,normalizeHouseholdMember,normalizeHousehold,normalizeResourceScope,normalizePlacement,normalizeUsageEvent,normalizeUsageEvents,appendUsageEvent,usageForecast,normalizeQuantityEvidence,normalizeQuantityEvidenceList,quantityEvidenceLineage,strongestQuantityEvidence,evidenceAgeDays,isEvidenceStale,quantityEvidenceAssessment,normalizeSpool,normalizeState,measurement,stockState,lifecycle,reorderNeeded,productLabel,placementLabel,evidenceLabel,workflowSummary,validateSpool,validateState});
});