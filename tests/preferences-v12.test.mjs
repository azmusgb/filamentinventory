import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('V12 preferences assets are bootstrapped, built and available offline', async () => {
  const [bridge, assets, sw] = await Promise.all([
    read('ui-v10-client.js'),
    read('scripts/public-assets.mjs'),
    read('sw.js'),
  ]);
  for (const source of [bridge, assets, sw]) {
    assert.match(source, /preferences-v12-client\.js/);
    assert.match(source, /css\/components\/preferences-v12\.css/);
  }
});

test('V12 preferences preserve one persistence form and progressively disclose operational defaults', async () => {
  const client = await read('preferences-v12-client.js');
  for (const contract of [
    'profileOperationalDefaults',
    'Operational defaults',
    'Workspace identity',
    'Appearance',
    'Start screen',
    'profileDensity',
    'profileDashboardDetail',
    'profileSectionPrinting',
  ]) assert.match(client, new RegExp(contract));
  assert.doesNotMatch(client, /localStorage\.setItem/);
  assert.doesNotMatch(client, /addEventListener\(['"]input['"]/);
  assert.doesNotMatch(client, /addEventListener\(['"]change['"]/);
});

test('V12 preferences stylesheet follows CSS guardrails', async () => {
  const css = await read('css/components/preferences-v12.css');
  assert.match(css, /\.profile-operational-defaults/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /!important/);
});
