import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, '..');

test('Netlify exposes only the four intended function modules', async () => {
  const functionDir = path.join(rootDir, 'netlify', 'functions');
  const entries = (await readdir(functionDir, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.mts'))
    .map(entry => entry.name)
    .sort();

  assert.deepEqual(entries, ['display-feed.mts', 'qr.mts', 'sync-admin.mts', 'sync.mts']);
});

test('sync reconciliation lives outside the callable function directory', async () => {
  const libraryPath = path.join(rootDir, 'netlify', 'lib', 'sync-reconcile.mts');
  const libraryStat = await stat(libraryPath);
  assert.equal(libraryStat.isFile(), true);

  const syncSource = await readFile(path.join(rootDir, 'netlify', 'functions', 'sync.mts'), 'utf8');
  assert.match(syncSource, /from ['"]\.\.\/lib\/sync-reconcile\.mts['"]/);
  assert.doesNotMatch(syncSource, /from ['"]\.\/sync-reconcile\.mts['"]/);
});

test('reconciliation tests exercise the private library module', async () => {
  const testSource = await readFile(path.join(rootDir, 'tests', 'sync-reconcile.test.mjs'), 'utf8');
  assert.match(testSource, /\.\.\/netlify\/lib\/sync-reconcile\.mts/);
  assert.doesNotMatch(testSource, /\.\.\/netlify\/functions\/sync-reconcile\.mts/);
});
