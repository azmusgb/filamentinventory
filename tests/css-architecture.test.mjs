import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('canonical CSS tokens expose compatibility aliases during migration', async () => {
  const css = await read('css/tokens.css');
  for (const token of [
    '--color-bg:', '--color-surface:', '--color-text:', '--color-accent:',
    '--space-4:', '--radius-md:', '--text-base:', '--shadow-card:', '--transition-base:'
  ]) assert.ok(css.includes(token), `missing canonical token ${token}`);

  for (const alias of ['--bg: var(--color-bg)', '--line: var(--color-border)', '--text: var(--color-text)', '--r: var(--radius-md)']) {
    assert.ok(css.includes(alias), `missing migration alias ${alias}`);
  }
});

test('foundation protects dialogs, viewport sizing, touch, reduced motion, print and long-list rendering', async () => {
  const css = await read('css/foundation.css');
  assert.match(css, /dialog:not\(\[open\]\)/);
  assert.match(css, /@supports \(height: 100dvh\)/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /content-visibility: auto/);
  assert.match(css, /contain-intrinsic-size/);
  assert.match(css, /@media print/);
});

test('new architecture files do not introduce important declarations', async () => {
  const [tokens, foundation] = await Promise.all([read('css/tokens.css'), read('css/foundation.css')]);
  assert.doesNotMatch(tokens, /!important/);
  // Print hiding is the sole migration exception because legacy feature layers load before this safeguard.
  const nonPrintFoundation = foundation.replace(/@media print[\s\S]*$/m, '');
  assert.doesNotMatch(nonPrintFoundation, /!important/);
});
