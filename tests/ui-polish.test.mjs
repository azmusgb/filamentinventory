import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('polish stylesheet loads after the base stylesheet', async () => {
  const html = await read('index.html');
  const base = html.indexOf('/styles.css');
  const polish = html.indexOf('/ui-polish.css');
  assert.ok(base >= 0, 'base stylesheet must remain loaded');
  assert.ok(polish > base, 'polish stylesheet must load after the base stylesheet');
});

test('polish stylesheet covers primary and runtime-injected surfaces', async () => {
  const css = await read('ui-polish.css');
  for (const selector of [
    '.topbar',
    '.toolbar-v3',
    '.inventory-grid',
    '.spool-card',
    '.dialog-actions',
    'body .user-boundary',
    'body .personal-command',
    'body .v8-metrics',
    'body .ux-pref-grid',
    'html[data-ux-theme="light"] body .user-boundary',
  ]) assert.ok(css.includes(selector), `missing polish selector: ${selector}`);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /@media \(hover: none\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('polish stylesheet has balanced block braces', async () => {
  const css = await read('ui-polish.css');
  const opens = [...css].filter(char => char === '{').length;
  const closes = [...css].filter(char => char === '}').length;
  assert.equal(opens, closes);
  assert.ok(opens > 40, 'expected a substantial stylesheet, not a stub');
});

test('PWA and deploy contract publish the polish stylesheet', async () => {
  const [assets, sw, netlify, ci] = await Promise.all([
    read('scripts/public-assets.mjs'),
    read('sw.js'),
    read('netlify.toml'),
    read('.github/workflows/ci.yml'),
  ]);
  assert.match(assets, /'ui-polish\.css'/);
  assert.match(sw, /\/ui-polish\.css/);
  assert.match(netlify, /for = "\/ui-polish\.css"/);
  assert.match(ci, /dist\/ui-polish\.css/);
});
