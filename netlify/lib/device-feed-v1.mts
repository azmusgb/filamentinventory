export type InventoryEnvelope = {
  key:string;
  updatedAt:string;
  state:any;
};

export type QuantityMethod =
  | 'Measured'
  | 'CalculatedFromMeasured'
  | 'PrinterEstimatedUsage'
  | 'VisualEstimate'
  | 'ImportedEstimate'
  | 'Unknown';

export type QuantityEvidenceStatus =
  | 'Current'
  | 'Stale'
  | 'Conflict'
  | 'InvalidLineage'
  | 'Unknown';

export type PlacementStatus =
  | 'Current'
  | 'Stale'
  | 'Conflict'
  | 'Unknown';

export type ReadinessState =
  | 'Ready'
  | 'ReadyWithSubstitute'
  | 'NeedsLoad'
  | 'NeedsDry'
  | 'InsufficientQuantity'
  | 'EvidenceStale'
  | 'Undetermined';

export type DeviceFeedV1 = {
  schemaVersion:1;
  generatedAt:string;
  scope:{type:'profile'; id:string};
  freshness:{sourceUpdatedAt:string|null; ageSeconds:number|null; stale:boolean};
  inventory:{status:'available'|'unavailable'; spools:Array<{
    spoolId:string;
    material:string|null;
    color:string|null;
    quantity:{
      evidenceId:string|null;
      remainingGrams:number|null;
      method:QuantityMethod;
      source:string|null;
      grossGrams:number|null;
      tareGrams:number|null;
      observedAt:string|null;
      staleAfter:string|null;
      confidence:string|null;
      status:QuantityEvidenceStatus;
      evidenceCount:number;
      conflict:boolean;
      conflictEvidenceIds:string[];
      verificationRequired:boolean;
    };
    placement:{
      status:PlacementStatus;
      state:'Stored'|'Loaded'|'Unknown';
      printerId:string|null;
      feederId:string|null;
      slot:number|null;
      external:boolean|null;
      observedAt:string|null;
      source:string|null;
      verificationRequired:boolean;
    };
  }>};
  readiness:{state:ReadinessState; reason:string; requiredGrams:number|null};
  unknowns:string[];
  attention:Array<{kind:string; message:string; spoolId?:string}>;
};

const STALE_AFTER_MS = 30 * 60 * 1000;
const QUANTITY_CONFLICT_WINDOW_MS = 5 * 60 * 1000;
const QUANTITY_CONFLICT_MIN_GRAMS = 10;

const QUANTITY_METHODS = new Map<string, QuantityMethod>([
  ['Measured','Measured'],
  ['Calculated from measured','CalculatedFromMeasured'],
  ['CalculatedFromMeasured','CalculatedFromMeasured'],
  ['Printer-estimated usage','PrinterEstimatedUsage'],
  ['PrinterEstimatedUsage','PrinterEstimatedUsage'],
  ['Visual estimate','VisualEstimate'],
  ['VisualEstimate','VisualEstimate'],
  ['Imported estimate','ImportedEstimate'],
  ['ImportedEstimate','ImportedEstimate'],
  ['Unknown','Unknown'],
]);

const QUANTITY_PRIORITY:Record<QuantityMethod,number> = {
  Measured:600,
  CalculatedFromMeasured:500,
  PrinterEstimatedUsage:400,
  VisualEstimate:300,
  ImportedEstimate:200,
  Unknown:0,
};

const READINESS = new Set<ReadinessState>([
  'Ready','ReadyWithSubstitute','NeedsLoad','NeedsDry',
  'InsufficientQuantity','EvidenceStale','Undetermined',
]);

