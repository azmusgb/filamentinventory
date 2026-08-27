import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('CSS hardening loads after the existing polish layer', async () => {
  const html = await read('index.html');
  const polish = html.indexOf('/ui-polish.css');
  const hardening = html.indexOf('/ui-hardening.css');
  assert.ok(polish >= 0);
  assert.ok(hardening > polish);
});

test('CSS hardening preserves keyboard focus and browser accessibility safeguards', async () => {
  const css = await read('ui-hardening.css');
  assert.match(css, /scroll-padding-top/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /-webkit-backdrop-filter/);
  assert.match(css, /\.field:focus-visible/);
  assert.match(css, /prefers-contrast:\s*more/);
  assert.match(css, /forced-colors:\s*active/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /-moz-osx-font-smoothing/);
  assert.doesNotMatch(css, /font-weight:\s*750/);
});

test('PWA and deploy contracts publish the hardening stylesheet', async () => {
  const [assets, sw, netlify, ci] = await Promise.all([
    read('scripts/public-assets.mjs'),
    read('sw.js'),
    read('netlify.toml'),
    read('.github/workflows/ci.yml'),
  ]);
  assert.match(assets, /'ui-hardening\.css'/);
  assert.match(sw, /\/ui-hardening\.css/);
  assert.match(sw, /filament-inventory-v21/);
  assert.match(netlify, /for = "\/ui-hardening\.css"/);
  assert.match(ci, /dist\/ui-hardening\.css/);
});
