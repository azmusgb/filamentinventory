import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('full spool edit captures audit baseline before household metadata staging', async () => {
  const source = await readFile(new URL('../audit-client.js', import.meta.url), 'utf8');
  assert.match(source, /let pendingBeforeState = null;/);
  assert.match(source, /const before = pendingBeforeState \|\| readState\(\);\n    pendingBeforeState = null;/);
  assert.match(source, /spoolForm'\)\?\.addEventListener\('submit', \(\) => \{/);
  assert.match(source, /pendingBeforeState = snapshot;/);
  assert.match(source, /\}, true\);/);
  assert.match(source, /setTimeout\(\(\) => \{ if \(pendingBeforeState === snapshot\) pendingBeforeState = null; \}, 0\);/);
});
