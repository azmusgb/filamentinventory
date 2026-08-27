import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = file => readFile(path.join(root, file), 'utf8');
const write = (file, text) => writeFile(path.join(root, file), text, 'utf8');

function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return text.replace(from, to);
}

async function stripStyleBlock(file, start, next) {
  let text = await read(file);
  const startIndex = text.indexOf(start);
  const nextIndex = text.indexOf(next, startIndex + start.length);
  if (startIndex < 0 || nextIndex < 0) throw new Error(`${file}: style block boundary not found`);
  text = text.slice(0, startIndex) + '\n' + text.slice(nextIndex);
  text = text.replace(/^\s*injectStyles\(\);\s*\n/gm, '');
  await write(file, text);
}

await stripStyleBlock('personal-dashboard.js', '\n  function injectStyles() {', '\n  function addRestoreAction() {');
await stripStyleBlock('audit-client.js', '\n  function injectStyles() {', '\n  function injectViews() {');
await stripStyleBlock('ux-client.js', '\n  function injectStyles() {', '\n  function settingsMarkup() {');
await stripStyleBlock('intake-client.js', '\n  function injectStyles() {', '\n  function ensureDatalist(');
await stripStyleBlock('scan-client.js', '\n  function injectStyles() {', '\n  function scannerMarkup() {');
await stripStyleBlock('printer-dashboard.js', '\n  function injectStyles() {', '\n  function markup() {');
await stripStyleBlock('user-isolation.js', '\n    const injectStyles = () => {', '\n    const injectSwitcher = () => {');

{
  let text = await read('personal-dashboard.js');
  text = text.replace(/^\s*ensureMobileMore\(\);\s*\n/gm, '');
  text = text.replace(/^\s*syncMoreState\(\);\s*\n/gm, '');
  await write('personal-dashboard.js', text);
}

{
  let html = await read('index.html');
  html = replaceOnce(html, '<script defer src="/bulk-actions-client.js"></script>\n<script defer src="/app.js"></script>', '<script defer src="/bulk-actions-client.js"></script>\n<script defer src="/ui-v10-client.js"></script>\n<script defer src="/app.js"></script>', 'index ui-v10 load');
  await write('index.html', html);
}

{
  let assets = await read('scripts/public-assets.mjs');
  assets = replaceOnce(assets, "  'bulk-actions-client.js',\n  'sw.js',", "  'bulk-actions-client.js',\n  'ui-v10-client.js',\n  'sw.js',", 'public asset manifest');
  await write('scripts/public-assets.mjs', assets);
}

{
  let sw = await read('sw.js');
  sw = sw.replace("const CACHE = 'filament-inventory-v25';", "const CACHE = 'filament-inventory-v26';");
  sw = replaceOnce(sw, "'/bulk-actions-client.js', '/app.js'", "'/bulk-actions-client.js', '/ui-v10-client.js', '/app.js'", 'service worker ui-v10 asset');
  await write('sw.js', sw);
}

{
  let version = await read('app-version.js');
  version = version.replace("const APP_VERSION = '9.9.0';", "const APP_VERSION = '10.0.0';");
  await write('app-version.js', version);
}

