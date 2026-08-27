import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('browser uses one authoritative UI system after base styles', async () => {
  const html = await read('index.html');
  const base = html.indexOf('/styles.css');
  const system = html.indexOf('/ui-system.css');
  assert.ok(base >= 0);
  assert.ok(system > base);
  assert.match(html, /<html class="fi-ui" lang="en">/);
  assert.doesNotMatch(html, /ui-polish\.css/);
  assert.doesNotMatch(html, /ui-hardening\.css/);
});

test('UI system has tokens, fallbacks, root-scoped runtime authority, and accessibility safeguards', async () => {
  const css = await read('ui-system.css');
  for (const required of [
    '--space-4:',
    '--r-md:',
    '--hairline:',
    '@supports (color: color-mix',
    'html.fi-ui .user-boundary',
    'html.fi-ui .intake-banner',
    'html.fi-ui .qr-scanner-body',
    'html.fi-ui .printer-command',
    'html.fi-ui .ux-pref-grid',
    'display: flex;',
    'flex-direction: column;',
    '@media (prefers-reduced-transparency: reduce)',
    '@media (prefers-reduced-motion: reduce)',
    '@media (prefers-contrast: more)',
    '@media (forced-colors: active)',
    '@media (max-width: 720px)',
    '@media (max-width: 480px)',
  ]) assert.ok(css.includes(required), `missing UI-system contract: ${required}`);
  assert.match(css, /-webkit-backdrop-filter:/);
  assert.match(css, /\.field:focus-visible/);
  assert.match(css, /--accent-border: rgba\(/, 'color-mix must have a non-color-mix fallback');
  const opens = [...css].filter(char => char === '{').length;
  const closes = [...css].filter(char => char === '}').length;
  assert.equal(opens, closes);
  assert.ok(opens > 150, 'expected a substantial consolidated UI system');
});

test('PWA/deploy contracts publish only the consolidated UI layer', async () => {
  const [assets, sw, netlify, ci] = await Promise.all([
    read('scripts/public-assets.mjs'),
    read('sw.js'),
    read('netlify.toml'),
    read('.github/workflows/ci.yml'),
  ]);
  assert.match(assets, /'ui-system\.css'/);
  assert.doesNotMatch(assets, /'ui-polish\.css'/);
  assert.doesNotMatch(assets, /'ui-hardening\.css'/);
  assert.match(sw, /\/ui-system\.css/);
  assert.doesNotMatch(sw, /\/ui-polish\.css/);
  assert.doesNotMatch(sw, /\/ui-hardening\.css/);
  assert.match(sw, /filament-inventory-v22/);
  assert.match(netlify, /for = "\/ui-system\.css"/);
  assert.match(ci, /dist\/ui-system\.css/);
  assert.doesNotMatch(ci, /dist\/ui-polish\.css/);
  assert.doesNotMatch(ci, /dist\/ui-hardening\.css/);
});

test('v9.6 remains a UI release without a schema bump', async () => {
  const version = await read('app-version.js');
  assert.match(version, /APP_VERSION = '9\.6\.0'/);
  assert.match(version, /DATA_SCHEMA_VERSION = 10/);
});
