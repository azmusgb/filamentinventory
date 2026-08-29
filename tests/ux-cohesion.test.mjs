import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('cohesion release assets are part of the production shell and build', async () => {
  const [index, assets] = await Promise.all([read('index.html'), read('scripts/public-assets.mjs')]);
  assert.match(index, /css\/components\/ux-cohesion\.css/);
  assert.match(index, /ux-cohesion-client\.js/);
  assert.match(assets, /css\/components\/ux-cohesion\.css/);
  assert.match(assets, /ux-cohesion-client\.js/);
});

test('cohesion client implements the cross-page UX contracts', async () => {
  const client = await read('ux-cohesion-client.js');
  for (const contract of [
    'enhanceHome',
    'enhanceInventory',
    'enhanceSpoolForm',
    'enhanceWeigh',
    'enhanceActivity',
    'enhanceLabels',
    'enhancePrinter',
    'enhanceSync',
    'enhanceData',
    'enhancePreferences',
  ]) assert.match(client, new RegExp(`function ${contract}\\(`), `missing ${contract}`);
  assert.match(client, /Reset filters/);
  assert.match(client, /Preferences save automatically/);
  assert.match(client, /Save \$\{remaining\} remaining/);
  assert.match(client, /Weight evidence, storage, printer placement/);
});

test('cohesion stylesheet preserves shared presentation rules', async () => {
  const css = await read('css/components/ux-cohesion.css');
  for (const contract of [
    '.fi-cohesion-inline-action',
    '.fi-spool-details-action',
    '.weigh-optional',
    '.activity-insights',
    '.printer-details-disclosure',
    '.fi-label-output-control',
    'prefers-reduced-motion: reduce',
  ]) assert.ok(css.includes(contract), `missing cohesion CSS contract: ${contract}`);
  assert.doesNotMatch(css, /!important/);
});
