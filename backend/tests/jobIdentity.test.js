import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseJob, jobFingerprint } from '../models/jobSchema.js';

test('uses canonical source URL as job identity across company records', () => {
  const a = normaliseJob({
    companyId: 'company-a',
    externalId: 'job-a',
    title: 'Software Engineer',
    source: { ats: 'greenhouse', url: 'https://job-boards.greenhouse.io/acme/jobs/123/' }
  });

  const b = normaliseJob({
    companyId: 'company-b',
    externalId: 'job-b',
    title: 'Software Engineer',
    source: { ats: 'greenhouse', url: 'https://job-boards.greenhouse.io/acme/jobs/123' }
  });

  assert.equal(jobFingerprint(a), jobFingerprint(b));
});

test('falls back to company and external identity when no URL exists', () => {
  const a = normaliseJob({ companyId: 'acme', externalId: '123', title: 'Engineer', location: 'London' });
  const b = normaliseJob({ companyId: 'acme', externalId: '123', title: 'Different title', location: 'Manchester' });

  assert.equal(jobFingerprint(a), jobFingerprint(b));
});

test('uses explicit apply URL when no source URL exists', () => {
  const job = normaliseJob({
    companyId: 'acme',
    title: 'Engineer',
    applyUrl: 'https://example.com/jobs/123#apply'
  });

  assert.equal(jobFingerprint(job), 'url|https-example-com-jobs-123');
});
