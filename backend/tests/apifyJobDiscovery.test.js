import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApifyInput, normalizeApifyJob } from '../services/apifyJobDiscovery.js';

test('builds bounded Apify career-site input for technical roles', () => {
  const input = buildApifyInput({
    companyId: 'example',
    companyName: 'Example Council',
    careersUrl: 'https://example.gov.uk/careers'
  }, { maxItems: 10, includeDescription: false, includeSkills: false });

  assert.deepEqual(input.companies, ['https://example.gov.uk/careers']);
  assert.equal(input.maxJobsPerCompany, 10);
  assert.equal(input.startUrls[0].url, 'https://example.gov.uk/careers');
  assert.equal(input.startUrls[0].userData.companyId, 'example');
  assert.equal(input.respectRobotsTxtFile, true);
  assert.equal(typeof input.pageFunction, 'string');
});

test('normalizes Apify output into the canonical job shape and classifies UK metadata', () => {
  const job = normalizeApifyJob({
    jobId: '123',
    title: 'Software Engineer',
    location: 'Cardiff, Wales',
    description: 'Build web applications with TypeScript and React.',
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
