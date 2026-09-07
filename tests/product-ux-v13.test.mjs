import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('v13 tokens use one calm semantic palette and touch-first control sizing', async () => {
  const css = await read('css/tokens.css');
  for (const contract of [
    '--color-accent: #69d4ff;',
    '--color-success: #66d6aa;',
    '--color-warning: #f2c76b;',
    '--color-danger: #ff9690;',
    '--control-md: 48px;',
    '--control-lg: 52px;',
    '--control-nav: 56px;',
    '--touch-min: 48px;',
  ]) assert.ok(css.includes(contract), `missing v13 token contract: ${contract}`);
  assert.match(css, /Color is semantic/);
  assert.match(css, /\[data-theme="light"\][\s\S]*--color-text-on-accent: #ffffff;/);
});

test('mobile primary navigation is the five product destinations', async () => {
  const js = await read('navigation-architecture.js');
  const navMatch = js.match(/nav\.innerHTML = `([\s\S]*?)`;/);
  assert.ok(navMatch, 'mobile bottom navigation markup missing');
  const nav = navMatch[1];
  for (const label of ['Home', 'Inventory', 'Printer', 'Assistant', 'Activity']) {
    assert.match(nav, new RegExp(`<small>${label}<\\/small>`), `missing primary destination: ${label}`);
  }
  assert.doesNotMatch(nav, /data-bottom-scan/);
  assert.doesNotMatch(nav, /data-bottom-more/);
  assert.match(nav, /data-shell-action="assistant"/);
});

test('physical actions and settings remain explicit without hidden gestures', async () => {
  const js = await read('navigation-architecture.js');
  assert.match(js, /label:'Add spool'/);
  assert.match(js, /label:'Scan spool'/);
  assert.match(js, /data-v12-more/);
  assert.match(js, /aria-label', 'Open tools and settings'/);
  assert.match(js, /label:'Print readiness'/);
  assert.doesNotMatch(js, /longpress|long-press|dblclick/i);
});

test('tools sheet preserves evidence and privacy language', async () => {
  const js = await read('navigation-architecture.js');
  for (const phrase of [
    'Create a spool in this private workspace',
    'Record measured quantity evidence',
    'Identity only — no mutable state',
    'Profile-scoped cloud state',
    'Personalize this private workspace',
  ]) assert.ok(js.includes(phrase), `missing source-of-truth copy: ${phrase}`);
});
