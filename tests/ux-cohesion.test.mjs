import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('cohesion release assets are bootstrapped and included in the production build', async () => {
  const [bridge, assets] = await Promise.all([read('ui-v10-client.js'), read('scripts/public-assets.mjs')]);
  assert.match(bridge, /ensureCohesionAssets/);
  assert.match(bridge, /css\/components\/ux-cohesion\.css/);
  assert.match(bridge, /ux-cohesion-client\.js/);
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
