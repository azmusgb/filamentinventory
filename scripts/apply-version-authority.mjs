import { readFile, writeFile } from 'node:fs/promises';

async function patch(path, replacements) {
  let text = await readFile(path, 'utf8');
  for (const [from, to] of replacements) {
    const count = text.split(from).length - 1;
    if (count !== 1) throw new Error(`${path}: expected exactly one match for ${JSON.stringify(from)}, found ${count}`);
    text = text.replace(from, to);
  }
  await writeFile(path, text);
}

await patch('index.html', [
  [
    '<div class="brand"><h1>Filament Inventory</h1><p>Local-first spool tracking • measured when possible • conservative when unknown</p></div>',
    '<div class="brand"><h1>Filament Inventory</h1><p>Local-first spool tracking • measured when possible • conservative when unknown • <span data-app-version></span></p></div>'
  ],
  ['<span class="eyebrow">Inventory control center · v3</span>', '<span class="eyebrow">Inventory control center</span>'],
  ['<script defer src="/state-merge.js"></script>', '<script defer src="/app-version.js"></script>\n<script defer src="/state-merge.js"></script>'],
]);

await patch('app.js', [
  [
    '  const APP_VERSION = 3;',
    "  const VERSION_INFO = globalThis.FilamentInventoryVersion || Object.freeze({APP_VERSION:'9.0.0', DATA_SCHEMA_VERSION:9, DISPLAY_VERSION:'v9.0.0'});\n  const APP_VERSION = VERSION_INFO.APP_VERSION;\n  const DATA_SCHEMA_VERSION = VERSION_INFO.DATA_SCHEMA_VERSION;"
  ],
  [
    '    localStorage.setItem(STORAGE_KEY, JSON.stringify({version:APP_VERSION, savedAt:nowIso(), meta, spools:inventory, weighLog}));',
    '    localStorage.setItem(STORAGE_KEY, JSON.stringify({version:DATA_SCHEMA_VERSION, appVersion:APP_VERSION, savedAt:nowIso(), meta, spools:inventory, weighLog}));'
  ],
  [
    '<div class="health-stat"><span>App version</span><strong>v${APP_VERSION}</strong></div>',
    '<div class="health-stat"><span>App version</span><strong>${VERSION_INFO.DISPLAY_VERSION}</strong></div>'
  ],
  [
    "    download(`filament-inventory-${exportedAt.slice(0,10)}.json`, JSON.stringify({version:APP_VERSION,exportedAt,meta,spools:inventory,weighLog},null,2), 'application/json');",
    "    download(`filament-inventory-${VERSION_INFO.DISPLAY_VERSION}-${exportedAt.slice(0,10)}.json`, JSON.stringify({version:DATA_SCHEMA_VERSION,appVersion:APP_VERSION,exportedAt,meta,spools:inventory,weighLog},null,2), 'application/json');"
  ],
  [
    "    download(`filament-inventory-${new Date().toISOString().slice(0,10)}.csv`, [headers,...rows].map(r => r.map(csvCell).join(',')).join('\\n'), 'text/csv;charset=utf-8');",
    "    download(`filament-inventory-${VERSION_INFO.DISPLAY_VERSION}-${new Date().toISOString().slice(0,10)}.csv`, [headers,...rows].map(r => r.map(csvCell).join(',')).join('\\n'), 'text/csv;charset=utf-8');"
  ],
  [
    "    download(`filament-measurements-${new Date().toISOString().slice(0,10)}.csv`, [headers,...rows].map(r => r.map(csvCell).join(',')).join('\\n'), 'text/csv;charset=utf-8');",
    "    download(`filament-measurements-${VERSION_INFO.DISPLAY_VERSION}-${new Date().toISOString().slice(0,10)}.csv`, [headers,...rows].map(r => r.map(csvCell).join(',')).join('\\n'), 'text/csv;charset=utf-8');"
  ],
]);

await patch('household-client.js', [
  [
    '  const VERSION = 8;',
    "  const VERSION_INFO = globalThis.FilamentInventoryVersion || Object.freeze({APP_VERSION:'9.0.0', DATA_SCHEMA_VERSION:9, DISPLAY_VERSION:'v9.0.0'});\n  const VERSION = VERSION_INFO.DATA_SCHEMA_VERSION;\n  const APP_VERSION = VERSION_INFO.APP_VERSION;\n  const VERSION_LABEL = VERSION_INFO.DISPLAY_VERSION;"
  ],
  ["    if (eyebrow) eyebrow.textContent = 'Household inventory control · v8';", "    if (eyebrow) eyebrow.textContent = `Household inventory control · ${VERSION_LABEL}`;"],
  ["    if (dataTitle) dataTitle.textContent = 'Data, backup & install · v8';", "    if (dataTitle) dataTitle.textContent = `Data, backup & install · ${VERSION_LABEL}`;"],
  ['<div><span class="eyebrow">Two-user household inventory · v8</span><h2 id="householdTitle">', '<div><span class="eyebrow">Two-user household inventory · ${VERSION_LABEL}</span><h2 id="householdTitle">'],
  [
    "    download(`filament-inventory-v8-${nowIso().slice(0,10)}.csv`,[headers,...rows].map(r=>r.map(csvCell).join(',')).join('\\n'),'text/csv;charset=utf-8');\n    toast('Full v8 inventory CSV exported.');",
    "    download(`filament-inventory-${VERSION_LABEL}-${nowIso().slice(0,10)}.csv`,[headers,...rows].map(r=>r.map(csvCell).join(',')).join('\\n'),'text/csv;charset=utf-8');\n    toast(`Full ${VERSION_LABEL} inventory CSV exported.`);"
  ],
  [
    "  function backupComplete() { const state=readState(),exportedAt=nowIso();state.meta={...(state.meta||{}),lastBackupAt:exportedAt};writeState(state);download(`filament-inventory-v8-${exportedAt.slice(0,10)}.json`,JSON.stringify({...state,version:VERSION,exportedAt},null,2),'application/json');toast('Complete v8 backup exported.'); }",
    "  function backupComplete() { const state=readState(),exportedAt=nowIso();state.meta={...(state.meta||{}),lastBackupAt:exportedAt};writeState(state);download(`filament-inventory-${VERSION_LABEL}-${exportedAt.slice(0,10)}.json`,JSON.stringify({...state,version:VERSION,appVersion:APP_VERSION,exportedAt},null,2),'application/json');toast(`Complete ${VERSION_LABEL} backup exported.`); }"
  ],
  ["alert('v8 backup restored. The app will reload.');", "alert(`${VERSION_LABEL} backup restored. The app will reload.`);"],
]);

await patch('ux-client.js', [
  [
    '  const VERSION = 9;',
    "  const VERSION_INFO = globalThis.FilamentInventoryVersion || Object.freeze({APP_VERSION:'9.0.0', DATA_SCHEMA_VERSION:9, DISPLAY_VERSION:'v9.0.0'});\n  const VERSION = VERSION_INFO.DATA_SCHEMA_VERSION;\n  const VERSION_LABEL = VERSION_INFO.DISPLAY_VERSION;"
  ],
  ['<span class="eyebrow">Personal experience · v9</span>', '<span class="eyebrow">Personal experience · ${VERSION_LABEL}</span>'],
]);

console.log('Applied authoritative v9.0.0 version normalization.');