function finite(value:unknown):number|null {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function text(value:unknown):string|null {
  const s = String(value ?? '').trim();
  return s ? s : null;
}
function time(value:unknown):number {
  const n = Date.parse(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}
function iso(value:unknown):string|null {
  const n = time(value);
  return n ? new Date(n).toISOString() : null;
}
function evidenceId(value:unknown):string|null {
  return text(value);
}
function normalizeMethod(value:unknown):QuantityMethod {
  return QUANTITY_METHODS.get(String(value ?? '')) || 'Unknown';
}
function confidence(value:unknown):string|null {
  const s = text(value);
  return s ? s.slice(0, 32) : null;
}
function lower(value:unknown):string {
  return String(value ?? '').trim().toLowerCase();
}

type NormalizedEvidence = {
  evidenceId:string|null;
  derivedFromEvidenceId:string|null;
  method:QuantityMethod;
  grossGrams:number|null;
  tareGrams:number|null;
  remainingGrams:number|null;
  source:string|null;
  observedAt:string|null;
  staleAfter:string|null;
  confidence:string|null;
};

function normalizeEvidence(row:any):NormalizedEvidence {
  const method = normalizeMethod(row?.method ?? row?.type);
  const grossGrams = finite(row?.grossGrams ?? row?.gross);
  const tareGrams = finite(row?.tareGrams ?? row?.tare);
  let remainingGrams = finite(row?.remainingGrams);
  if (remainingGrams === null && grossGrams !== null && tareGrams !== null && grossGrams >= tareGrams) {
    remainingGrams = grossGrams - tareGrams;
  }
  if (method === 'Unknown') remainingGrams = null;

  return {
    evidenceId:evidenceId(row?.evidenceId),
    derivedFromEvidenceId:evidenceId(row?.derivedFromEvidenceId),
    method,
    grossGrams:grossGrams === null ? null : Math.max(0, grossGrams),
    tareGrams:tareGrams === null ? null : Math.max(0, tareGrams),
    remainingGrams:remainingGrams === null ? null : Math.max(0, remainingGrams),
    source:text(row?.source),
    observedAt:iso(row?.observedAt ?? row?.timestamp),
    staleAfter:iso(row?.staleAfter),
    confidence:confidence(row?.confidence),
  };
}

function quantityHistory(spool:any):NormalizedEvidence[] {
  return Array.isArray(spool?.quantityEvidence)
    ? spool.quantityEvidence.filter(Boolean).map(normalizeEvidence)
    : [];
}

function lineageAssessment(history:NormalizedEvidence[]) {
  const byId = new Map<string,NormalizedEvidence>();
  const childParentIds = new Set<string>();
  const invalidIds = new Set<string>();
  let invalid = false;

  for (const row of history) {
    const id = lower(row.evidenceId);
    if (id && !byId.has(id)) byId.set(id,row);
  }

  for (const row of history) {
    const id = lower(row.evidenceId);
    const parentId = lower(row.derivedFromEvidenceId);
    if (!parentId) continue;
    if (!id || id === parentId || !byId.has(parentId)) {
      invalid = true;
      if (id) invalidIds.add(id);
      continue;
    }
    childParentIds.add(parentId);
  }

  for (const row of history) {
    const startId = lower(row.evidenceId);
    if (!startId) continue;
    const seen = new Set<string>();
    let current:NormalizedEvidence|undefined = row;
    while (current?.derivedFromEvidenceId) {
      const currentId = lower(current.evidenceId);
      const parentId = lower(current.derivedFromEvidenceId);
      if (!currentId || !parentId) break;
      if (seen.has(currentId) || parentId === currentId) {
        invalid = true;
        seen.forEach(id => invalidIds.add(id));
        invalidIds.add(currentId);
        break;
      }
      seen.add(currentId);
      current = byId.get(parentId);
      if (!current) break;
    }
  }

  let terminals = history.filter(row => {
    const id = lower(row.evidenceId);
    return !id || (!childParentIds.has(id) && !invalidIds.has(id));
  });
  if (!terminals.length) terminals = history.slice();

  const newest = Math.max(0,...terminals.map(row => time(row.observedAt)));
  const currentHeads = terminals.filter(row => newest === 0 || newest - time(row.observedAt) <= QUANTITY_CONFLICT_WINDOW_MS);
  const pool = currentHeads.length ? currentHeads : terminals;
  const selected = pool.slice().sort((a,b) => {
    const timeDelta = time(b.observedAt) - time(a.observedAt);
    if (Math.abs(timeDelta) > QUANTITY_CONFLICT_WINDOW_MS) return timeDelta;
    const priorityDelta = QUANTITY_PRIORITY[b.method] - QUANTITY_PRIORITY[a.method];
    return priorityDelta || timeDelta;
  })[0] || null;

  const conflictEvidenceIds = new Set<string>();
  for (let i=0;i<currentHeads.length;i+=1) {
    for (let j=i+1;j<currentHeads.length;j+=1) {
      const first = currentHeads[i];
      const second = currentHeads[j];
      if (first.remainingGrams === null || second.remainingGrams === null) continue;

      const firstId = lower(first.evidenceId);
      const secondId = lower(second.evidenceId);
      const related = firstId && secondId && (
        lower(first.derivedFromEvidenceId) === secondId ||
        lower(second.derivedFromEvidenceId) === firstId
      );
      if (related) continue;

      const delta = Math.abs(time(first.observedAt) - time(second.observedAt));
      if (delta > QUANTITY_CONFLICT_WINDOW_MS) continue;
      const largest = Math.max(first.remainingGrams, second.remainingGrams, 1);
      const tolerance = Math.max(QUANTITY_CONFLICT_MIN_GRAMS, largest * 0.02);
      if (Math.abs(first.remainingGrams - second.remainingGrams) <= tolerance) continue;
      if (first.evidenceId) conflictEvidenceIds.add(first.evidenceId);
      if (second.evidenceId) conflictEvidenceIds.add(second.evidenceId);
    }
  }

  return {
    selected,
    invalid,
    conflictEvidenceIds:[...conflictEvidenceIds],
  };
}

function quantityFor(spool:any, nowMs:number) {
  const history = quantityHistory(spool);
  if (history.length) {
    const lineage = lineageAssessment(history);
    const evidence = lineage.selected;
    if (!evidence) {
      return {
        evidenceId:null,
        remainingGrams:null,
        method:'Unknown' as QuantityMethod,
        source:null,
        grossGrams:null,
        tareGrams:null,
        observedAt:null,
        staleAfter:null,
        confidence:null,
        status:'Unknown' as QuantityEvidenceStatus,
        evidenceCount:history.length,
        conflict:false,
        conflictEvidenceIds:[],
        verificationRequired:true,
      };
    }

    const staleAt = time(evidence.staleAfter);
    const stale = staleAt > 0 && nowMs > staleAt;
    const conflict = lineage.conflictEvidenceIds.length > 0;
    const unknown = evidence.method === 'Unknown' || evidence.remainingGrams === null;
    const status:QuantityEvidenceStatus = unknown
      ? 'Unknown'
      : lineage.invalid
        ? 'InvalidLineage'
        : conflict
          ? 'Conflict'
          : stale
            ? 'Stale'
            : 'Current';

    return {
      evidenceId:evidence.evidenceId,
      remainingGrams:evidence.remainingGrams,
      method:evidence.method,
      source:evidence.source,
      grossGrams:evidence.grossGrams,
      tareGrams:evidence.tareGrams,
      observedAt:evidence.observedAt,
      staleAfter:evidence.staleAfter,
      confidence:evidence.confidence,
      status,
      evidenceCount:history.length,
      conflict,
      conflictEvidenceIds:lineage.conflictEvidenceIds,
      verificationRequired:status !== 'Current',
    };
  }

  const gross = finite(spool?.gross);
  const tare = finite(spool?.tare);
  if (gross !== null && tare !== null && gross >= tare) {
    const observedAt = iso(spool?.weighedAt ?? spool?.remainingEvidenceAt ?? spool?.updatedAt);
    return {
      evidenceId:null,
      remainingGrams:Math.max(0, gross - tare),
      method:'CalculatedFromMeasured' as QuantityMethod,
      source:'legacy-gross-minus-tare',
      grossGrams:gross,
      tareGrams:tare,
      observedAt,
      staleAfter:null,
      confidence:confidence(spool?.confidence),
      status:'Current' as QuantityEvidenceStatus,
      evidenceCount:0,
      conflict:false,
      conflictEvidenceIds:[],
      verificationRequired:false,
    };
  }

  const legacyEstimate = finite(spool?.estimatedRemainingGrams);
  if (legacyEstimate !== null) {
    return {
      evidenceId:null,
      remainingGrams:Math.max(0, legacyEstimate),
      method:'PrinterEstimatedUsage' as QuantityMethod,
      source:'legacy-estimatedRemainingGrams',
      grossGrams:null,
      tareGrams:null,
      observedAt:iso(spool?.remainingEvidenceAt ?? spool?.updatedAt),
      staleAfter:null,
      confidence:confidence(spool?.confidence),
      status:'Current' as QuantityEvidenceStatus,
      evidenceCount:0,
      conflict:false,
      conflictEvidenceIds:[],
      verificationRequired:false,
    };
  }

  return {
    evidenceId:null,
    remainingGrams:null,
    method:(finite(spool?.visualPercent) !== null ? 'VisualEstimate' : 'Unknown') as QuantityMethod,
    source:finite(spool?.visualPercent) !== null ? 'legacy-visual-percent-without-authoritative-grams' : null,
    grossGrams:null,
    tareGrams:null,
    observedAt:iso(spool?.updatedAt),
    staleAfter:null,
    confidence:confidence(spool?.confidence),
    status:'Unknown' as QuantityEvidenceStatus,
    evidenceCount:0,
    conflict:false,
    conflictEvidenceIds:[],
    verificationRequired:true,
  };
}

function placementFor(spool:any) {
  const evidence = spool?.placement && typeof spool.placement === 'object' ? spool.placement : null;

  if (evidence) {
    const rawKind = String(evidence.kind ?? evidence.type ?? '').trim().toLowerCase();
    const explicitState = String(evidence.state ?? '').trim();
    const printerId = text(evidence.printerId);
    const feederId = text(evidence.feederId ?? evidence.amsId);
    const rawSlot = finite(evidence.slot ?? evidence.slotId);
    const slot = rawSlot === null ? null : Math.trunc(rawSlot);
    const observedAt = iso(evidence.observedAt ?? evidence.timestamp);
    const source = text(evidence.source) || 'placement-evidence';
    const explicitlyStale = evidence.stale === true || String(evidence.freshness || '').toLowerCase() === 'stale';

    if (rawKind === 'unloaded' || rawKind === 'stored' || explicitState === 'Stored') {
      const conflicting = Boolean(printerId || feederId || slot !== null || evidence.external === true);
      return {
        status:(conflicting ? 'Conflict' : explicitlyStale ? 'Stale' : 'Current') as PlacementStatus,
        state:'Stored' as const,
        printerId:null,
        feederId:null,
        slot:null,
        external:false,
        observedAt,
        source,
        verificationRequired:conflicting || explicitlyStale,
      };
    }

    if (rawKind === 'external' || rawKind === 'external-spool') {
      const conflicting = !printerId || Boolean(feederId) || slot !== null;
      return {
        status:(conflicting ? 'Conflict' : explicitlyStale ? 'Stale' : 'Current') as PlacementStatus,
        state:'Loaded' as const,
        printerId,
        feederId:null,
        slot:null,
        external:true,
        observedAt,
        source,
        verificationRequired:conflicting || explicitlyStale,
      };
    }

    if (rawKind === 'feeder' || rawKind === 'ams') {
      const validSlot = slot !== null && slot >= 0;
      const conflicting = !printerId || !feederId || !validSlot || evidence.external === true;
      return {
        status:(conflicting ? 'Conflict' : explicitlyStale ? 'Stale' : 'Current') as PlacementStatus,
        state:'Loaded' as const,
        printerId,
        feederId,
        slot:validSlot ? slot : null,
        external:false,
        observedAt,
        source,
        verificationRequired:conflicting || explicitlyStale,
      };
    }

    // Compatibility for an explicitly persisted object from an earlier
    // contract. It is accepted only when it contains the complete canonical
    // identifiers required by the claimed state.
    if (explicitState === 'Loaded') {
      const external = evidence.external === true;
      const validFeeder = Boolean(printerId && feederId && slot !== null && slot >= 0 && !external);
      const validExternal = Boolean(printerId && external && !feederId && slot === null);
      const valid = validFeeder || validExternal;
      return {
        status:(valid ? explicitlyStale ? 'Stale' : 'Current' : 'Conflict') as PlacementStatus,
        state:'Loaded' as const,
        printerId,
        feederId:external ? null : feederId,
        slot:external ? null : slot,
        external,
        observedAt,
        source,
        verificationRequired:!valid || explicitlyStale,
      };
    }

    return {
      status:'Unknown' as PlacementStatus,
      state:'Unknown' as const,
      printerId:null,
      feederId:null,
      slot:null,
      external:null,
      observedAt,
      source,
      verificationRequired:true,
    };
  }

  // Transitional legacy fields are explicit historical observations, but they
  // do not contain durable canonical printer/feeder identifiers. Preserve the
  // loaded/stored fact while requiring verification before treating a loaded
  // path as canonical placement.
  const legacyState = String(spool?.placementState || '');
  if (legacyState === 'Stored') {
    return {
      status:'Current' as PlacementStatus,
      state:'Stored' as const,
      printerId:null,
      feederId:null,
      slot:null,
      external:false,
      observedAt:iso(spool?.placementUpdatedAt ?? spool?.updatedAt),
      source:'legacy-placement',
      verificationRequired:false,
    };
  }
  if (legacyState === 'Loaded') {
    return {
      status:'Conflict' as PlacementStatus,
      state:'Loaded' as const,
      printerId:null,
      feederId:null,
      slot:null,
      external:null,
      observedAt:iso(spool?.loadedAt ?? spool?.placementUpdatedAt ?? spool?.updatedAt),
      source:'legacy-placement',
      verificationRequired:true,
    };
  }

  return {
    status:'Unknown' as PlacementStatus,
    state:'Unknown' as const,
    printerId:null,
    feederId:null,
    slot:null,
    external:null,
    observedAt:null,
    source:null,
    verificationRequired:true,
  };
}

export function buildDeviceFeedV1(
  envelope:InventoryEnvelope,
  scopeId:string,
  now = new Date(),
):DeviceFeedV1 {
  const nowMs = now.getTime();
  const state = envelope?.state || {};
  const updatedAt = iso(envelope?.updatedAt);
  const updatedMs = updatedAt ? Date.parse(updatedAt) : 0;
  const ageSeconds = updatedMs ? Math.max(0, Math.floor((nowMs - updatedMs) / 1000)) : null;
  const feedStale = ageSeconds === null || ageSeconds * 1000 > STALE_AFTER_MS;
  const unknowns:string[] = [];
  const attention:DeviceFeedV1['attention'] = [];

  const spools = (Array.isArray(state.spools) ? state.spools : [])
    .filter((spool:any) => spool && !spool.archivedAt && text(spool.spoolId ?? spool.id))
    .map((spool:any) => {
      const spoolId = String(spool.spoolId ?? spool.id).trim();
      const quantity = quantityFor(spool, nowMs);
      const placement = placementFor(spool);

      if (quantity.remainingGrams === null) {
        unknowns.push(`Quantity unknown for spool ${spoolId}`);
        attention.push({kind:'quantity-unknown', message:'Weigh or verify this spool before relying on remaining quantity.', spoolId});
      } else if (quantity.status === 'Conflict') {
        attention.push({kind:'quantity-conflict', message:'Quantity evidence conflicts and requires verification before use.', spoolId});
      } else if (quantity.status === 'InvalidLineage') {
        attention.push({kind:'quantity-lineage-invalid', message:'Quantity evidence lineage is invalid and requires repair before use.', spoolId});
      } else if (quantity.status === 'Stale') {
        attention.push({kind:'quantity-stale', message:'Quantity evidence is stale and should be re-verified.', spoolId});
      }

      if (placement.status === 'Unknown') {
        unknowns.push(`Placement unknown for spool ${spoolId}`);
      } else if (placement.status === 'Conflict') {
        attention.push({kind:'placement-conflict', message:'Placement evidence is incomplete or conflicting and requires verification.', spoolId});
      } else if (placement.status === 'Stale') {
        attention.push({kind:'placement-stale', message:'Placement evidence is explicitly stale and requires verification.', spoolId});
      }
      return {
        spoolId,
        material:text(spool.material ?? spool.type),
        color:text(spool.colorName ?? spool.color ?? spool.colorHex),
        quantity,
        placement,
      };
    });

  const rawReadiness = state?.printReadiness && typeof state.printReadiness === 'object'
    ? state.printReadiness : null;
  const candidateState = String(rawReadiness?.state || 'Undetermined') as ReadinessState;
  const readinessState:ReadinessState = READINESS.has(candidateState) ? candidateState : 'Undetermined';
  const requiredGrams = finite(rawReadiness?.requiredGrams);
  const readinessReason = text(rawReadiness?.reason)
    || (readinessState === 'Undetermined' ? 'Print requirements or authoritative readiness evidence are unavailable.' : 'Readiness supplied by Filament Inventory.');
  if (readinessState === 'Undetermined') unknowns.push('Print readiness undetermined');
  if (feedStale) attention.push({kind:'feed-stale', message:'Filament Inventory data is stale or has no valid update timestamp.'});

  return {
    schemaVersion:1,
    generatedAt:now.toISOString(),
    scope:{type:'profile', id:scopeId},
    freshness:{sourceUpdatedAt:updatedAt, ageSeconds, stale:feedStale},
    inventory:{status:'available', spools},
    readiness:{state:readinessState, reason:readinessReason, requiredGrams},
    unknowns:[...new Set(unknowns)],
    attention,
  };
}
