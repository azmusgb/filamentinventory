import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, before, after) {
  const source = await readFile(path, 'utf8');
  if (source.includes(after)) return false;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected exactly one patch target, found ${count}`);
  await writeFile(path, source.replace(before, after), 'utf8');
  return true;
}

const changes = [];

changes.push(await replaceOnce(
  'index.html',
  '<script defer src="/state-merge.js"></script>\n<script defer src="/sync-client.js"></script>\n<script defer src="/security-client.js"></script>\n<script defer src="/labels-client.js"></script>\n<script defer src="/household-client.js"></script>\n<script defer src="/ux-client.js"></script>\n<script defer src="/app.js"></script>',
  '<script defer src="/state-merge.js"></script>\n<script defer src="/audit-core.js"></script>\n<script defer src="/sync-client.js"></script>\n<script defer src="/security-client.js"></script>\n<script defer src="/labels-client.js"></script>\n<script defer src="/household-client.js"></script>\n<script defer src="/ux-client.js"></script>\n<script defer src="/audit-client.js"></script>\n<script defer src="/app.js"></script>',
));

changes.push(await replaceOnce(
  'sync-client.js',
  "      weighLog:Array.isArray(local.weighLog) ? local.weighLog : [],\n      tombstones:normalizeTombstones(local.tombstones),",
  "      weighLog:Array.isArray(local.weighLog) ? local.weighLog : [],\n      auditLog:Array.isArray(local.auditLog) ? local.auditLog : [],\n      tombstones:normalizeTombstones(local.tombstones),",
));
changes.push(await replaceOnce(
  'sync-client.js',
  "    return JSON.stringify({spools:state.spools || [], weighLog:state.weighLog || [], tombstones:state.tombstones || {}});",
  "    return JSON.stringify({spools:state.spools || [], weighLog:state.weighLog || [], auditLog:state.auditLog || [], tombstones:state.tombstones || {}});",
));
changes.push(await replaceOnce(
  'sync-client.js',
  "      weighLog:Array.isArray(remote.weighLog) ? remote.weighLog : [],\n      tombstones:normalizeTombstones(remote.tombstones),",
  "      weighLog:Array.isArray(remote.weighLog) ? remote.weighLog : [],\n      auditLog:Array.isArray(remote.auditLog) ? remote.auditLog : [],\n      tombstones:normalizeTombstones(remote.tombstones),",
));

changes.push(await replaceOnce(
  'netlify/functions/sync.mts',
  'const MAX_LOGS = 5000;\nconst MAX_BODY_BYTES = 2_000_000;',
  'const MAX_LOGS = 5000;\nconst MAX_AUDIT = 1500;\nconst MAX_BODY_BYTES = 2_000_000;',
));
changes.push(await replaceOnce(
  'netlify/functions/sync.mts',
  "export function normalizeState(value: any) {\n  const spools = Array.isArray(value?.spools) ? value.spools.filter((s:any) => s && String(s.id || '').trim()).slice(0, MAX_SPOOLS) : [];\n  const weighLog = Array.isArray(value?.weighLog) ? value.weighLog.filter((x:any) => x && String(x.id || '').trim()).slice(-MAX_LOGS) : [];\n  return { version:Math.max(Number(value?.version) || 0, 5), spools, weighLog, tombstones:normalizeTombstones(value?.tombstones) };\n}",
  "function normalizeAuditLog(value: unknown): any[] {\n  const map = new Map<string,any>();\n  for (const row of Array.isArray(value) ? value : []) {\n    const id = String(row?.id || '').trim().slice(0,120);\n    const at = String(row?.at || '');\n    const type = String(row?.type || '').trim().slice(0,50);\n    const summary = String(row?.summary || '').trim().slice(0,240);\n    if (!id || !timestamp(at) || !type || !summary) continue;\n    const normalized = {\n      id, at, type, summary,\n      actor:String(row?.actor || 'Unknown').trim().slice(0,40) || 'Unknown',\n      device:String(row?.device || '').trim().slice(0,60),\n      spoolId:String(row?.spoolId || '').trim().slice(0,64),\n      owner:String(row?.owner || '').trim().slice(0,40),\n      changes:Array.isArray(row?.changes) ? row.changes.slice(0,12).map((change:any) => ({\n        field:String(change?.field || '').trim().slice(0,60),\n        from:String(change?.from ?? '').slice(0,120),\n        to:String(change?.to ?? '').slice(0,120),\n      })).filter((change:any) => change.field) : [],\n    };\n    const old = map.get(id);\n    if (!old || timestamp(at) >= timestamp(old.at)) map.set(id, normalized);\n  }\n  return [...map.values()].sort((a,b) => timestamp(a.at) - timestamp(b.at)).slice(-MAX_AUDIT);\n}\n\nexport function normalizeState(value: any) {\n  const spools = Array.isArray(value?.spools) ? value.spools.filter((s:any) => s && String(s.id || '').trim()).slice(0, MAX_SPOOLS) : [];\n  const weighLog = Array.isArray(value?.weighLog) ? value.weighLog.filter((x:any) => x && String(x.id || '').trim()).slice(-MAX_LOGS) : [];\n  return { version:Math.max(Number(value?.version) || 0, 5), spools, weighLog, auditLog:normalizeAuditLog(value?.auditLog), tombstones:normalizeTombstones(value?.tombstones) };\n}",
));
changes.push(await replaceOnce(
  'netlify/functions/sync.mts',
  "  const weighLog = [...logMap.values()].sort((a,b) => timestamp(a.at) - timestamp(b.at)).slice(-MAX_LOGS);\n\n  return {\n    state:{ version:5, spools, weighLog, tombstones },",
  "  const weighLog = [...logMap.values()].sort((a,b) => timestamp(a.at) - timestamp(b.at)).slice(-MAX_LOGS);\n  const auditLog = normalizeAuditLog([...remote.auditLog, ...incoming.auditLog]);\n\n  return {\n    state:{ version:5, spools, weighLog, auditLog, tombstones },",
));

console.log(changes.some(Boolean) ? `Applied ${changes.filter(Boolean).length} shared activity integration edits.` : 'Shared activity integration already applied.');
