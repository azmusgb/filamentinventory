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
  'audit-client.js',
  '  let writingAudit = false;\n  let renderQueued = false;',
  '  let writingAudit = false;\n  let renderQueued = false;\n  let pendingBeforeState = null;',
));
changes.push(await replaceOnce(
  'audit-client.js',
  '    const before = readState();\n    const result = priorSetItem.call(this, key, value);',
  '    const before = pendingBeforeState || readState();\n    pendingBeforeState = null;\n    const result = priorSetItem.call(this, key, value);',
));
changes.push(await replaceOnce(
  'audit-client.js',
  "  function bind() {\n    ['auditSearch'].forEach(id => document.getElementById(id)?.addEventListener('input', renderTimeline));",
  "  function bind() {\n    document.getElementById('spoolForm')?.addEventListener('submit', () => {\n      const snapshot = readState();\n      pendingBeforeState = snapshot;\n      setTimeout(() => { if (pendingBeforeState === snapshot) pendingBeforeState = null; }, 0);\n    }, true);\n    ['auditSearch'].forEach(id => document.getElementById(id)?.addEventListener('input', renderTimeline));",
));

console.log(changes.some(Boolean) ? `Applied ${changes.filter(Boolean).length} audit baseline edits.` : 'Audit baseline patch already applied.');
