export type InventoryEnvelope = {
  key:string;
  updatedAt:string;
  state:any;
};

type Metric = {label:string; value:string};

type DisplaySummary = {
  spools:number;
  loaded:number;
  low:number;
  unknown:number;
  queue:number;
};

type EvidenceSummary = {
  measured:number;
  calculated:number;
  estimated:number;
  unknown:number;
  stale:number;
  conflicting:number;
  invalidLineage:number;
};

type PlacementSummary = {
  loaded:number;
  external:number;
  feeder:number;
  unknown:number;
  conflicting:number;
};

export type DisplayFeed = {
  contractVersion:1;
  schemaVersion:'1.0';
  sourceAuthority:'filamentinventory';
  profileScope:string | null;
  capabilities:string[];
  freshness:'fresh' | 'stale' | 'unknown';
  summary:DisplaySummary;
  evidence:EvidenceSummary;
  placement:PlacementSummary;
  readiness:{state:'undetermined'; reason:string};
  title:string;
  subtitle:string;
  status:string;
  metrics:Metric[];
  footer:string;
  generatedAt:string;
  sourceUpdatedAt:string | null;
  stale:boolean;
};

type BuildOptions = {profileId?:string | null};

const DEFAULT_REORDER_GRAMS = 250;
const STALE_AFTER_MS = 30 * 60 * 1000;
const QUANTITY_CONFLICT_WINDOW_MS = 5 * 60 * 1000;
const QUANTITY_CONFLICT_MIN_GRAMS = 10;

