import test from 'node:test';
import assert from 'node:assert/strict';
import { detectATS, normaliseCompanyConfig } from '../services/companyDiscovery.js';
import { ingestJobs } from '../services/jobIngestion.js';

const NOW = '2026-09-29T00:00:00.000Z';

test('detectATS identifies ATS from a careers URL', () => {
  assert.equal(detectATS('https://boards.greenhouse.io/example'), 'greenhouse');
  assert.equal(detectATS('https://example.myworkdayjobs.com/en-US/careers'), 'workday');
  assert.equal(detectATS('https://example.ashbyhq.com'), 'ashby');
  assert.equal(detectATS('https://example.com/careers'), null);
});

test('normaliseCompanyConfig keeps stable company identity and derives slug', () => {
  const result = normaliseCompanyConfig({
    company_id: 'Acme-Tech',
    company_name: 'Acme Tech',
    enabled: 'true',
    ats: 'auto',
    careers_url: 'https://acme.greenhouse.io/careers'
  });

  assert.equal(result.companyId, 'acme-tech');
  assert.equal(result.companyName, 'Acme Tech');
  assert.equal(result.ats, 'greenhouse');
  assert.equal(result.slug, 'Acme-Tech');
});

test('ingestJobs deduplicates records and preserves first-seen data', () => {
  const raw = [
    { id: '123', title: 'Software Engineer', companyId: 'acme', location: 'London', url: 'https://jobs.example/123', ats: 'greenhouse', posting_date: NOW },
    { id: '123', title: 'Software Engineer', companyId: 'acme', location: 'London', url: 'https://jobs.example/123', ats: 'greenhouse', posting_date: NOW }
  ];

  const first = ingestJobs(raw, { now: NOW });
  assert.equal(first.jobs.length, 1);
  assert.equal(first.duplicatesRemoved, 1);
  assert.equal(first.added, 1);
  assert.equal(first.updated, 0);
  assert.equal(first.jobs[0].dates.lastSeenAt, NOW);

  const later = '2026-09-30T00:00:00.000Z';
  const existing = new Map(first.jobs.map(job => [job.fingerprint || `${job.companyId}|${job.externalId}|${job.location}`, job]));
  const second = ingestJobs([raw[0]], { existing, now: later });
  assert.equal(second.added, 0);
  assert.equal(second.updated, 1);
  assert.equal(second.jobs[0].dates.lastSeenAt, later);
});

test('ingestJobs rejects records without a stable company identity', () => {
  const result = ingestJobs([{ id: '123', title: 'Software Engineer' }], { now: NOW });
  assert.equal(result.jobs.length, 0);
  assert.equal(result.rejected[0].reason, 'missing_title_or_company');
});
