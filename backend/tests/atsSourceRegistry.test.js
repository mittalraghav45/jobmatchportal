import test from 'node:test';
import assert from 'node:assert/strict';
import { createAtsDiscoveryRegistry, discoverAtsJobs } from '../discovery/atsSourceRegistry.js';

const originalAdapters = new Map();

function stubAdapter(name, jobs) {
  const adapter = (awaitImport => awaitImport);
  return adapter;
}

test('creates a registry from explicitly enabled supported ATS sources', () => {
  const registry = createAtsDiscoveryRegistry(['greenhouse', 'lever', 'ashby']);
  assert.deepEqual([...registry.keys()], ['greenhouse', 'lever', 'ashby']);
});

test('rejects unsupported ATS discovery sources', () => {
  assert.throws(
    () => createAtsDiscoveryRegistry(['not-a-real-source']),
    /Unsupported ATS discovery source: not-a-real-source/
  );
});

test('keeps NHS out of the default ATS discovery set', () => {
  const registry = createAtsDiscoveryRegistry();
  assert.equal(registry.has('nhs'), false);
  assert.deepEqual([...registry.keys()], ['greenhouse', 'lever', 'ashby']);
});
