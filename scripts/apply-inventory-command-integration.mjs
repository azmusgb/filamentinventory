import { readFile, writeFile, unlink } from 'node:fs/promises';

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
  '<script defer src="/printer-core.js"></script>\n<script defer src="/user-isolation.js"></script>',
  '<script defer src="/printer-core.js"></script>\n<script defer src="/inventory-command-core.js"></script>\n<script defer src="/user-isolation.js"></script>',
  'inventory command core browser load',
);
await replaceExact(
  'index.html',
  '<script defer src="/printer-dashboard.js"></script>\n<script defer src="/app.js"></script>',
  '<script defer src="/printer-dashboard.js"></script>\n<script defer src="/inventory-command-client.js"></script>\n<script defer src="/app.js"></script>',
  'inventory command client browser load',
);

await replaceExact(
  'scripts/public-assets.mjs',
  "  'printer-core.js',\n",
  "  'printer-core.js',\n  'inventory-command-core.js',\n",
  'command core public asset',
);
await replaceExact(
  'scripts/public-assets.mjs',
  "  'printer-dashboard.js',\n",
  "  'printer-dashboard.js',\n  'inventory-command-client.js',\n",
  'command client public asset',
);

await replaceExact('sw.js', "const CACHE = 'filament-inventory-v22';", "const CACHE = 'filament-inventory-v23';", 'PWA cache generation');
await replaceExact(
  'sw.js',
  "'/printer-core.js', '/sync-client.js'",
  "'/printer-core.js', '/inventory-command-core.js', '/sync-client.js'",
  'command core PWA asset',
);
await replaceExact(
  'sw.js',
  "'/printer-dashboard.js', '/app.js'",
  "'/printer-dashboard.js', '/inventory-command-client.js', '/app.js'",
  'command client PWA asset',
);

await replaceExact(
  'netlify.toml',
  '[[headers]]\n  for = "/printer-dashboard.js"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n\n[[headers]]\n  for = "/styles.css"',
  '[[headers]]\n  for = "/printer-dashboard.js"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n\n[[headers]]\n  for = "/inventory-command-core.js"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n\n[[headers]]\n  for = "/inventory-command-client.js"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n\n[[headers]]\n  for = "/styles.css"',
  'command Netlify cache headers',
);

await replaceExact('app-version.js', "const APP_VERSION = '9.6.0';", "const APP_VERSION = '9.7.0';", 'app release version');
await replaceExact('package.json', '"version": "9.6.0"', '"version": "9.7.0"', 'package version');
await replaceExact(
  'package-lock.json',
  '"name": "filamentinventory",\n  "version": "9.6.0",',
  '"name": "filamentinventory",\n  "version": "9.7.0",',
  'lockfile package version',
);
await replaceExact(
  'package-lock.json',
  '"name": "filamentinventory",\n      "version": "9.6.0",',
  '"name": "filamentinventory",\n      "version": "9.7.0",',
  'lockfile root package version',
);

await replaceExact(
  'tests/version-authority.test.mjs',
  "assert.equal(version.APP_VERSION, '9.6.0');\n  assert.equal(version.DATA_SCHEMA_VERSION, 10);\n  assert.equal(version.DISPLAY_VERSION, 'v9.6.0');",
  "assert.equal(version.APP_VERSION, '9.7.0');\n  assert.equal(version.DATA_SCHEMA_VERSION, 10);\n  assert.equal(version.DISPLAY_VERSION, 'v9.7.0');",
  'version authority assertion',
);
await replaceExact('tests/ui-system.test.mjs', 'assert.match(sw, /filament-inventory-v22/);', 'assert.match(sw, /filament-inventory-v23/);', 'UI-system cache assertion');
await replaceExact(
  'tests/ui-system.test.mjs',
  "test('v9.6 remains a UI release without a schema bump', async () => {\n  const version = await read('app-version.js');\n  assert.match(version, /APP_VERSION = '9\\.6\\.0'/);",
  "test('v9.7 remains an interaction release without a schema bump', async () => {\n  const version = await read('app-version.js');\n  assert.match(version, /APP_VERSION = '9\\.7\\.0'/);",
  'UI-system release assertion',
);

