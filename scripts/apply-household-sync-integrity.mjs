import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, before, after) {
  const source = await readFile(path, 'utf8');
  if (source.includes(after)) return false;
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${path}: expected exactly one patch target, found ${occurrences}`);
  }
  await writeFile(path, source.replace(before, after), 'utf8');
  return true;
}

const changes = [];

changes.push(await replaceOnce(
  'household-client.js',
  "      const forced = pendingMeta.get(id) || {};\n      const hh = normalizeHousehold({...old, ...spool, ...forced}, old);",
  "      const forcedChanged = pendingMeta.has(id);\n      const forced = pendingMeta.get(id) || {};\n      const hh = normalizeHousehold({...old, ...spool, ...forced}, old);",
));

changes.push(await replaceOnce(
  'household-client.js',
  "      const updatedAt = oldTime > newTime ? old.updatedAt : spool?.updatedAt;",
  "      const updatedAt = forcedChanged ? nowIso() : (oldTime > newTime ? old.updatedAt : spool?.updatedAt);",
));

changes.push(await replaceOnce(
  'netlify/functions/sync.mts',
  'function normalizeState(value: any) {',
  'export function normalizeState(value: any) {',
));

changes.push(await replaceOnce(
  'netlify/functions/sync.mts',
  'function mergeStates(remoteRaw: any, incomingRaw: any) {',
  'export function mergeStates(remoteRaw: any, incomingRaw: any) {',
));

console.log(changes.some(Boolean) ? 'Applied household/sync integrity patch.' : 'Integrity patch already applied.');
