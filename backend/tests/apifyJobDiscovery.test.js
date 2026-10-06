import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApifyInput, buildApifyBatchInput, normalizeApifyJob } from '../services/apifyJobDiscovery.js';

test('builds input for the configured career-site Actor schema', () => {
  const input = buildApifyInput({
    companyId: 'example',
    companyName: 'Example Council',
    careersUrl: 'https://example.gov.uk/careers'
  }, { maxItems: 10, includeDescription: true });

  assert.deepEqual(input.careerSiteUrls, ['https://example.gov.uk/careers']);
  assert.equal(input.maxItems, 10);
  assert.equal(input.includeDescription, true);
  assert.ok(Array.isArray(input.searchTerms));
  assert.ok(input.searchTerms.includes('software engineer'));
});

test('builds one bounded batch request for multiple unresolved companies', () => {
  const input = buildApifyBatchInput([
    { companyId: 'a', companyName: 'A', careersUrl: 'https://a.example/careers' },
    { companyId: 'b', companyName: 'B', careersUrl: 'https://b.example/careers' }
  ], { maxItems: 10 });

  assert.deepEqual(input.careerSiteUrls, [
    'https://a.example/careers',
    'https://b.example/careers'
  ]);
  assert.equal(input.maxItems, 10);
});

test('normalizes Apify output into the canonical job shape and classifies UK metadata', () => {
  const job = normalizeApifyJob({
    jobId: '123',
    title: 'Software Engineer',
    location: 'Cardiff, Wales',
    descriptionSnippet: 'Build web applications with TypeScript and React.',
    jobUrl: 'https://jobs.example.com/123',
    applyUrl: 'https://jobs.example.com/123/apply',
    ats: 'workday',
    datePosted: '2026-10-01T10:00:00Z'
  }, {
    companyId: 'example',
    companyName: 'Example University',
    employerType: 'universities'
  });

  assert.equal(job.companyId, 'example');
  assert.equal(job.applyUrl, 'https://jobs.example.com/123/apply');
  assert.equal(job.source.ats, 'workday');
  assert.equal(job.nation, 'Wales');
  assert.equal(job.employerType, 'universities');
  assert.equal(job.externalId, '123');
});

test('rejects Apify rows without a usable job URL', () => {
  assert.equal(normalizeApifyJob({ title: 'Software Engineer' }, { companyId: 'x', companyName: 'X' }), null);
});