const css = `
/* Inventory command surface ------------------------------------------------ */
.fi-ui .inventory-command {
  display: grid;
  gap: var(--space-3);
  margin: 0 0 var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--hairline);
  border-radius: var(--r-lg);
  background: var(--surface-soft);
  box-shadow: 0 10px 26px rgba(0, 0, 0, .10);
}

.fi-ui .inventory-command-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.fi-ui .inventory-command-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.fi-ui .inventory-command-copy > strong {
  font-size: clamp(15px, 1.8vw, 18px);
  line-height: 1.2;
  letter-spacing: -.025em;
}

.fi-ui .inventory-command-copy > span:last-child {
  color: var(--muted);
  font-size: 10px;
  line-height: 1.45;
}

.fi-ui .inventory-command-shortcut {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
}

.fi-ui .inventory-command-shortcut kbd {
  min-width: 34px;
  padding: 5px 7px;
  border: 1px solid var(--hairline-strong);
  border-bottom-width: 2px;
  border-radius: var(--r-xs);
  background: var(--surface-1);
  color: var(--text);
  font: 800 10px/1 var(--font-sans);
  text-align: center;
  box-shadow: 0 3px 8px rgba(0, 0, 0, .12);
}

.fi-ui .inventory-command-modes {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-2);
}

.fi-ui .inventory-command-mode {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 42px;
  padding: 8px 10px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-sm);
  background: var(--surface-0);
  color: var(--muted);
  font-size: 11px;
  font-weight: 850;
  cursor: pointer;
}

.fi-ui .inventory-command-mode strong {
  display: grid;
  min-width: 24px;
  min-height: 24px;
  place-items: center;
  padding: 0 6px;
  border-radius: var(--r-pill);
  background: var(--surface-2);
  color: var(--text);
  font-size: 10px;
}

.fi-ui .inventory-command-mode[aria-pressed="true"] {
  border-color: var(--accent-border);
  background: var(--accent-soft);
  color: var(--text);
}

.fi-ui .inventory-command-mode[aria-pressed="true"] strong {
  background: var(--ux-accent, var(--cyan));
  color: #06111d;
}

.fi-ui .inventory-command-filters {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  flex-wrap: wrap;
}

.fi-ui .inventory-command-hint {
  color: var(--muted);
  font-size: 9px;
  line-height: 1.45;
}

.fi-ui .inventory-filter-token,
.fi-ui .inventory-command-clear {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 4px 8px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-pill);
  background: var(--surface-0);
  color: var(--text);
  font-size: 9px;
  font-weight: 800;
  cursor: pointer;
}

.fi-ui .inventory-filter-token span { color: var(--muted); font-weight: 700; }
.fi-ui .inventory-filter-token b { color: var(--muted); font-size: 12px; line-height: 1; }
.fi-ui .inventory-filter-token-mode { border-color: var(--accent-border); background: var(--accent-soft); }
.fi-ui .inventory-command-clear { border-color: transparent; background: transparent; color: var(--muted); }

.fi-ui .inventory-command-recent {
  min-width: 0;
}

.fi-ui .inventory-command-recent-label {
  display: block;
  margin: 0 0 6px;
  color: var(--muted);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.fi-ui .inventory-command-recent-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
}

.fi-ui .inventory-command-spool {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 5px 7px;
  align-items: center;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-sm);
  background: var(--surface-0);
}

.fi-ui .inventory-command-spool > button:first-child {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  gap: 7px;
  align-items: center;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.fi-ui .inventory-command-spool > button:first-child > i {
  width: 22px;
  height: 22px;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 7px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .08);
}

.fi-ui .inventory-command-spool > button:first-child > span {
  min-width: 0;
}

.fi-ui .inventory-command-spool > button:first-child strong,
.fi-ui .inventory-command-spool > button:first-child small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fi-ui .inventory-command-spool > button:first-child strong { font-size: 10px; }
.fi-ui .inventory-command-spool > button:first-child small { margin-top: 2px; color: var(--muted); font-size: 8px; }
.fi-ui .inventory-command-spool > button:first-child > b { color: var(--text); font-size: 9px; white-space: nowrap; }
.fi-ui .inventory-command-spool > small { grid-column: 1; color: var(--muted); font-size: 8px; padding-left: 29px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.fi-ui .inventory-command-weigh {
  grid-column: 2;
  grid-row: 2;
  min-height: 24px;
  padding: 3px 7px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-xs);
  background: transparent;
  color: var(--muted);
  font-size: 8px;
  font-weight: 850;
  cursor: pointer;
}

.fi-ui .inventory-command-empty {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px dashed var(--hairline-strong);
  border-radius: var(--r-sm);
  color: var(--muted);
  font-size: 10px;
}

.fi-ui .inventory-command-empty strong { color: var(--text); }
.fi-ui .inventory-command-empty .btn { margin-left: auto; min-height: 34px; }
.fi-ui .inventory-command-hidden { display: none !important; }

@media (hover: hover) and (pointer: fine) {
  .fi-ui .inventory-command-mode:hover,
  .fi-ui .inventory-command-spool:hover,
  .fi-ui .inventory-filter-token:hover {
    border-color: var(--hairline-strong);
    background: var(--surface-hover);
  }
  .fi-ui .inventory-command-mode[aria-pressed="true"]:hover { border-color: var(--accent-border); background: var(--accent-soft); }
  .fi-ui .inventory-command-weigh:hover { color: var(--text); border-color: var(--accent-border); }
}

html[data-ux-theme="light"].fi-ui .inventory-command,
html[data-ux-theme="light"].fi-ui .inventory-command-spool,
html[data-ux-theme="light"].fi-ui .inventory-command-mode,
html[data-ux-theme="light"].fi-ui .inventory-filter-token {
  box-shadow: none;
}

html[data-ux-theme="contrast"].fi-ui .inventory-command,
html[data-ux-theme="contrast"].fi-ui .inventory-command-spool,
html[data-ux-theme="contrast"].fi-ui .inventory-command-mode,
html[data-ux-theme="contrast"].fi-ui .inventory-filter-token,
html[data-ux-theme="contrast"].fi-ui .inventory-command-weigh {
  border-color: #fff;
}

@media (max-width: 900px) {
  .fi-ui .inventory-command-recent-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 720px) {
  .fi-ui .inventory-command {
    gap: 10px;
    margin-bottom: 12px;
    padding: 12px;
    border-radius: var(--r-md);
  }
  .fi-ui .inventory-command-shortcut { display: none; }
  .fi-ui .inventory-command-copy > strong { font-size: 15px; }
  .fi-ui .inventory-command-modes {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    scrollbar-width: none;
    scroll-snap-type: x proximity;
  }
  .fi-ui .inventory-command-modes::-webkit-scrollbar { display: none; }
  .fi-ui .inventory-command-mode {
    flex: 0 0 auto;
    min-width: 84px;
    min-height: 40px;
    scroll-snap-align: start;
  }
  .fi-ui .inventory-command-filters {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
  }
  .fi-ui .inventory-command-filters::-webkit-scrollbar { display: none; }
  .fi-ui .inventory-filter-token,
  .fi-ui .inventory-command-clear,
  .fi-ui .inventory-command-hint { flex: 0 0 auto; }
  .fi-ui .inventory-command-recent-list {
    display: flex;
    overflow-x: auto;
    gap: 7px;
    padding-bottom: 2px;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
  }
  .fi-ui .inventory-command-recent-list::-webkit-scrollbar { display: none; }
  .fi-ui .inventory-command-spool {
    flex: 0 0 min(78vw, 280px);
    scroll-snap-align: start;
  }
}

@media (max-width: 480px) {
  .fi-ui .inventory-command { margin-left: -2px; margin-right: -2px; padding: 10px; }
  .fi-ui .inventory-command-copy > span:last-child { font-size: 9px; }
  .fi-ui .inventory-command-mode { min-width: 78px; padding-inline: 8px; }
  .fi-ui .inventory-command-spool { flex-basis: min(84vw, 270px); }
  .fi-ui .inventory-command-empty { align-items: flex-start; flex-direction: column; }
  .fi-ui .inventory-command-empty .btn { width: 100%; margin-left: 0; }
}
`;
await appendOnce('ui-system.css', '/* Inventory command surface ------------------------------------------------ */', css);

