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
  '<script defer src="/inventory-command-core.js"></script>\n<script defer src="/user-isolation.js"></script>',
  '<script defer src="/inventory-command-core.js"></script>\n<script defer src="/spool-actions-core.js"></script>\n<script defer src="/user-isolation.js"></script>',
  'spool action core browser load',
);
await replaceExact(
  'index.html',
  '<script defer src="/inventory-command-client.js"></script>\n<script defer src="/app.js"></script>',
  '<script defer src="/inventory-command-client.js"></script>\n<script defer src="/spool-actions-client.js"></script>\n<script defer src="/app.js"></script>',
  'spool action client browser load',
);

await replaceExact(
  'scripts/public-assets.mjs',
  "  'inventory-command-core.js',\n",
  "  'inventory-command-core.js',\n  'spool-actions-core.js',\n",
  'spool action core public asset',
);
await replaceExact(
  'scripts/public-assets.mjs',
  "  'inventory-command-client.js',\n",
  "  'inventory-command-client.js',\n  'spool-actions-client.js',\n",
  'spool action client public asset',
);

await replaceExact('sw.js', "const CACHE = 'filament-inventory-v23';", "const CACHE = 'filament-inventory-v24';", 'PWA cache generation');
await replaceExact(
  'sw.js',
  "'/inventory-command-core.js', '/sync-client.js'",
  "'/inventory-command-core.js', '/spool-actions-core.js', '/sync-client.js'",
  'spool action core PWA asset',
);
await replaceExact(
  'sw.js',
  "'/inventory-command-client.js', '/app.js'",
  "'/inventory-command-client.js', '/spool-actions-client.js', '/app.js'",
  'spool action client PWA asset',
);

await replaceExact(
  'netlify.toml',
  '[[headers]]\n  for = "/inventory-command-client.js"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n\n[[headers]]\n  for = "/styles.css"',
  '[[headers]]\n  for = "/inventory-command-client.js"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n\n[[headers]]\n  for = "/spool-actions-core.js"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n\n[[headers]]\n  for = "/spool-actions-client.js"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n\n[[headers]]\n  for = "/styles.css"',
  'spool action Netlify cache headers',
);