{
  const pkg = JSON.parse(await read('package.json'));
  pkg.version = '10.0.0';
  pkg.description = 'Local-first private filament inventory PWA with streamlined mobile UX, smart intake, QR workflows, contextual and bulk spool operations, Printer/AMS command center, secure sync, labels, and per-user customization.';
  await write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
  const lock = JSON.parse(await read('package-lock.json'));
  lock.version = '10.0.0';
  lock.packages[''].version = '10.0.0';
  await write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

{
  let netlify = await read('netlify.toml');
  netlify = replaceOnce(netlify, '[[headers]]\n  for = "/styles.css"', '[[headers]]\n  for = "/ui-v10-client.js"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"\n\n[[headers]]\n  for = "/styles.css"', 'Netlify ui-v10 header');
  await write('netlify.toml', netlify);
}

{
  let ci = await read('.github/workflows/ci.yml');
  ci = replaceOnce(ci, '          test -f dist/bulk-actions-client.js\n          test -f dist/app.js', '          test -f dist/bulk-actions-client.js\n          test -f dist/ui-v10-client.js\n          test -f dist/app.js', 'CI ui-v10 artifact');
  await write('.github/workflows/ci.yml', ci);
}

const cssBlock = `

/* ============================================================
   V10 PRODUCT UI
   Major information-architecture and mobile-app composition pass.
   Presentation belongs here; runtime JS only orchestrates behavior.
   ============================================================ */

html.fi-ui.fi-v10 {
  --v10-nav-height: 74px;
  --v10-text-xs: 11px;
  --v10-text-sm: 12px;
  --v10-text-md: 14px;
  --v10-section-gap: clamp(18px, 2vw, 28px);
}
html.fi-ui.fi-v10 body { padding-bottom: 0; }
html.fi-ui.fi-v10 #userBoundary { display: none !important; }
html.fi-ui.fi-v10 .mobile-add { display: none !important; }
html.fi-ui.fi-v10 .mobile-more-tab,
html.fi-ui.fi-v10 .mobile-more-menu { display: none !important; }

html.fi-ui.fi-v10 .topbar-inner { gap: 12px; }
html.fi-ui.fi-v10 .top-actions { margin-left: auto; gap: 8px; }
html.fi-ui.fi-v10 .profile-chip { display:inline-grid;grid-template-columns:auto auto auto;align-items:center;gap:8px;min-height:44px;padding:5px 10px 5px 6px;border:1px solid var(--hairline);border-radius:var(--r-pill);background:var(--surface-soft);color:var(--text);text-align:left; }
html.fi-ui.fi-v10 .profile-avatar { display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--ux-accent,var(--cyan)),var(--ux-accent2,var(--blue)));color:#06111d;font-size:11px;font-weight:900; }
html.fi-ui.fi-v10 .profile-chip-copy { display:grid;gap:1px; }
html.fi-ui.fi-v10 .profile-chip-copy strong { font-size:12px;line-height:1.1; }
html.fi-ui.fi-v10 .profile-chip-copy small { color:var(--muted);font-size:11px;line-height:1.1; }
html.fi-ui.fi-v10 .header-scan-launch { min-height:44px;padding-inline:12px; }
html.fi-ui.fi-v10 .profile-switch-dialog { width:min(92vw,430px);padding:0; }
html.fi-ui.fi-v10 .profile-privacy-note { margin:0 0 14px;color:var(--muted);font-size:13px;line-height:1.5; }
html.fi-ui.fi-v10 .profile-options { display:grid;gap:8px; }
html.fi-ui.fi-v10 .profile-option { display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:11px;align-items:center;min-height:64px;padding:10px 12px;border:1px solid var(--hairline);border-radius:var(--r-md);background:var(--surface-soft);color:var(--text);text-align:left; }
html.fi-ui.fi-v10 .profile-option[aria-current="true"] { border-color:var(--accent-border);background:var(--accent-soft); }
html.fi-ui.fi-v10 .profile-option strong,html.fi-ui.fi-v10 .profile-option small { display:block; }
html.fi-ui.fi-v10 .profile-option strong { font-size:14px; }
html.fi-ui.fi-v10 .profile-option small { margin-top:2px;color:var(--muted);font-size:11px; }

html.fi-ui.fi-v10 #dashboardView .hero { gap:0;padding:8px 0 20px;border-bottom:1px solid var(--hairline); }
html.fi-ui.fi-v10 #dashboardView .hero-card { border:0;border-radius:0;background:transparent;box-shadow:none; }
html.fi-ui.fi-v10 #dashboardView .hero-copy { padding:10px clamp(4px,2vw,18px) 10px 0; }
html.fi-ui.fi-v10 #dashboardView .hero-copy::after { display:none; }
html.fi-ui.fi-v10 #dashboardView .hero h2 { margin:4px 0 6px;font-size:clamp(26px,3.2vw,38px);line-height:1.04; }
html.fi-ui.fi-v10 #dashboardView .hero .lead { max-width:720px;font-size:14px;line-height:1.5; }
html.fi-ui.fi-v10 #dashboardView .quick-panel { padding:10px 0 10px 18px;border-left:1px solid var(--hairline); }
html.fi-ui.fi-v10 #dashboardView .metrics { display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0;margin:0;padding:14px 0;border-bottom:1px solid var(--hairline); }
html.fi-ui.fi-v10 #dashboardView .metric { min-height:70px;padding:8px 14px;border:0;border-right:1px solid var(--hairline);border-radius:0;background:transparent;box-shadow:none; }
html.fi-ui.fi-v10 #dashboardView .metric:last-child { border-right:0; }
html.fi-ui.fi-v10 #dashboardView .metric::after { display:none; }
html.fi-ui.fi-v10 .metric-label { font-size:11px !important;letter-spacing:.04em; }
html.fi-ui.fi-v10 .metric-sub { font-size:11px !important; }
html.fi-ui.fi-v10 #dashboardView > .grid-2 { gap:var(--v10-section-gap);margin-top:var(--v10-section-gap); }
html.fi-ui.fi-v10 #dashboardView > .grid-2 > .panel,
html.fi-ui.fi-v10 #dashboardView .audit-dashboard { padding:16px 0 0;border:0;border-top:1px solid var(--hairline);border-radius:0;background:transparent;box-shadow:none; }

html.fi-ui.fi-v10 .inventory-command { margin-bottom:12px;padding:12px 0;border:0;border-bottom:1px solid var(--hairline);border-radius:0;background:transparent;box-shadow:none; }
html.fi-ui.fi-v10 .inventory-command-copy > span:last-child,
html.fi-ui.fi-v10 .inventory-command-hint { font-size:11px; }
html.fi-ui.fi-v10 .inventory-command-mode,
html.fi-ui.fi-v10 .inventory-filter-token { font-size:12px; }
html.fi-ui.fi-v10 .inventory-compact-controls { display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:stretch;margin:0 0 14px; }
html.fi-ui.fi-v10 .inventory-search-slot .search-wrap,
html.fi-ui.fi-v10 .inventory-search-slot .field { width:100%;height:100%; }
html.fi-ui.fi-v10 .inventory-filter-open { min-width:104px;display:inline-flex;align-items:center;justify-content:center;gap:8px; }
html.fi-ui.fi-v10 .inventory-filter-open strong { display:grid;place-items:center;min-width:22px;height:22px;padding-inline:5px;border-radius:var(--r-pill);background:rgba(255,255,255,.07);font-size:11px; }
html.fi-ui.fi-v10 .inventory-filter-open.has-filters { border-color:var(--accent-border);background:var(--accent-soft); }
html.fi-ui.fi-v10 .inventory-filter-dialog { width:min(94vw,660px);padding:0; }
html.fi-ui.fi-v10 #inventoryFilterDialog .toolbar-v3 { display:grid !important;grid-template-columns:1fr 1fr;gap:10px;margin:0; }
html.fi-ui.fi-v10 #inventoryFilterDialog .toolbar-v3 .search-wrap,
html.fi-ui.fi-v10 #inventoryFilterDialog #clearFiltersBtn { display:none; }

html.fi-ui.fi-v10 .inventory-grid { gap:12px; }
html.fi-ui.fi-v10 .spool-card { border-radius:var(--r-lg);box-shadow:none; }
html.fi-ui.fi-v10 .spool-head { padding:14px 14px 10px; }
html.fi-ui.fi-v10 .spool-body { padding:0 14px 12px; }
html.fi-ui.fi-v10 .spool-title h4 { font-size:15px; }
html.fi-ui.fi-v10 .spool-title p { margin-top:2px;font-size:12px; }
html.fi-ui.fi-v10 .fill-top strong { font-size:25px; }
html.fi-ui.fi-v10 .fill-top small { font-size:11px;line-height:1.35; }
html.fi-ui.fi-v10 .spool-card .meta { display:block;margin-top:10px; }
html.fi-ui.fi-v10 .spool-card .meta > div:not(:nth-child(2)) { display:none !important; }
html.fi-ui.fi-v10 .spool-card .meta > div:nth-child(2) { display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0 0;border:0;background:transparent; }
html.fi-ui.fi-v10 .spool-card .meta > div:nth-child(2) span,
html.fi-ui.fi-v10 .spool-card .meta > div:nth-child(2) strong { font-size:11px; }
html.fi-ui.fi-v10 .card-actions { padding:0 14px 14px; }
html.fi-ui.fi-v10 .card-actions .btn { min-height:38px; }
html.fi-ui.fi-v10 .confidence { font-size:11px; }

html.fi-ui.fi-v10 .v10-form-root { display:block; }
html.fi-ui.fi-v10 .spool-form-section { display:grid;gap:12px; }
html.fi-ui.fi-v10 .spool-form-section-head { display:grid;gap:2px;margin-bottom:2px; }
html.fi-ui.fi-v10 .spool-form-section-head strong { font-size:15px; }
html.fi-ui.fi-v10 .v10-essential-grid,
html.fi-ui.fi-v10 .v10-advanced-grid { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
html.fi-ui.fi-v10 .spool-form-advanced { margin-top:16px;padding-top:14px;border-top:1px solid var(--hairline); }
html.fi-ui.fi-v10 .spool-form-advanced > summary { display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;cursor:pointer;list-style:none;color:var(--text); }
html.fi-ui.fi-v10 .spool-form-advanced > summary::-webkit-details-marker { display:none; }
html.fi-ui.fi-v10 .spool-form-advanced > summary span:first-child { display:grid;gap:2px; }
html.fi-ui.fi-v10 .spool-form-advanced > summary strong { font-size:14px; }
html.fi-ui.fi-v10 .spool-form-advanced > summary small { color:var(--muted);font-size:11px; }
html.fi-ui.fi-v10 .spool-form-advanced[open] > summary { margin-bottom:12px; }
html.fi-ui.fi-v10 .form-field > label { font-size:12px; }
html.fi-ui.fi-v10 .intake-banner p,
html.fi-ui.fi-v10 .intake-owner,
html.fi-ui.fi-v10 .intake-step,
html.fi-ui.fi-v10 .intake-chip,
html.fi-ui.fi-v10 .intake-tare-hint { font-size:11px !important; }

html.fi-ui.fi-v10 .activity-switcher-v10 { display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--hairline); }
html.fi-ui.fi-v10 .activity-switcher-v10 h2 { margin:3px 0 2px;font-size:26px;letter-spacing:-.035em; }
html.fi-ui.fi-v10 .activity-switcher-v10 p { margin:0;color:var(--muted);font-size:12px; }
html.fi-ui.fi-v10 .activity-segments { display:inline-grid;grid-template-columns:1fr 1fr;padding:4px;border:1px solid var(--hairline);border-radius:var(--r-md);background:var(--surface-soft); }
html.fi-ui.fi-v10 .activity-segments button { min-height:38px;padding:6px 12px;border:0;border-radius:var(--r-sm);background:transparent;color:var(--muted);font-weight:800;font-size:12px; }
html.fi-ui.fi-v10 .activity-segments button[aria-pressed="true"] { background:var(--accent-soft);color:var(--text); }
html.fi-ui.fi-v10 .audit-toolbar { display:grid;grid-template-columns:minmax(220px,1fr) 190px auto;gap:10px;margin:14px 0; }
html.fi-ui.fi-v10 .audit-metrics { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px; }
html.fi-ui.fi-v10 .audit-metric,
html.fi-ui.fi-v10 .audit-row,
html.fi-ui.fi-v10 .audit-dashboard-row { border:1px solid var(--hairline);background:var(--surface-soft); }
html.fi-ui.fi-v10 .audit-metric { padding:10px 12px;border-radius:var(--r-md); }
html.fi-ui.fi-v10 .audit-metric span,
html.fi-ui.fi-v10 .audit-meta,
html.fi-ui.fi-v10 .audit-changes,
html.fi-ui.fi-v10 .audit-dashboard-row span { font-size:11px; }
html.fi-ui.fi-v10 .audit-list { display:grid;gap:8px; }
html.fi-ui.fi-v10 .audit-row { display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:11px;padding:11px 12px;border-radius:var(--r-md); }
html.fi-ui.fi-v10 .audit-dot { width:9px;height:9px;margin-top:5px;border-radius:50%;background:var(--ux-accent,var(--cyan)); }

html.fi-ui.fi-v10 .data-actions { display:grid;gap:18px; }
html.fi-ui.fi-v10 .data-group-v10 { display:grid;gap:10px; }
html.fi-ui.fi-v10 .data-group-head { display:grid;gap:2px;padding-top:14px;border-top:1px solid var(--hairline); }
html.fi-ui.fi-v10 .data-group-head h4 { margin:0;font-size:16px; }
html.fi-ui.fi-v10 .data-group-head p { margin:0;color:var(--muted);font-size:12px;line-height:1.45; }
html.fi-ui.fi-v10 .data-group-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px; }
html.fi-ui.fi-v10 .data-group-featured .data-group-grid { grid-template-columns:1fr; }
html.fi-ui.fi-v10 .data-group-featured .data-box { border-color:var(--accent-border);background:var(--accent-soft); }
html.fi-ui.fi-v10 .data-group-danger { margin-top:8px; }
html.fi-ui.fi-v10 .data-group-danger .data-group-head { border-top-color:rgba(239,68,68,.34); }
html.fi-ui.fi-v10 .data-group-danger .data-box { border-color:rgba(239,68,68,.30); }
html.fi-ui.fi-v10 .data-box p { font-size:12px;line-height:1.5; }

html.fi-ui.fi-v10 .mobile-bottom-nav { display:none; }
html.fi-ui.fi-v10 .mobile-more-sheet-v10 { width:min(94vw,520px);padding:0; }
html.fi-ui.fi-v10 .mobile-more-grid-v10 { display:grid;grid-template-columns:1fr 1fr;gap:8px; }
html.fi-ui.fi-v10 .mobile-more-action-v10 { min-height:62px;padding:10px 12px;border:1px solid var(--hairline);border-radius:var(--r-md);background:var(--surface-soft);color:var(--text);text-align:left; }
html.fi-ui.fi-v10 .mobile-more-action-v10 strong,
html.fi-ui.fi-v10 .mobile-more-action-v10 span { display:block; }
html.fi-ui.fi-v10 .mobile-more-action-v10 strong { font-size:13px; }
html.fi-ui.fi-v10 .mobile-more-action-v10 span { margin-top:2px;color:var(--muted);font-size:11px; }
html.fi-ui.fi-v10 :where(.muted,.panel-head p,.quick-item small,.printer-slot-label,.printer-slot-main span,.printer-candidate span,.printer-attention-row span,.qr-reticle:after,.qr-private-note,.ux-note) { font-size:11px; }
html.fi-ui.fi-v10 :where(.btn,.tab,.field,.select,textarea) { font-size:max(12px,.78rem); }

@media (max-width:900px) {
  html.fi-ui.fi-v10 #dashboardView .hero { grid-template-columns:1fr; }
  html.fi-ui.fi-v10 #dashboardView .quick-panel { padding:12px 0 0;border-left:0;border-top:1px solid var(--hairline); }
  html.fi-ui.fi-v10 #dashboardView .metrics { grid-template-columns:repeat(3,minmax(0,1fr)); }
  html.fi-ui.fi-v10 #dashboardView .metric:nth-child(3) { border-right:0; }
  html.fi-ui.fi-v10 #dashboardView .metric:nth-child(n+4) { border-top:1px solid var(--hairline); }
  html.fi-ui.fi-v10 .data-group-grid { grid-template-columns:1fr; }
}

@media (max-width:720px) {
  html.fi-ui.fi-v10 body { padding-bottom:calc(var(--v10-nav-height) + env(safe-area-inset-bottom) + 12px); }
  html.fi-ui.fi-v10 .tabs { display:none !important; }
  html.fi-ui.fi-v10 .topbar { padding-block:8px; }
  html.fi-ui.fi-v10 .topbar-inner { gap:8px; }
  html.fi-ui.fi-v10 .mark { width:36px;height:36px; }
  html.fi-ui.fi-v10 .brand h1 { font-size:17px; }
  html.fi-ui.fi-v10 .brand p { max-width:42vw;font-size:11px; }
  html.fi-ui.fi-v10 .profile-chip { min-height:40px;padding:4px 8px 4px 4px; }
  html.fi-ui.fi-v10 .profile-avatar { width:30px;height:30px; }
  html.fi-ui.fi-v10 .profile-chip-copy small { display:none; }
  html.fi-ui.fi-v10 .header-scan-launch { min-width:40px;min-height:40px;padding:8px;font-size:0; }
  html.fi-ui.fi-v10 .header-scan-launch::before { content:'⌗';font-size:18px; }
  html.fi-ui.fi-v10 .mobile-bottom-nav { position:fixed;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom));z-index:950;display:grid;grid-template-columns:repeat(5,1fr);gap:3px;min-height:var(--v10-nav-height);padding:6px;border:1px solid var(--hairline);border-radius:20px;background:rgba(5,12,21,.94);box-shadow:0 18px 50px rgba(0,0,0,.38);-webkit-backdrop-filter:blur(20px) saturate(1.2);backdrop-filter:blur(20px) saturate(1.2); }
  html.fi-ui.fi-v10 .mobile-bottom-nav button { display:grid;place-items:center;align-content:center;gap:3px;min-width:0;min-height:54px;padding:5px 2px;border:0;border-radius:14px;background:transparent;color:var(--muted); }
  html.fi-ui.fi-v10 .mobile-bottom-nav button > span { font-size:19px;line-height:1; }
  html.fi-ui.fi-v10 .mobile-bottom-nav button > small { font-size:11px;font-weight:800; }
  html.fi-ui.fi-v10 .mobile-bottom-nav button[aria-current="page"] { color:var(--text);background:var(--accent-soft); }
  html.fi-ui.fi-v10 .mobile-bottom-nav .mobile-bottom-add { color:#06111d;background:linear-gradient(135deg,var(--ux-accent,var(--cyan)),var(--ux-accent2,var(--blue))); }
  html.fi-ui.fi-v10 .mobile-bottom-nav .mobile-bottom-add > span { font-size:23px; }
  html.fi-ui.fi-v10 #dashboardView .hero { padding-top:2px; }
  html.fi-ui.fi-v10 #dashboardView .hero-copy { padding-right:0; }
  html.fi-ui.fi-v10 #dashboardView .hero h2 { font-size:25px; }
  html.fi-ui.fi-v10 #dashboardView .hero .lead { font-size:13px; }
  html.fi-ui.fi-v10 #dashboardView .metrics { grid-template-columns:repeat(2,minmax(0,1fr)); }
  html.fi-ui.fi-v10 #dashboardView .metric { border-right:1px solid var(--hairline);border-top:1px solid var(--hairline); }
  html.fi-ui.fi-v10 #dashboardView .metric:nth-child(even) { border-right:0; }
  html.fi-ui.fi-v10 #dashboardView .metric:first-child,
  html.fi-ui.fi-v10 #dashboardView .metric:nth-child(2) { border-top:0; }
  html.fi-ui.fi-v10 #dashboardView .metric:last-child { grid-column:1/-1;border-right:0; }
  html.fi-ui.fi-v10 .inventory-command-shortcut { display:none; }
  html.fi-ui.fi-v10 .inventory-command-head { align-items:flex-start; }
  html.fi-ui.fi-v10 .inventory-command-modes { overflow-x:auto;flex-wrap:nowrap;padding-bottom:3px; }
  html.fi-ui.fi-v10 .inventory-command-mode { flex:0 0 auto; }
  html.fi-ui.fi-v10 .inventory-compact-controls { grid-template-columns:minmax(0,1fr) 92px; }
  html.fi-ui.fi-v10 .inventory-filter-dialog,
  html.fi-ui.fi-v10 .profile-switch-dialog,
  html.fi-ui.fi-v10 .mobile-more-sheet-v10 { width:100%;max-width:none;max-height:calc(92dvh - env(safe-area-inset-top));margin:auto 0 0;border-radius:20px 20px 0 0;border-left:0;border-right:0;border-bottom:0; }
  html.fi-ui.fi-v10 #inventoryFilterDialog .toolbar-v3 { grid-template-columns:1fr; }
  html.fi-ui.fi-v10 .v10-essential-grid,
  html.fi-ui.fi-v10 .v10-advanced-grid { grid-template-columns:1fr; }
  html.fi-ui.fi-v10 .activity-switcher-v10 { align-items:stretch;flex-direction:column; }
  html.fi-ui.fi-v10 .activity-segments { width:100%; }
  html.fi-ui.fi-v10 .audit-toolbar { grid-template-columns:1fr; }
  html.fi-ui.fi-v10 .audit-metrics { grid-template-columns:1fr 1fr; }
  html.fi-ui.fi-v10 .audit-row { grid-template-columns:9px 1fr; }
  html.fi-ui.fi-v10 .audit-row > .btn { grid-column:2; }
}
@media (max-width:430px) {
  html.fi-ui.fi-v10 .brand p { display:none; }
  html.fi-ui.fi-v10 .profile-chip-copy strong { font-size:11px; }
  html.fi-ui.fi-v10 .inventory-compact-controls { grid-template-columns:1fr auto; }
  html.fi-ui.fi-v10 .inventory-filter-open { min-width:86px;padding-inline:9px; }
  html.fi-ui.fi-v10 .mobile-more-grid-v10 { grid-template-columns:1fr; }
}
`;

{
  let css = await read('ui-system.css');
  if (!css.includes('V10 PRODUCT UI')) css += cssBlock;
  await write('ui-system.css', css);
}

{
  const files = await readdir(path.join(root, 'tests'));
  for (const name of files.filter(name => name.endsWith('.test.mjs'))) {
    const file = path.join('tests', name);
    let text = await read(file);
    text = text.replaceAll('filament-inventory-v25', 'filament-inventory-v26');
    text = text.replaceAll("'9.9.0'", "'10.0.0'");
    text = text.replaceAll('9\\.9\\.0', '10\\.0\\.0');
    text = text.replaceAll('v9.9 remains', 'v10 remains');
    text = text.replaceAll('v9.9', 'v10');
    await write(file, text);
  }
}

console.log('Applied v10 UI/UX integration.');
