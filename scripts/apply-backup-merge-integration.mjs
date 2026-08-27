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
  '<script defer src="/sync-client.js"></script>',
  '<script defer src="/state-merge.js"></script>\n<script defer src="/sync-client.js"></script>',
));

changes.push(await replaceOnce(
  'household-client.js',
  "}else{const current=readState(),byId=new Map(current.spools.map(s=>[String(s.id).toLowerCase(),s]));incoming.spools.forEach(s=>{const key=String(s.id).toLowerCase(),old=byId.get(key);if(!old||Date.parse(s.updatedAt||0)>=Date.parse(old.updatedAt||0))byId.set(key,s);});current.spools=[...byId.values()];const logs=new Map((current.weighLog||[]).map(x=>[[x.id,x.at,x.gross,x.tare,x.note].join('|'),x]));for(const x of incoming.weighLog||[])logs.set([x.id,x.at,x.gross,x.tare,x.note].join('|'),x);current.weighLog=[...logs.values()];current.meta={...(current.meta||{}),...(incoming.meta||{})};writeState(current);}",
  "}else{const current=readState(),mergeBackupStates=globalThis.FilamentInventoryStateMerge?.mergeBackupStates;if(!mergeBackupStates)throw new Error('Backup merge engine is unavailable. Refresh and try again.');const merged=mergeBackupStates(current,incoming);writeState(merged);}",
));

console.log(changes.some(Boolean) ? 'Applied tombstone-aware backup merge integration.' : 'Backup merge integration already applied.');
