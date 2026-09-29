import test from 'node:test';
import assert from 'node:assert/strict';
import { ATSAdapter, createATSRegistry } from '../ats/adapter.js';

test('adapter returns an array of jobs', async () => {
  const adapter = new ATSAdapter('example', async () => [{ id:'1' }]);
  assert.deepEqual(await adapter.discover({}), [{ id:'1' }]);
});

test('adapter normalises non-array discovery result to empty array', async () => {
  const adapter = new ATSAdapter('example', async () => null);
  assert.deepEqual(await adapter.discover({}), []);
});

test('registry indexes adapters by name', () => {
  const adapter = new ATSAdapter('greenhouse', async () => []);
  const registry = createATSRegistry([adapter]);
  assert.equal(registry.get('greenhouse'), adapter);
});