await replaceExact('app-version.js', "const APP_VERSION = '9.7.0';", "const APP_VERSION = '9.8.0';", 'app release version');

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (pkg.version !== '9.7.0') throw new Error(`package.json: expected 9.7.0, found ${pkg.version}`);
pkg.version = '9.8.0';
pkg.description = 'Local-first per-user filament inventory PWA with isolated workspaces, smart intake, QR lookup, Printer/AMS management, contextual spool actions, secure sync, QR labels, and per-user UX customization.';
await writeFile('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
if (lock.version !== '9.7.0' || lock.packages?.['']?.version !== '9.7.0') throw new Error('package-lock.json: expected 9.7.0 release metadata');
lock.version = '9.8.0';
lock.packages[''].version = '9.8.0';
await writeFile('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

const testFiles = (await readdir('tests')).filter(name => name.endsWith('.mjs'));
let cacheAssertions = 0;
let releaseAssertions = 0;
for (const name of testFiles) {
  const path = `tests/${name}`;
  let text = await readFile(path, 'utf8');
  const before = text;
  if (text.includes('filament-inventory-v23')) {
    cacheAssertions += text.split('filament-inventory-v23').length - 1;
    text = text.replaceAll('filament-inventory-v23', 'filament-inventory-v24');
  }
  if (text.includes('9.7.0')) {
    releaseAssertions += text.split('9.7.0').length - 1;
    text = text.replaceAll('9.7.0', '9.8.0');
  }
  if (text.includes('9\\.7\\.0')) {
    releaseAssertions += text.split('9\\.7\\.0').length - 1;
    text = text.replaceAll('9\\.7\\.0', '9\\.8\\.0');
  }
  text = text.replaceAll('v9.7 remains', 'v9.8 remains');
  if (text !== before) await writeFile(path, text);
}
if (!cacheAssertions) throw new Error('Expected at least one v23 cache assertion to update');
if (!releaseAssertions) throw new Error('Expected at least one v9.7 release assertion to update');

const css = `
/* Contextual spool actions ------------------------------------------------- */
html.fi-ui.spool-actions-enhanced #inventoryGrid .spool-card > .card-actions {
  display: none;
}

.fi-ui .spool-action-bar {
  display: grid;
  grid-template-columns: minmax(0, .78fr) minmax(0, 1.22fr);
  gap: var(--space-2);
  padding: 0 var(--space-4) var(--space-4);
}

.fi-ui .spool-action-bar .btn {
  width: 100%;
  min-height: 38px;
}

.fi-ui .spool-action-dialog {
  width: min(760px, calc(100vw - 32px));
  max-width: 760px;
  max-height: min(820px, calc(100dvh - 32px));
  padding: 0;
  border: 0;
  border-radius: var(--r-xl);
  background: transparent;
  color: var(--text);
  overflow: visible;
}

.fi-ui .spool-action-dialog::backdrop {
  background: rgba(1, 6, 12, .72);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}

.fi-ui .spool-action-shell {
  display: grid;
  max-height: min(820px, calc(100dvh - 32px));
  overflow: hidden;
  border: 1px solid var(--hairline-strong);
  border-radius: var(--r-xl);
  background: var(--surface-2);
  box-shadow: var(--shadow-float);
}

.fi-ui .spool-action-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-5) var(--space-4);
  border-bottom: 1px solid var(--hairline);
}

.fi-ui .spool-action-head h2 {
  margin: 6px 0 0;
  font-size: clamp(22px, 4vw, 30px);
  letter-spacing: -.04em;
}

.fi-ui .spool-action-body {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  overflow: auto;
  overscroll-behavior: contain;
}

.fi-ui .spool-action-summary {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--hairline);
  border-radius: var(--r-lg);
  background: var(--surface-soft);
}

.fi-ui .spool-action-ident {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: var(--space-3);
  align-items: center;
}

.fi-ui .spool-action-swatch {
  width: 44px;
  height: 44px;
  border: 1px solid rgba(255,255,255,.18);
  border-radius: var(--r-sm);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.08);
}

.fi-ui .spool-action-ident strong {
  display: block;
  font-size: 16px;
  letter-spacing: -.02em;
}

.fi-ui .spool-action-ident span {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fi-ui .spool-action-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
}

.fi-ui .spool-action-metrics > div {
  min-width: 0;
  padding: 10px 11px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-sm);
  background: var(--surface-0);
}

.fi-ui .spool-action-metrics span,
.fi-ui .spool-action-updated span {
  display: block;
  color: var(--muted);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: .09em;
  text-transform: uppercase;
}

.fi-ui .spool-action-metrics strong {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fi-ui .spool-action-metrics small {
  display: block;
  margin-top: 2px;
  color: var(--muted);
  font-size: 9px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fi-ui .spool-action-updated {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-2);
  border-top: 1px solid var(--hairline);
}

.fi-ui .spool-action-updated strong {
  font-size: 10px;
  color: var(--muted);
  text-align: right;
}

.fi-ui .spool-action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.fi-ui .spool-action-grid .btn {
  width: 100%;
  min-height: 44px;
  justify-content: center;
}

.fi-ui .spool-action-note {
  margin: 0;
  color: var(--muted);
  font-size: 9px;
  line-height: 1.55;
}

.fi-ui .inventory-command-more {
  grid-column: 2;
  grid-row: 1;
  align-self: start;
  justify-self: end;
  display: grid;
  width: 28px;
  height: 26px;
  place-items: center;
  padding: 0;
  border: 1px solid var(--hairline);
  border-radius: var(--r-xs);
  background: transparent;
  color: var(--muted);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .08em;
  cursor: pointer;
}

.fi-ui .printer-slot-more,
.fi-ui .scan-more-actions {
  white-space: nowrap;
}

@media (hover: hover) and (pointer: fine) {
  .fi-ui .inventory-command-more:hover {
    border-color: var(--accent-border);
    background: var(--accent-soft);
    color: var(--text);
  }
}

@media (prefers-reduced-transparency: reduce) {
  .fi-ui .spool-action-dialog::backdrop {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

@media (max-width: 720px) {
  .fi-ui .spool-action-dialog {
    width: 100%;
    max-width: none;
    max-height: calc(100dvh - env(safe-area-inset-top) - 10px);
    margin: auto 0 0;
  }
  .fi-ui .spool-action-shell {
    max-height: calc(100dvh - env(safe-area-inset-top) - 10px);
    border-radius: var(--r-xl) var(--r-xl) 0 0;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .fi-ui .spool-action-head {
    padding: 16px 16px 13px;
  }
  .fi-ui .spool-action-body {
    gap: 12px;
    padding: 14px 16px 16px;
  }
  .fi-ui .spool-action-summary {
    padding: 13px;
  }
  .fi-ui .spool-action-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 480px) {
  .fi-ui .spool-action-metrics {
    grid-template-columns: 1fr;
  }
  .fi-ui .spool-action-metrics > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 10px;
    align-items: center;
  }
  .fi-ui .spool-action-metrics > div > span {
    grid-column: 1;
  }
  .fi-ui .spool-action-metrics > div > strong {
    grid-column: 2;
    grid-row: 1 / span 2;
    margin: 0;
  }
  .fi-ui .spool-action-metrics > div > small {
    grid-column: 1;
  }
  .fi-ui .spool-action-grid {
    grid-template-columns: 1fr;
  }
  .fi-ui .spool-action-updated {
    align-items: flex-start;
    flex-direction: column;
  }
  .fi-ui .spool-action-updated strong {
    text-align: left;
  }
}
`;
await appendOnce('ui-system.css', '/* Contextual spool actions ------------------------------------------------- */', css);

console.log(`Contextual spool actions wired for v9.8.0; updated ${cacheAssertions} cache assertions and ${releaseAssertions} release assertions.`);
