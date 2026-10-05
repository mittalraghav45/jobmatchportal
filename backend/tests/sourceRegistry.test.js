import test from 'node:test';
import assert from 'node:assert/strict';
import { JobSourceAdapter } from '../discovery/sourceAdapter.js';
import { createJobDiscoveryRegistry, discoverJobs } from '../discovery/sourceRegistry.js';

test('discovers from explicitly enabled sources only', async () => {
  const alpha = new JobSourceAdapter('alpha', async () => [
    { title: 'Alpha Engineer', applyUrl: 'https://example.test/a' }
  ]);
  const beta = new JobSourceAdapter('beta', async () => [
    { title: 'Beta Engineer', applyUrl: 'https://example.test/b' }
  ]);

  const registry = createJobDiscoveryRegistry([alpha, beta]);
  const jobs = await discoverJobs({ registry, sources: ['alpha'] });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].source, 'alpha');
});

test('rejects unknown sources instead of silently skipping them', async () => {
  const registry = createJobDiscoveryRegistry([]);
  await assert.rejects(
    () => discoverJobs({ registry, sources: ['missing'] }),
    /Unknown job source: missing/
  );
});

test('supports discovering all registered sources when no filter is supplied', async () => {
  const alpha = new JobSourceAdapter('alpha', async () => [
    { title: 'Alpha Engineer', applyUrl: 'https://example.test/a' }
  ]);
  const beta = new JobSourceAdapter('beta', async () => [
    { title: 'Beta Engineer', applyUrl: 'https://example.test/b' }
  ]);

  const registry = createJobDiscoveryRegistry([alpha, beta]);
  const jobs = await discoverJobs({ registry });

  assert.deepEqual(jobs.map(job => job.source), ['alpha', 'beta']);
});
