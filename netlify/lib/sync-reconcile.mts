const PLACEMENT_FIELDS = ['placementState', 'printerId', 'printerName', 'feederId', 'feederName', 'feederSlot', 'loadedAt'] as const;
const META_FIELDS = new Set(['id', 'createdAt', 'updatedAt', ...PLACEMENT_FIELDS]);

type JsonRecord = Record<string, any>;

type ReconcileStats = {
  threeWaySpools: number;
  mergedSpools: number;
  conflictedSpools: number;
  conflictingFields: number;
  conflictIds: string[];
};

function timestamp(value: unknown): number {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function same(left: any, right: any): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function meaningful(record: JsonRecord): JsonRecord {
  const out: JsonRecord = {};
  for (const [key, value] of Object.entries(record || {})) {
    if (key === 'updatedAt' || key === 'createdAt') continue;
    out[key] = value;
  }
  return out;
}

function byId(state: any): Map<string, JsonRecord> {
  return new Map((Array.isArray(state?.spools) ? state.spools : [])
    .filter((spool: any) => spool && String(spool.id || '').trim())
    .map((spool: any) => [String(spool.id).trim().toLowerCase(), spool]));
}

function values(record: JsonRecord, fields: readonly string[]): JsonRecord {
  const out: JsonRecord = {};
  for (const field of fields) out[field] = record?.[field];
  return out;
}

function setValue(target: JsonRecord, key: string, value: any): void {
  if (value === undefined) delete target[key];
  else target[key] = value;
}

function applyGroup(target: JsonRecord, fields: readonly string[], source: JsonRecord): void {
  for (const field of fields) setValue(target, field, source?.[field]);
}

function newerSide(remote: JsonRecord, incoming: JsonRecord): 'remote' | 'incoming' {
  return timestamp(incoming?.updatedAt) >= timestamp(remote?.updatedAt) ? 'incoming' : 'remote';
}

export function reconcileSpoolRecord(base: JsonRecord, remote: JsonRecord, incoming: JsonRecord) {
  const result: JsonRecord = { ...base };
  const conflicts: string[] = [];
  let mergedFields = 0;
  const preferred = newerSide(remote, incoming);

  const placementBase = values(base, PLACEMENT_FIELDS);
  const placementRemote = values(remote, PLACEMENT_FIELDS);
  const placementIncoming = values(incoming, PLACEMENT_FIELDS);
  const remotePlacementChanged = !same(placementRemote, placementBase);
  const incomingPlacementChanged = !same(placementIncoming, placementBase);

  if (remotePlacementChanged || incomingPlacementChanged) {
    if (remotePlacementChanged && incomingPlacementChanged && !same(placementRemote, placementIncoming)) {
      conflicts.push('placement');
      applyGroup(result, PLACEMENT_FIELDS, preferred === 'incoming' ? incoming : remote);
    } else {
      applyGroup(result, PLACEMENT_FIELDS, incomingPlacementChanged ? incoming : remote);
      if (remotePlacementChanged && incomingPlacementChanged) mergedFields++;
    }
  }

  const keys = new Set([
    ...Object.keys(base || {}),
    ...Object.keys(remote || {}),
    ...Object.keys(incoming || {}),
  ]);

  for (const key of keys) {
    if (META_FIELDS.has(key)) continue;
    const baseValue = base?.[key];
    const remoteValue = remote?.[key];
    const incomingValue = incoming?.[key];
    const remoteChanged = !same(remoteValue, baseValue);
    const incomingChanged = !same(incomingValue, baseValue);

    if (!remoteChanged && !incomingChanged) {
      setValue(result, key, baseValue);
      continue;
    }
    if (remoteChanged && !incomingChanged) {
      setValue(result, key, remoteValue);
      mergedFields++;
      continue;
    }
    if (!remoteChanged && incomingChanged) {
      setValue(result, key, incomingValue);
      mergedFields++;
      continue;
    }
    if (same(remoteValue, incomingValue)) {
      setValue(result, key, remoteValue);
      mergedFields++;
      continue;
    }

    conflicts.push(key);
    setValue(result, key, preferred === 'incoming' ? incomingValue : remoteValue);
  }

  result.id = remote?.id || incoming?.id || base?.id;
  const createdCandidates = [base?.createdAt, remote?.createdAt, incoming?.createdAt]
    .filter(value => timestamp(value) > 0)
    .sort((a, b) => timestamp(a) - timestamp(b));
  if (createdCandidates.length) result.createdAt = createdCandidates[0];

  const updatedCandidates = [remote?.updatedAt, incoming?.updatedAt]
    .filter(value => timestamp(value) > 0)
    .sort((a, b) => timestamp(b) - timestamp(a));
  if (updatedCandidates.length) result.updatedAt = updatedCandidates[0];

  return { record: result, conflicts, mergedFields };
}

export function reconcileConcurrentState(baseRaw: any, remoteRaw: any, incomingRaw: any, mergedRaw: any) {
  const base = byId(baseRaw);
  const remote = byId(remoteRaw);
  const incoming = byId(incomingRaw);
  const stats: ReconcileStats = {
    threeWaySpools: 0,
    mergedSpools: 0,
    conflictedSpools: 0,
    conflictingFields: 0,
    conflictIds: [],
  };

  const spools = (Array.isArray(mergedRaw?.spools) ? mergedRaw.spools : []).map((mergedSpool: any) => {
    const id = String(mergedSpool?.id || '').trim().toLowerCase();
    const baseSpool = base.get(id);
    const remoteSpool = remote.get(id);
    const incomingSpool = incoming.get(id);
    if (!baseSpool || !remoteSpool || !incomingSpool) return mergedSpool;

    const remoteChanged = !same(meaningful(remoteSpool), meaningful(baseSpool));
    const incomingChanged = !same(meaningful(incomingSpool), meaningful(baseSpool));
    if (!remoteChanged || !incomingChanged) return mergedSpool;

    stats.threeWaySpools++;
    const reconciled = reconcileSpoolRecord(baseSpool, remoteSpool, incomingSpool);
    if (reconciled.mergedFields > 0) stats.mergedSpools++;
    if (reconciled.conflicts.length > 0) {
      stats.conflictedSpools++;
      stats.conflictingFields += reconciled.conflicts.length;
      if (stats.conflictIds.length < 25) stats.conflictIds.push(String(reconciled.record.id));
    }
    return reconciled.record;
  });

  return {
    state: { ...mergedRaw, spools },
    stats,
  };
}