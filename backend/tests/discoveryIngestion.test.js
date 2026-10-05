import test from 'node:test';
import assert from 'node:assert/strict';
import { JobSourceAdapter } from '../discovery/sourceAdapter.js';
import { createJobDiscoveryRegistry } from '../discovery/sourceRegistry.js';
import { discoverAndIngestJobs } from '../services/discoveryIngestion.js';

test('feeds discovered jobs through canonical ingestion and deduplication', async () => {
  const greenhouse = new JobSourceAdapter('greenhouse', async () => [
    {
      id: 'gh-123',
      companyId: 'acme',
      companyName: 'Acme',
      title: 'Frontend Software Engineer',
      location: 'London, UK',
      applyUrl: 'https://example.test/jobs/gh-123'
    },
    {
      id: 'gh-123',
      companyId: 'acme',
      companyName: 'Acme',
      title: 'Frontend Software Engineer',
      location: 'London, UK',
      applyUrl: 'https://example.test/jobs/gh-123'
    }
  ]);

  const registry = createJobDiscoveryRegistry([greenhouse]);
  const result = await discoverAndIngestJobs({
    registry,
    sources: ['greenhouse'],
    now: '2026-10-05T12:00:00.000Z'
  });

  assert.equal(result.discoveredCount, 2);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.added, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.duplicatesRemoved, 1);
  assert.deepEqual(result.sourceCounts, { greenhouse: 2 });
  assert.equal(result.jobs[0].externalId, 'gh-123');
  assert.equal(result.jobs[0].companyId, 'acme');
});

test('does not activate unselected sources', async () => {
  let called = false;
  const greenhouse = new JobSourceAdapter('greenhouse', async () => [{
    id: 'gh-1', companyId: 'acme', companyName: 'Acme', title: 'Engineer',
    applyUrl: 'https://example.test/jobs/gh-1'
  }]);
  const nhs = new JobSourceAdapter('nhs', async () => {
    called = true;
    return [{ title: 'NHS Engineer', companyId: 'nhs', applyUrl: 'https://example.test/nhs/1' }];
  });

  const registry = createJobDiscoveryRegistry([greenhouse, nhs]);
  const result = await discoverAndIngestJobs({ registry, sources: ['greenhouse'] });

  assert.equal(result.jobs.length, 1);
  assert.equal(called, false);
});
