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
  conflicting:number;
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

function selectedEvidence(spool:any):any | null {
  const evidence = normalizedEvidence(spool)
    .filter(row => finite(row?.remainingGrams) !== null && String(row?.method || '') !== 'Unknown')
    .slice()
    .sort((a,b) => {
      const time = validTime(b?.observedAt) - validTime(a?.observedAt);
      if (time) return time;
      return evidencePriority(String(b?.method || '')) - evidencePriority(String(a?.method || ''));
    });
  return evidence[0] || null;
}

function legacyRemaining(spool:any): {grams:number | null; method:string} {
  const gross = finite(spool?.gross);
  const tare = finite(spool?.tare);
  if (gross !== null && tare !== null && gross >= tare) {
    return {grams:Math.max(0, gross - tare), method:'Measured'};
  }
  const estimated = finite(spool?.estimatedRemainingGrams);
  if (estimated !== null) return {grams:Math.max(0, estimated), method:'Printer-estimated usage'};
  const visual = finite(spool?.visualPercent);
  const nominal = finite(spool?.startWeight);
  if (visual !== null && nominal !== null && nominal > 0) {
    const pct = Math.max(0, Math.min(100, visual));
    return {grams:Math.max(0, Math.min(nominal, nominal * pct / 100)), method:'Visual estimate'};
  }
  return {grams:null, method:'Unknown'};
}

function quantity(spool:any): {grams:number | null; method:string; conflict:boolean} {
  const explicit = normalizedEvidence(spool);
  const current = selectedEvidence(spool);
  if (!current) {
    const legacy = legacyRemaining(spool);
    return {...legacy, conflict:false};
  }
  const currentAt = validTime(current.observedAt);
  const currentGrams = finite(current.remainingGrams);
  const conflicts = explicit.some(other => {
    if (other === current) return false;
    const otherGrams = finite(other?.remainingGrams);
    if (currentGrams === null || otherGrams === null) return false;
    const delta = Math.abs(currentAt - validTime(other?.observedAt));
    if (delta > 5 * 60 * 1000) return false;
    const tolerance = Math.max(10, Math.max(currentGrams, otherGrams, 1) * 0.02);
    return Math.abs(currentGrams - otherGrams) > tolerance;
  });
  return {grams:currentGrams, method:String(current.method || 'Unknown'), conflict:conflicts};
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

function isLow(spool:any): boolean {
  const grams = quantity(spool).grams;
  if (grams === null) return false;
  const threshold = Math.max(0, finite(spool?.reorderThreshold) ?? DEFAULT_REORDER_GRAMS);
  return grams <= threshold;
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
  const quantities = spools.map(quantity);
  const placements = spools.map(placementKind);

  const loaded = placements.filter(kind => kind === 'external' || kind === 'feeder').length;
  const low = spools.filter(isLow).length;
  const unknown = quantities.filter(row => row.grams === null).length;
  const nextJob = queue.slice().sort((a,b) => validTime(a.plannedAt) - validTime(b.plannedAt))[0];
  const nextMaterial = String(nextJob?.material || '').trim();

  const evidence:EvidenceSummary = {
    measured:quantities.filter(row => row.method === 'Measured').length,
    calculated:quantities.filter(row => row.method === 'Calculated from measured').length,
    estimated:quantities.filter(row => ['Printer-estimated usage','Visual estimate','Imported estimate'].includes(row.method)).length,
    unknown,
    conflicting:quantities.filter(row => row.conflict).length,
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
  else if (evidence.conflicting || placement.conflicting) status = 'Inventory evidence needs review';
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