await replaceExact(
  '.github/workflows/ci.yml',
  'permissions:\n  contents: write',
  'permissions:\n  contents: read',
  'restore read-only CI permissions',
);
await replaceExact(
  '.github/workflows/ci.yml',
  '      - name: Check out repository\n        uses: actions/checkout@v4\n        with:\n          ref: ${{ github.head_ref || github.ref_name }}',
  '      - name: Check out repository\n        uses: actions/checkout@v4',
  'restore normal checkout',
);
await replaceExact(
  '.github/workflows/ci.yml',
  '      - name: Apply inventory command integration once\n        if: github.event_name == \'pull_request\'\n        run: |\n          node scripts/apply-inventory-command-integration.mjs\n          git add -A\n          if git diff --cached --quiet; then\n            echo "Inventory command integration already applied."\n          else\n            git config user.name "github-actions[bot]"\n            git config user.email "41898282+github-actions[bot]@users.noreply.github.com"\n            git commit -m "feat: wire inventory command surface"\n            git push origin HEAD:${{ github.head_ref }}\n          fi\n\n',
  '',
  'remove one-time integration step',
);
await replaceExact(
  '.github/workflows/ci.yml',
  '          test -f dist/printer-dashboard.js\n          test -f dist/app.js',
  '          test -f dist/printer-dashboard.js\n          test -f dist/inventory-command-core.js\n          test -f dist/inventory-command-client.js\n          test -f dist/app.js',
  'command deploy assertions',
);

await unlink('scripts/apply-inventory-command-integration.mjs');
console.log('Inventory command surface wired; helper removed and CI restored to read-only.');
