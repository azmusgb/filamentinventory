import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const events = require('../events.js');

test('event bus emits immutable detail and supports unsubscribe', () => {
  const seen = [];
  const stop = events.on('inventory:changed', event => seen.push(event));
  assert.equal(events.emit('inventory:changed', {spoolIds:['S014']}), 1);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].name, 'inventory:changed');
  assert.deepEqual(seen[0].detail.spoolIds, ['S014']);
  assert.equal(Object.isFrozen(seen[0].detail), true);
  stop();
  assert.equal(events.emit('inventory:changed', {spoolIds:['S015']}), 0);
});