function finite(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validTime(value: unknown): number {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedEvidence(spool:any): any[] {
  return Array.isArray(spool?.quantityEvidence) ? spool.quantityEvidence.filter(Boolean) : [];
}

function evidencePriority(method:string):number {
  switch (method) {
    case 'Measured': return 600;
    case 'Calculated from measured': return 500;
    case 'Printer-estimated usage': return 400;
    case 'Visual estimate': return 300;
    case 'Imported estimate': return 200;
    default: return 0;
  }
}

function lower(value:unknown):string {
  return String(value ?? '').trim().toLowerCase();
}

function evidenceRemaining(row:any):number | null {
  const explicit = finite(row?.remainingGrams);
  if (explicit !== null) return Math.max(0, explicit);
  const gross = finite(row?.grossGrams ?? row?.gross);
  const tare = finite(row?.tareGrams ?? row?.tare);
  if (gross !== null && tare !== null && gross >= tare) return Math.max(0, gross - tare);
  return null;
}

function lineageAssessment(spool:any) {
  const evidence = normalizedEvidence(spool);
  const byId = new Map<string,any>();
  const parentIdsWithValidChildren = new Set<string>();
  const invalidIds = new Set<string>();
  let invalid = false;

  for (const row of evidence) {
    const id = lower(row?.evidenceId);
    if (id && !byId.has(id)) byId.set(id,row);
  }

  for (const row of evidence) {
    const id = lower(row?.evidenceId);
    const parent = lower(row?.derivedFromEvidenceId);
    if (!parent) continue;
    if (!id || id === parent || !byId.has(parent)) {
      invalid = true;
      if (id) invalidIds.add(id);
      continue;
    }
    parentIdsWithValidChildren.add(parent);
  }

  for (const row of evidence) {
    const start = lower(row?.evidenceId);
    if (!start) continue;
    const seen = new Set<string>();
    let current:any = row;
    while (current?.derivedFromEvidenceId) {
      const currentId = lower(current?.evidenceId);
      const parentId = lower(current?.derivedFromEvidenceId);
      if (!currentId || !parentId) break;
      if (seen.has(currentId) || currentId === parentId) {
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

  let terminals = evidence.filter(row => {
    const id = lower(row?.evidenceId);
    return !id || (!parentIdsWithValidChildren.has(id) && !invalidIds.has(id));
  });
  if (!terminals.length) terminals = evidence.slice();

  const newest = Math.max(0,...terminals.map(row => validTime(row?.observedAt)));
  const currentHeads = terminals.filter(row => newest === 0 || newest - validTime(row?.observedAt) <= QUANTITY_CONFLICT_WINDOW_MS);
  const selectedPool = currentHeads.length ? currentHeads : terminals;
  const selected = selectedPool.slice().sort((a,b) => {
    const timeDelta = validTime(b?.observedAt) - validTime(a?.observedAt);
    if (Math.abs(timeDelta) > QUANTITY_CONFLICT_WINDOW_MS) return timeDelta;
    const priorityDelta = evidencePriority(String(b?.method || '')) - evidencePriority(String(a?.method || ''));
    return priorityDelta || timeDelta;
  })[0] || null;

  const conflicts = new Set<string>();
  for (let i=0;i<currentHeads.length;i += 1) {
    for (let j=i+1;j<currentHeads.length;j += 1) {
      const first = currentHeads[i];
      const second = currentHeads[j];
      const firstGrams = evidenceRemaining(first);
      const secondGrams = evidenceRemaining(second);
      if (firstGrams === null || secondGrams === null) continue;

      const firstId = lower(first?.evidenceId);
      const secondId = lower(second?.evidenceId);
      const directlyRelated = firstId && secondId && (
        lower(first?.derivedFromEvidenceId) === secondId ||
        lower(second?.derivedFromEvidenceId) === firstId
      );
      if (directlyRelated) continue;

      const timeDelta = Math.abs(validTime(first?.observedAt) - validTime(second?.observedAt));
      if (timeDelta > QUANTITY_CONFLICT_WINDOW_MS) continue;
      const tolerance = Math.max(
        QUANTITY_CONFLICT_MIN_GRAMS,
        Math.max(firstGrams, secondGrams, 1) * 0.02,
      );
      if (Math.abs(firstGrams - secondGrams) <= tolerance) continue;
      if (firstId) conflicts.add(firstId);
      if (secondId) conflicts.add(secondId);
    }
  }

  return {
    selected,
    evidenceCount:evidence.length,
    invalidLineage:invalid,
    conflict:conflicts.size > 0,
  };
}

function legacyRemaining(spool:any): {grams:number | null; method:string; stale:boolean; invalidLineage:boolean; conflict:boolean} {
  const gross = finite(spool?.gross);
  const tare = finite(spool?.tare);
  if (gross !== null && tare !== null && gross >= tare) {
    return {grams:Math.max(0, gross - tare), method:'Measured', stale:false, invalidLineage:false, conflict:false};
  }
  const estimated = finite(spool?.estimatedRemainingGrams);
  if (estimated !== null) {
    return {grams:Math.max(0, estimated), method:'Printer-estimated usage', stale:false, invalidLineage:false, conflict:false};
  }
  const visual = finite(spool?.visualPercent);
  const nominal = finite(spool?.startWeight);
  if (visual !== null && nominal !== null && nominal > 0) {
    const pct = Math.max(0, Math.min(100, visual));
    return {
      grams:Math.max(0, Math.min(nominal, nominal * pct / 100)),
      method:'Visual estimate',
      stale:false,
      invalidLineage:false,
      conflict:false,
    };
  }
  return {grams:null, method:'Unknown', stale:false, invalidLineage:false, conflict:false};
}

function quantity(spool:any, nowMs = Date.now()): {
  grams:number | null;
  method:string;
  stale:boolean;
  conflict:boolean;
  invalidLineage:boolean;
} {
  const explicit = normalizedEvidence(spool);
  if (!explicit.length) return legacyRemaining(spool);

  const lineage = lineageAssessment(spool);
  const current = lineage.selected;
  if (!current) {
    return {grams:null, method:'Unknown', stale:false, conflict:false, invalidLineage:lineage.invalidLineage};
  }

  const method = String(current?.method || 'Unknown');
  const grams = method === 'Unknown' ? null : evidenceRemaining(current);
  const staleAt = validTime(current?.staleAfter);
  const stale = staleAt > 0 && nowMs > staleAt;
  return {
    grams,
    method,
    stale,
    conflict:lineage.conflict,
    invalidLineage:lineage.invalidLineage,
  };
}

function placementKind(spool:any): 'unloaded' | 'external' | 'feeder' | 'unknown' | 'conflicting' {
  const placement = spool?.placement;
  if (placement && typeof placement === 'object') {
    const kind = String(placement.kind || placement.type || '').toLowerCase();
    if (kind === 'unloaded' || kind === 'stored') return 'unloaded';
    if (kind === 'external' || kind === 'external-spool') return placement.printerId ? 'external' : 'conflicting';
    if (kind === 'feeder' || kind === 'ams') {
      return placement.printerId && placement.feederId && placement.slot !== undefined && placement.slot !== null
        ? 'feeder' : 'conflicting';
    }
    return 'unknown';
  }

  // Transitional compatibility only. This does not infer placement from
  // material/color telemetry: it reflects only explicitly persisted legacy fields.
  if (String(spool?.placementState) === 'Loaded') {
    const hasPrinter = Boolean(String(spool?.printerName || '').trim());
    const hasFeeder = Boolean(String(spool?.feederName || '').trim());
    const hasSlot = Boolean(String(spool?.feederSlot || '').trim());
    if (hasPrinter && hasFeeder && hasSlot) return 'feeder';
    if (hasPrinter && !hasFeeder && !hasSlot) return 'external';
    return 'conflicting';
  }
  if (String(spool?.placementState) === 'Stored') return 'unloaded';
  return 'unknown';
}

function isLow(spool:any, nowMs:number): boolean {
  const row = quantity(spool, nowMs);
  if (row.grams === null || row.conflict || row.invalidLineage || row.stale) return false;
  const threshold = Math.max(0, finite(spool?.reorderThreshold) ?? DEFAULT_REORDER_GRAMS);
  return row.grams <= threshold;
}

function plural(count:number, singular:string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function timeLabel(value:string | null): string {
  const stamp = validTime(value);
  if (!stamp) return 'No cloud update yet';
  return new Intl.DateTimeFormat('en-US', {
    hour:'numeric',
    minute:'2-digit',
    timeZone:'America/New_York',
  }).format(new Date(stamp));
}

export function buildDisplayFeed(
  envelopes:InventoryEnvelope[],
  now = new Date(),
  options:BuildOptions = {},
):DisplayFeed {
  const activeSpools:any[] = [];
  const jobs:any[] = [];
  let newest = 0;

  for (const envelope of Array.isArray(envelopes) ? envelopes : []) {
    newest = Math.max(newest, validTime(envelope?.updatedAt));
    const state = envelope?.state || {};
    const source = String(envelope?.key || 'inventory');

    for (const spool of Array.isArray(state.spools) ? state.spools : []) {
      const canonicalId = String(spool?.spoolId || spool?.id || '').trim();
      if (!spool || spool.archivedAt || !canonicalId) continue;
      activeSpools.push({...spool, __displayKey:`${source}:${canonicalId}`});
    }

    for (const job of Array.isArray(state.printJobs) ? state.printJobs : []) {
      if (!job || !String(job.id || '').trim()) continue;
      const status = String(job.status || 'planned');
      if (status !== 'planned' && status !== 'in-progress') continue;
      jobs.push({...job, __displayKey:`${source}:${String(job.id)}`});
    }
  }

  const spoolMap = new Map(activeSpools.map(spool => [spool.__displayKey, spool]));
  const jobMap = new Map(jobs.map(job => [job.__displayKey, job]));
  const spools = [...spoolMap.values()];
  const queue = [...jobMap.values()];
  const quantities = spools.map(spool => quantity(spool, now.getTime()));
  const placements = spools.map(placementKind);

  const loaded = placements.filter(kind => kind === 'external' || kind === 'feeder').length;
  const low = spools.filter(spool => isLow(spool, now.getTime())).length;
  const unknown = quantities.filter(row => row.grams === null).length;
  const nextJob = queue.slice().sort((a,b) => validTime(a.plannedAt) - validTime(b.plannedAt))[0];
  const nextMaterial = String(nextJob?.material || '').trim();

  const evidence:EvidenceSummary = {
    measured:quantities.filter(row => row.method === 'Measured').length,
    calculated:quantities.filter(row => row.method === 'Calculated from measured').length,
    estimated:quantities.filter(row => ['Printer-estimated usage','Visual estimate','Imported estimate'].includes(row.method)).length,
    unknown,
    stale:quantities.filter(row => row.stale).length,
    conflicting:quantities.filter(row => row.conflict).length,
    invalidLineage:quantities.filter(row => row.invalidLineage).length,
  };

  const placement:PlacementSummary = {
    loaded,
    external:placements.filter(kind => kind === 'external').length,
    feeder:placements.filter(kind => kind === 'feeder').length,
    unknown:placements.filter(kind => kind === 'unknown').length,
    conflicting:placements.filter(kind => kind === 'conflicting').length,
  };

  let status = 'Inventory healthy';
  if (!spools.length) status = 'No synced inventory';
  else if (evidence.conflicting || evidence.invalidLineage || placement.conflicting) status = 'Inventory evidence needs review';
  else if (evidence.stale) status = `${plural(evidence.stale, 'spool')} need re-verification`;
  else if (low) status = `${plural(low, 'spool')} low`;
  else if (unknown) status = `${plural(unknown, 'spool')} need verification`;

  const newestIso = newest ? new Date(newest).toISOString() : null;
  const stale = !newest || now.getTime() - newest > STALE_AFTER_MS;
  const freshness:'fresh'|'stale'|'unknown' = !newest ? 'unknown' : stale ? 'stale' : 'fresh';
  const footerBits = [
    queue.length ? `Queue ${queue.length}` : 'Queue clear',
    nextMaterial ? `Next ${nextMaterial}` : '',
    `Updated ${timeLabel(newestIso)}`,
  ].filter(Boolean);

  return {
    contractVersion:1,
    schemaVersion:'1.0',
    sourceAuthority:'filamentinventory',
    profileScope:options.profileId ? String(options.profileId) : null,
    capabilities:[
      'inventory-summary',
      'quantity-evidence-summary',
      'quantity-evidence-lineage',
      'placement-summary',
      'queue-summary',
      'staleness',
      'readiness-undetermined',
    ],
    freshness,
    summary:{spools:spools.length, loaded, low, unknown, queue:queue.length},
    evidence,
    placement,
    readiness:{state:'undetermined', reason:'No print requirement was supplied to the device summary.'},
    title:'Filament Inventory',
    subtitle:'Workshop',
    status:stale && spools.length ? `${status} · data may be stale` : status,
    metrics:[
      {label:'Spools', value:String(spools.length)},
      {label:'Loaded', value:String(loaded)},
      {label:'Low', value:String(low)},
      {label:'Queue', value:String(queue.length)},
    ],
    footer:footerBits.join(' · '),
    generatedAt:now.toISOString(),
    sourceUpdatedAt:newestIso,
    stale,
  };
}
