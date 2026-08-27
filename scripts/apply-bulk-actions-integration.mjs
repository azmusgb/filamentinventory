import { readFile, writeFile, readdir } from 'node:fs/promises';

async function replaceExact(path, from, to, label) {
  const text = await readFile(path, 'utf8');
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${path}: expected exactly one ${label} match, found ${count}`);
  await writeFile(path, text.replace(from, to));
}

async function appendOnce(path, marker, block) {
  const text = await readFile(path, 'utf8');
  if (text.includes(marker)) throw new Error(`${path}: ${marker} already exists`);
  await writeFile(path, `${text.trimEnd()}\n\n${block.trim()}\n`);
}

await replaceExact(
  'index.html',
  '<script defer src="/spool-actions-core.js"></script>\n<script defer src="/user-isolation.js"></script>',
  '<script defer src="/spool-actions-core.js"></script>\n<script defer src="/bulk-actions-core.js"></script>\n<script defer src="/user-isolation.js"></script>',
  'bulk core browser load',
);
await replaceExact(
  'index.html',
  '<script defer src="/spool-actions-client.js"></script>\n<script defer src="/app.js"></script>',
  '<script defer src="/spool-actions-client.js"></script>\n<script defer src="/bulk-actions-client.js"></script>\n<script defer src="/app.js"></script>',
  'bulk client browser load',
);

await replaceExact(
  'scripts/public-assets.mjs',
  "  'spool-actions-core.js',\n  'sync-client.js',",
  "  'spool-actions-core.js',\n  'bulk-actions-core.js',\n  'sync-client.js',",
  'bulk core public asset',
);
await replaceExact(
  'scripts/public-assets.mjs',
  "  'spool-actions-client.js',\n  'sw.js',",
  "  'spool-actions-client.js',\n  'bulk-actions-client.js',\n  'sw.js',",
  'bulk client public asset',
);

await replaceExact('sw.js', "const CACHE = 'filament-inventory-v24';", "const CACHE = 'filament-inventory-v25';", 'PWA cache generation');
await replaceExact(
  'sw.js',
  "'/inventory-command-core.js', '/spool-actions-core.js', '/sync-client.js'",
  "'/inventory-command-core.js', '/spool-actions-core.js', '/bulk-actions-core.js', '/sync-client.js'",
  'bulk core service-worker asset',
);
await replaceExact(
  'sw.js',
  "'/inventory-command-client.js', '/spool-actions-client.js', '/app.js'",
  "'/inventory-command-client.js', '/spool-actions-client.js', '/bulk-actions-client.js', '/app.js'",
  'bulk client service-worker asset',
);

await replaceExact('app-version.js', "const APP_VERSION = '9.8.0';", "const APP_VERSION = '9.9.0';", 'app version');

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (pkg.version !== '9.8.0') throw new Error(`package.json: expected 9.8.0, found ${pkg.version}`);
pkg.version = '9.9.0';
pkg.description = 'Local-first per-user filament inventory PWA with isolated private inventories, smart intake, QR workflows, contextual and bulk spool operations, Printer/AMS command center, secure sync, labels, and per-user UX customization.';
await writeFile('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
if (lock.version !== '9.8.0' || lock.packages?.['']?.version !== '9.8.0') throw new Error('package-lock.json root version is not 9.8.0');
lock.version = '9.9.0';
lock.packages[''].version = '9.9.0';
await writeFile('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

await replaceExact(
  'netlify.toml',
  '[[headers]]\n  for = "/spool-actions-client.js"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n\n[[headers]]\n  for = "/styles.css"',
  '[[headers]]\n  for = "/spool-actions-client.js"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n\n[[headers]]\n  for = "/bulk-actions-core.js"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n\n[[headers]]\n  for = "/bulk-actions-client.js"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n\n[[headers]]\n  for = "/styles.css"',
  'bulk cache headers',
);

await replaceExact(
  '.github/workflows/ci.yml',
  '          test -f dist/spool-actions-client.js\n          test -f dist/app.js',
  '          test -f dist/spool-actions-client.js\n          test -f dist/bulk-actions-core.js\n          test -f dist/bulk-actions-client.js\n          test -f dist/app.js',
  'bulk deploy assertions',
);

await replaceExact(
  'audit-client.js',
  '.audit-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 170px 190px auto;',
  '.audit-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 190px auto;',
  'private audit toolbar layout',
);
await replaceExact(
  'audit-client.js',
  '<span class="eyebrow">Shared household ledger</span><h3 style="margin-top:6px">Household activity</h3><p id="auditCount">0 events</p>',
  '<span class="eyebrow">Private activity</span><h3 style="margin-top:6px">Inventory activity</h3><p id="auditCount">0 events</p>',
  'private audit heading',
);
await replaceExact(
  'audit-client.js',
  '<input class="field" id="auditSearch" type="search" placeholder="Search spool, action, owner, device…"/><select class="select" id="auditOwner"><option value="">Bill + Aimee</option><option>Bill</option><option>Aimee</option></select><select class="select" id="auditCategory">',
  '<input class="field" id="auditSearch" type="search" placeholder="Search spool, action, device…"/><select class="select" id="auditCategory">',
  'private audit filters',
);
await replaceExact(
  'audit-client.js',
  "      ['Owner changes', recent.filter(row => categoryFor(row.type) === 'ownership').length],",
  "      ['Lifecycle', recent.filter(row => categoryFor(row.type) === 'lifecycle').length],",
  'audit metric label',
);
await replaceExact(
  'audit-client.js',
  '<h3>Recent household activity</h3><p>Latest inventory, measurement, owner and AMS changes.</p>',
  '<h3>Recent activity</h3><p>Latest inventory, measurement, lifecycle and Printer / AMS changes.</p>',
  'dashboard activity copy',
);
await replaceExact('audit-client.js', 'No household activity recorded yet.', 'No activity recorded yet.', 'activity empty state');

await appendOnce('ui-system.css', '/* === Bulk spool operations v9.9 === */', `
/* === Bulk spool operations v9.9 === */
.fi-ui .inventory-command-select{margin-left:auto;min-width:86px}
.fi-ui .bulk-select-control{display:none;align-items:center;gap:7px;width:max-content;margin:10px 12px -2px auto;padding:6px 9px;border:1px solid var(--ui-hairline);border-radius:999px;background:var(--ui-surface-2);color:var(--muted);font:700 10px/1 system-ui;cursor:pointer}
.fi-ui .bulk-select-control span{display:grid;place-items:center;width:18px;height:18px;border:1px solid var(--ui-hairline-strong);border-radius:6px;color:transparent;background:var(--ui-surface-1)}
.fi-ui.bulk-selection-mode .bulk-select-control{display:inline-flex}
.fi-ui .bulk-select-control[aria-pressed="true"]{color:var(--text);border-color:var(--ui-accent-border);background:var(--ui-accent-soft)}
.fi-ui .bulk-select-control[aria-pressed="true"] span{color:#06111d;border-color:transparent;background:var(--ux-accent,var(--cyan))}
.fi-ui.bulk-selection-mode .spool-card{cursor:pointer;transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}
.fi-ui.bulk-selection-mode .spool-card.bulk-selected{border-color:var(--ui-accent-border);box-shadow:0 0 0 2px var(--ui-accent-soft),var(--ui-shadow-1)}
.fi-ui.bulk-selection-mode .spool-card .spool-action-bar{opacity:.38;pointer-events:none}
.fi-ui.bulk-selection-mode .mobile-add{display:none!important}
.fi-ui .bulk-action-dock{position:fixed;z-index:85;left:50%;bottom:calc(12px + env(safe-area-inset-bottom));transform:translateX(-50%);display:grid;grid-template-columns:minmax(180px,.7fr) minmax(0,1.3fr);gap:12px;align-items:center;width:min(1120px,calc(100% - 24px));padding:12px;border:1px solid var(--ui-hairline-strong);border-radius:18px;background:rgba(7,17,31,.94);box-shadow:0 20px 60px rgba(0,0,0,.42);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.fi-ui .bulk-action-dock[hidden]{display:none!important}
.fi-ui .bulk-action-summary strong,.fi-ui .bulk-action-summary span{display:block}.fi-ui .bulk-action-summary strong{font-size:14px}.fi-ui .bulk-action-summary span{margin-top:3px;color:var(--muted);font-size:10px;line-height:1.35}
.fi-ui .bulk-action-buttons{display:flex;justify-content:flex-end;gap:7px;overflow-x:auto;scrollbar-width:none}.fi-ui .bulk-action-buttons::-webkit-scrollbar{display:none}.fi-ui .bulk-action-buttons .btn{flex:0 0 auto;min-height:38px;padding:7px 10px;font-size:10px}
.fi-ui .bulk-move-dialog{width:min(520px,calc(100vw - 28px))}.fi-ui .bulk-move-dialog .dialog-body{display:grid;gap:14px}.fi-ui .bulk-move-dialog .dialog-body p{margin:0;line-height:1.5}
html[data-theme="light"] .bulk-action-dock{background:rgba(255,255,255,.96);box-shadow:0 18px 55px rgba(15,23,42,.18)}
@media(max-width:760px){
  .fi-ui .inventory-command-head{flex-wrap:wrap}.fi-ui .inventory-command-select{margin-left:0}
  .fi-ui .bulk-action-dock{grid-template-columns:1fr;gap:9px;bottom:calc(8px + env(safe-area-inset-bottom));width:calc(100% - 16px);padding:10px;border-radius:16px}
  .fi-ui .bulk-action-summary{display:flex;align-items:center;justify-content:space-between;gap:10px}.fi-ui .bulk-action-summary span{margin:0;text-align:right}
  .fi-ui .bulk-action-buttons{justify-content:flex-start;padding-bottom:1px}
}
@media(max-width:480px){
  .fi-ui .bulk-move-dialog{width:100%;max-width:none;margin:auto 0 0;border-radius:22px 22px 0 0;padding-bottom:env(safe-area-inset-bottom)}
  .fi-ui .bulk-action-summary span{max-width:54%;font-size:9px}.fi-ui .bulk-action-buttons .btn{min-height:42px}
}
@media(prefers-reduced-motion:reduce){.fi-ui.bulk-selection-mode .spool-card{transition:none}}
`);

const testNames = await readdir('tests');
for (const name of testNames.filter(name => name.endsWith('.test.mjs'))) {
  const path = `tests/${name}`;
  let text = await readFile(path, 'utf8');
  text = text.replaceAll('filament-inventory-v24', 'filament-inventory-v25');
  text = text.replaceAll("version.APP_VERSION, '9.8.0'", "version.APP_VERSION, '9.9.0'");
  text = text.replaceAll("version.DISPLAY_VERSION, 'v9.8.0'", "version.DISPLAY_VERSION, 'v9.9.0'");
  text = text.replaceAll("APP_VERSION = '9\\.8\\.0'", "APP_VERSION = '9\\.9\\.0'");
  text = text.replaceAll('v9.8 remains an interaction release', 'v9.9 remains an interaction release');
  await writeFile(path, text);
}

console.log('Applied v9.9 bulk spool integration.');
