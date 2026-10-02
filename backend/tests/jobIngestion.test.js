import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestJobs } from '../services/jobIngestion.js';

test('normalises, accepts and deduplicates jobs', () => {
  const raw = [
    { id:'1', company_id:'acme', title:'Software Engineer', job_location:'London', ats:'greenhouse' },
    { job_id:'1', company_id:'acme', title:'Software Engineer', job_location:'London', ats:'greenhouse' },
    { id:'2', company_id:'acme', title:'Frontend Engineer', job_location:'London', ats:'greenhouse' }
  ];
  const result = ingestJobs(raw, { now:'2026-09-29T12:00:00.000Z' });
  assert.equal(result.jobs.length, 2);
  assert.equal(result.duplicatesRemoved, 1);
  assert.equal(result.added, 2);
  assert.equal(result.rejected.length, 0);
});

test('rejects jobs missing canonical identity fields', () => {
  const result = ingestJobs([{ id:'1', title:'Software Engineer' }]);
  assert.equal(result.jobs.length, 0);
  assert.equal(result.rejected[0].reason, 'missing_title_or_company');
});

test('updates existing jobs by fingerprint', () => {
  const existingJob = { id:'db-1', companyId:'acme', externalId:'1', title:'Software Engineer', location:'London' };
  const existing = new Map([['acme|1|london', existingJob]]);
  const result = ingestJobs([{ id:'1', company_id:'acme', title:'Software Engineer', job_location:'London' }], { existing });
  assert.equal(result.updated, 1);
  assert.equal(result.jobs[0].id, 'db-1');
});

test('extracts ATS metadata and canonical apply URL from nested source records', () => {
  const result = ingestJobs([{
    id: '47920ccd',
    company_id: 'confluent',
    title: 'Distributed Systems Software Engineer',
    job_location: 'Remote, United States',
    source: {
      ats: 'ashby',
      url: 'https://jobs.ashbyhq.com/confluent/47920ccd'
    }
  }]);

  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].source.ats, 'ashby');
  assert.equal(result.jobs[0].source.url, 'https://jobs.ashbyhq.com/confluent/47920ccd');
  assert.equal(result.jobs[0].applyUrl, 'https://jobs.ashbyhq.com/confluent/47920ccd');
});

test('prefers an explicit apply URL over the source posting URL', () => {
  const result = ingestJobs([{
    id: '1',
    company_id: 'acme',
    title: 'Software Engineer',
    source: {
      ats: 'greenhouse',
      url: 'https://boards.greenhouse.io/acme/jobs/1'
    },
    applyUrl: 'https://acme.com/apply/1'
  }]);

  assert.equal(result.jobs[0].source.ats, 'greenhouse');
  assert.equal(result.jobs[0].applyUrl, 'https://acme.com/apply/1');
});
