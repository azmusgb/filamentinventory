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
  'netlify/functions/sync.mts',
  "import { reconcileConcurrentState } from './sync-reconcile.mts';",
  "import { reconcileConcurrentState } from '../lib/sync-reconcile.mts';",
));
changes.push(await replaceOnce(
  'tests/sync-reconcile.test.mjs',
  "import { reconcileConcurrentState, reconcileSpoolRecord } from '../netlify/functions/sync-reconcile.mts';",
  "import { reconcileConcurrentState, reconcileSpoolRecord } from '../netlify/lib/sync-reconcile.mts';",
));

console.log(changes.some(Boolean) ? 'Moved reconciliation imports to private Netlify library.' : 'Private reconciliation imports already applied.');
