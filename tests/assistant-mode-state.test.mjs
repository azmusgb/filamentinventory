import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Assistant badge requires a profile-scoped verified response before model mode', async () => {
  const source = await read('llm-transport-client.js');
  assert.match(source, /verifiedForCurrentProfile/);
  assert.match(source, /lastSuccessProfile/);
  assert.match(source, /phase==='ready'/);
  assert.match(source, /mode='Cloud ready'/);
  assert.match(source, /phase==='model'/);
  assert.match(source, /mode='Grounded model'/);
  assert.match(source, /profile\(\)!==requestProfile/);
});

test('Assistant UI delegates badge state to the transport state machine', async () => {
  const source = await read('llm-client.js');
  assert.match(source, /transport\?\.presentation\?\.\(\)/);
  assert.match(source, /fi:llm-transport/);
  assert.doesNotMatch(source, /has\?'Grounded model':'Grounded local'/);
});
