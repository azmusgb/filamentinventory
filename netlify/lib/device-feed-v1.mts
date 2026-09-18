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
      remainingGrams:number|null;
      method:QuantityMethod;
      source:string|null;
      grossGrams:number|null;
      tareGrams:number|null;
      observedAt:string|null;
      confidence:number|null;
      stale:boolean;
    };
    placement:{
      state:string;
      printerId:string|null;
      feederId:string|null;
      slot:number|null;
      external:boolean|null;
      observedAt:string|null;
    };
  }>};
  readiness:{state:ReadinessState; reason:string; requiredGrams:number|null};
  unknowns:string[];
  attention:Array<{kind:string; message:string; spoolId?:string}>;
};

const STALE_AFTER_MS = 30 * 60 * 1000;
const QUANTITY_METHODS = new Set<QuantityMethod>([
  'Measured','CalculatedFromMeasured','PrinterEstimatedUsage',
  'VisualEstimate','ImportedEstimate','Unknown',
]);
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
function confidence(value:unknown):number|null {
  const n = finite(value);
  if (n === null) return null;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

function quantityFor(spool:any, nowMs:number) {
  const evidence = spool?.quantityEvidence && typeof spool.quantityEvidence === 'object'
    ? spool.quantityEvidence : null;
  if (evidence) {
    const rawMethod = String(evidence.method || evidence.type || 'Unknown') as QuantityMethod;
    const method:QuantityMethod = QUANTITY_METHODS.has(rawMethod) ? rawMethod : 'Unknown';
    const gross = finite(evidence.grossGrams ?? evidence.gross);
    const tare = finite(evidence.tareGrams ?? evidence.tare);
    let remaining = finite(evidence.remainingGrams);
    if (remaining === null && gross !== null && tare !== null && gross >= tare) remaining = gross - tare;
    const observedAt = iso(evidence.observedAt ?? evidence.timestamp);
    const stale = observedAt ? nowMs - Date.parse(observedAt) > STALE_AFTER_MS : true;
    return {
      remainingGrams:remaining === null ? null : Math.max(0, remaining),
      method,
      source:text(evidence.source),
      grossGrams:gross,
      tareGrams:tare,
      observedAt,
      confidence:confidence(evidence.confidence),
      stale,
    };
  }

  const gross = finite(spool?.gross);
  const tare = finite(spool?.tare);
  if (gross !== null && tare !== null && gross >= tare) {
    return {
      remainingGrams:Math.max(0, gross - tare),
      method:'CalculatedFromMeasured' as QuantityMethod,
      source:'legacy-gross-minus-tare',
      grossGrams:gross,
      tareGrams:tare,
      observedAt:iso(spool?.weighedAt ?? spool?.updatedAt),
      confidence:null,
      stale:!time(spool?.weighedAt ?? spool?.updatedAt) || nowMs - time(spool?.weighedAt ?? spool?.updatedAt) > STALE_AFTER_MS,
    };
  }

  const legacyEstimate = finite(spool?.estimatedRemainingGrams);
  if (legacyEstimate !== null) {
    return {
      remainingGrams:Math.max(0, legacyEstimate),
      method:'Unknown' as QuantityMethod,
      source:'legacy-estimatedRemainingGrams',
      grossGrams:null,
      tareGrams:null,
      observedAt:iso(spool?.updatedAt),
      confidence:null,
      stale:true,
    };
  }

  return {
    remainingGrams:null,
    method:(finite(spool?.visualPercent) !== null ? 'VisualEstimate' : 'Unknown') as QuantityMethod,
    source:finite(spool?.visualPercent) !== null ? 'legacy-visual-percent-without-authoritative-grams' : null,
    grossGrams:null,
    tareGrams:null,
    observedAt:iso(spool?.updatedAt),
    confidence:null,
    stale:true,
  };
}

function placementFor(spool:any) {
  const evidence = spool?.placement && typeof spool.placement === 'object' ? spool.placement : null;
  const state = text(evidence?.state ?? spool?.placementState) || 'Unknown';
  const slot = finite(evidence?.slot ?? spool?.slot);
  return {
    state,
    printerId:text(evidence?.printerId ?? spool?.printerId),
    feederId:text(evidence?.feederId ?? evidence?.amsId ?? spool?.feederId ?? spool?.amsId),
    slot:slot === null ? null : Math.trunc(slot),
    external:typeof evidence?.external === 'boolean' ? evidence.external : null,
    observedAt:iso(evidence?.observedAt ?? evidence?.timestamp ?? spool?.placementUpdatedAt),
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
    .filter((spool:any) => spool && !spool.archivedAt && text(spool.id))
    .map((spool:any) => {
      const spoolId = String(spool.id).trim();
      const quantity = quantityFor(spool, nowMs);
      const placement = placementFor(spool);
      if (quantity.remainingGrams === null) {
        unknowns.push(`Quantity unknown for spool ${spoolId}`);
        attention.push({kind:'quantity-unknown', message:'Weigh or verify this spool before relying on remaining quantity.', spoolId});
      } else if (quantity.stale) {
        attention.push({kind:'quantity-stale', message:'Quantity evidence is stale or has no reliable timestamp.', spoolId});
      }
      if (placement.state === 'Unknown') unknowns.push(`Placement unknown for spool ${spoolId}`);
      return {
        spoolId,
        material:text(spool.material ?? spool.type),
        color:text(spool.color ?? spool.colorHex),
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
