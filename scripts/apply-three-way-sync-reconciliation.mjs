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
  "import { createHash, randomBytes } from 'node:crypto';\n",
  "import { createHash, randomBytes } from 'node:crypto';\nimport { reconcileConcurrentState } from './sync-reconcile.mts';\n",
));

changes.push(await replaceOnce(
  'netlify/functions/sync.mts',
  "    if (!body?.state || !Array.isArray(body.state.spools)) return json({ ok:false, error:'A valid sync state is required.' }, 400);\n    const merged = mergeStates(current?.state, body.state);\n    const currentFingerprint = current ? JSON.stringify(current.state) : '';\n    const nextFingerprint = JSON.stringify(merged.state);\n    const changed = currentFingerprint !== nextFingerprint;\n    const baseRevision = String(body?.baseRevision || '');\n    const concurrent = Boolean(current && baseRevision && baseRevision !== current.revision);\n",
  "    if (!body?.state || !Array.isArray(body.state.spools)) return json({ ok:false, error:'A valid sync state is required.' }, 400);\n    const baseRevision = String(body?.baseRevision || '');\n    const concurrent = Boolean(current && baseRevision && baseRevision !== current.revision);\n    const baseEnvelope = concurrent ? await getSnapshotByRevision(store, hash, baseRevision) : null;\n    const twoWayMerged = mergeStates(current?.state, body.state);\n    const reconciliation = baseEnvelope && current\n      ? reconcileConcurrentState(baseEnvelope.state, current.state, body.state, twoWayMerged.state)\n      : {\n          state:twoWayMerged.state,\n          stats:{ threeWaySpools:0, mergedSpools:0, conflictedSpools:0, conflictingFields:0, conflictIds:[] as string[] },\n        };\n    const merged = {\n      state:reconciliation.state,\n      stats:{ ...twoWayMerged.stats, ...reconciliation.stats, baseRecovered:Boolean(baseEnvelope) },\n    };\n    const currentFingerprint = current ? JSON.stringify(current.state) : '';\n    const nextFingerprint = JSON.stringify(merged.state);\n    const changed = currentFingerprint !== nextFingerprint;\n",
));

changes.push(await replaceOnce(
  'sync-client.js',
  "      if (result?.merge?.concurrent && !silent) toast('Concurrent cloud edits were merged safely.');",
  "      if (result?.merge?.concurrent && !silent) {\n        const conflicts = Number(result?.merge?.conflictedSpools || 0);\n        if (conflicts > 0) toast(`Concurrent edits reconciled; ${conflicts} spool${conflicts === 1 ? '' : 's'} had same-field conflicts resolved by the newer edit.`);\n        else if (result?.merge?.baseRecovered) toast('Concurrent edits reconciled from a recovery snapshot.');\n        else toast('Concurrent edits merged by newest spool because the base snapshot was unavailable.');\n      }",
));

changes.push(await replaceOnce(
  'sync-client.js',
  '<div><strong>Conflict-aware merge</strong><span>Spool records resolve by newest record timestamp. v5 also tracks cloud revision drift so concurrent-device merges are visible.</span></div>',
  '<div><strong>Conflict-aware merge</strong><span>When a prior cloud revision is available, concurrent edits use three-way snapshot reconciliation so independent fields survive. True same-field conflicts resolve to the newer edit and are reported.</span></div>',
));

console.log(changes.some(Boolean) ? 'Applied three-way sync reconciliation integration.' : 'Three-way sync integration already applied.');
