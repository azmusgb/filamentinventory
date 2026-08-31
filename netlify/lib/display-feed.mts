export type InventoryEnvelope = {
  key:string;
  updatedAt:string;
  state:any;
};

type Metric = {label:string; value:string};

export type DisplayFeed = {
  title:string;
  subtitle:string;
  status:string;
  metrics:Metric[];
  footer:string;
  generatedAt:string;
  sourceUpdatedAt:string | null;
  stale:boolean;
};

const DEFAULT_NOMINAL_GRAMS = 1000;
const DEFAULT_REORDER_GRAMS = 250;
const STALE_AFTER_MS = 30 * 60 * 1000;

function finite(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function remainingGrams(spool:any): number | null {
  const gross = finite(spool?.gross);
  const tare = finite(spool?.tare);
  if (gross !== null && tare !== null && gross >= tare) {
    return Math.max(0, gross - tare);
  }

  const estimated = finite(spool?.estimatedRemainingGrams);
  if (estimated !== null) return Math.max(0, estimated);

  const visual = finite(spool?.visualPercent);
  if (visual !== null) {
    const nominal = Math.max(1, finite(spool?.startWeight) ?? DEFAULT_NOMINAL_GRAMS);
    return Math.max(0, Math.min(nominal, nominal * Math.max(0, Math.min(100, visual)) / 100));
  }

  return null;
}

function isLow(spool:any): boolean {
  const grams = remainingGrams(spool);
  if (grams === null) return false;
  const threshold = Math.max(0, finite(spool?.reorderThreshold) ?? DEFAULT_REORDER_GRAMS);
  return grams <= threshold;
}

function validTime(value: unknown): number {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
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
):DisplayFeed {
  const activeSpools:any[] = [];
  const jobs:any[] = [];
  let newest = 0;

  for (const envelope of Array.isArray(envelopes) ? envelopes : []) {
    newest = Math.max(newest, validTime(envelope?.updatedAt));
    const state = envelope?.state || {};
    const source = String(envelope?.key || 'inventory');

    for (const spool of Array.isArray(state.spools) ? state.spools : []) {
      if (!spool || spool.archivedAt || !String(spool.id || '').trim()) continue;
      activeSpools.push({...spool, __displayKey:`${source}:${String(spool.id)}`});
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

  const loaded = spools.filter(spool => String(spool.placementState) === 'Loaded').length;
  const low = spools.filter(isLow).length;
  const unknown = spools.filter(spool => remainingGrams(spool) === null).length;
  const nextJob = queue
    .slice()
    .sort((a,b) => validTime(a.plannedAt) - validTime(b.plannedAt))[0];
  const nextMaterial = String(nextJob?.material || '').trim();

  let status = 'Inventory healthy';
  if (!spools.length) status = 'No synced inventory';
  else if (low) status = `${plural(low, 'spool')} low`;
  else if (unknown) status = `${plural(unknown, 'spool')} need verification`;

  const newestIso = newest ? new Date(newest).toISOString() : null;
  const stale = !newest || now.getTime() - newest > STALE_AFTER_MS;
  const footerBits = [
    queue.length ? `Queue ${queue.length}` : 'Queue clear',
    nextMaterial ? `Next ${nextMaterial}` : '',
    `Updated ${timeLabel(newestIso)}`,
  ].filter(Boolean);

  return {
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
