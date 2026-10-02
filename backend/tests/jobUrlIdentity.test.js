import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestJobs } from '../services/jobIngestion.js';

test('uses the canonical URL as identity even when company IDs differ', () => {
  const url = 'https://job-boards.greenhouse.io/acme/jobs/12345';
  const result = ingestJobs([
    { company_id: 'acme', externalId: '12345', title: 'Software Engineer', source: { ats: 'greenhouse', url } },
    { company_id: 'legacy-acme', externalId: 'different-id', title: 'Software Engineer', source: { ats: 'greenhouse', url } }
  ]);

  assert.equal(result.jobs.length, 1);
  assert.equal(result.duplicatesRemoved, 1);
  assert.equal(result.jobs[0].applyUrl, url);
});
