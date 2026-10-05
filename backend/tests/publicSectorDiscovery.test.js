import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicSectorAdapter, PUBLIC_SECTOR_SOURCE_TYPES } from '../discovery/publicSector.js';
import { createDiscoveryRegistry, discoverFromSources } from '../discovery/sourceAdapter.js';

test('normalizes public-sector jobs into the canonical discovery shape', async () => {
  const adapter = createPublicSectorAdapter(async () => [{
    id: 'nhs-123',
    title: 'Software Developer',
    organisation: 'Example NHS Trust',
    location: 'Manchester, UK',
    description: 'JavaScript React TypeScript',
    url: 'https://example.gov.uk/jobs/nhs-123',
    postedAt: '2026-10-01'
  }]);

  const jobs = await adapter.discover({ location: 'UK' });

  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0], {
    title: 'Software Developer',
    companyName: 'Example NHS Trust',
    location: 'Manchester, UK',
    description: 'JavaScript React TypeScript',
    applyUrl: 'https://example.gov.uk/jobs/nhs-123',
    source: 'public_sector',
    sourceKind: 'public_sector',
    sourceJobId: 'nhs-123',
    employmentType: null,
    workMode: null,
    postedAt: '2026-10-01',
    metadata: {}
  });
});

test('rejects discovered jobs without a title or application URL', async () => {
  const adapter = createPublicSectorAdapter(async () => [{ title: 'Missing URL' }]);
  await assert.rejects(() => adapter.discover(), /requires title and applyUrl/);
});

test('discovers selected sources through a common registry', async () => {
  const publicSector = createPublicSectorAdapter(async () => [{
    title: 'Council Software Engineer',
    applyUrl: 'https://example.gov.uk/job/1'
  }]);
  const registry = createDiscoveryRegistry([publicSector]);

  const jobs = await discoverFromSources(registry, ['public_sector']);
  assert.equal(jobs[0].source, 'public_sector');
  assert.equal(jobs[0].sourceKind, 'public_sector');
});

test('exposes the supported public-sector source categories', () => {
  assert.deepEqual(PUBLIC_SECTOR_SOURCE_TYPES, [
    'council',
    'university',
    'nhs',
    'civil_service',
    'other_public_body'
  ]);
});
