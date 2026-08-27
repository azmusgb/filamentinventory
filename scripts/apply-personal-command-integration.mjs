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
  '<script defer src="/audit-core.js"></script>\n<script defer src="/sync-client.js"></script>',
  '<script defer src="/audit-core.js"></script>\n<script defer src="/personal-core.js"></script>\n<script defer src="/sync-client.js"></script>',
));
changes.push(await replaceOnce(
  'index.html',
  '<script defer src="/audit-client.js"></script>\n<script defer src="/app.js"></script>',
  '<script defer src="/audit-client.js"></script>\n<script defer src="/personal-dashboard.js"></script>\n<script defer src="/app.js"></script>',
));
changes.push(await replaceOnce(
  'personal-dashboard.js',
  "  function addSpool() { document.getElementById('addTopBtn')?.click() || document.getElementById('heroAddBtn')?.click(); }",
  "  function addSpool() { const button = document.getElementById('addTopBtn') || document.getElementById('heroAddBtn'); button?.click(); }",
));

console.log(changes.some(Boolean) ? `Applied ${changes.filter(Boolean).length} personal command center integration edits.` : 'Personal command center integration already applied.');