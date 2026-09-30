import test from 'node:test';
import assert from 'node:assert/strict';
import { detectATS, normaliseCompanyConfig } from '../services/companyDiscovery.js';
import { extractATSConfig, resolveATSConfig, isSupportedATS } from '../ats/detector.js';
import { getSupportedATS } from '../ats/registry.js';
import { ingestJobs } from '../services/jobIngestion.js';

const NOW = '2026-09-29T00:00:00.000Z';

test('detectATS identifies supported ATS from careers URLs', () => {
  assert.equal(detectATS('https://boards.greenhouse.io/example'), 'greenhouse');
  assert.equal(detectATS('https://jobs.lever.co/example'), 'lever');
  assert.equal(detectATS('https://jobs.ashbyhq.com/example'), 'ashby');
  assert.equal(detectATS('https://example.myworkdayjobs.com/en-US/careers'), 'workday');
  assert.equal(detectATS('https://careers.smartrecruiters.com/example'), 'smartrecruiters');
  assert.equal(detectATS('https://example.workable.com'), 'workable');
  assert.equal(detectATS('https://example.teamtailor.com/jobs'), 'teamtailor');
  assert.equal(detectATS('https://example.pinpointhq.com/en/postings'), 'pinpoint');
  assert.equal(detectATS('https://example.recruitee.com'), 'recruitee');
  assert.equal(detectATS('https://example.bamboohr.com/careers'), 'bamboohr');
  assert.equal(detectATS('https://www.jobs.nhs.uk/candidate/search'), 'nhs');
  assert.equal(detectATS('https://example.com/careers'), null);
});

test('custom is an explicit supported adapter for non-standard careers sites', () => {
  assert.equal(isSupportedATS('custom'), true);
  assert.equal(getSupportedATS().includes('custom'), true);
  const result = resolveATSConfig({ ats: 'custom', careersUrl: 'https://example.com/careers' });
  assert.equal(result.ats, 'custom');
  assert.equal(result.source, 'explicit');
});

test('extractATSConfig derives ATS and slug from common URL formats', () => {
  assert.deepEqual(extractATSConfig('https://boards.greenhouse.io/acme'), { ats: 'greenhouse', slug: 'acme' });
  assert.deepEqual(extractATSConfig('https://jobs.lever.co/acme'), { ats: 'lever', slug: 'acme' });
  assert.deepEqual(extractATSConfig('https://jobs.ashbyhq.com/acme'), { ats: 'ashby', slug: 'acme' });
  assert.deepEqual(extractATSConfig('https://acme.workable.com'), { ats: 'workable', slug: 'acme' });
  assert.deepEqual(extractATSConfig('https://acme.teamtailor.com/jobs'), { ats: 'teamtailor', slug: 'acme' });
  assert.deepEqual(extractATSConfig('https://tenant.wd3.myworkdayjobs.com/Careers'), { ats: 'workday', slug: 'tenant', site: 'Careers' });
});

test('explicit ATS and slug take precedence over URL detection', () => {
  const result = resolveATSConfig({ ats: 'greenhouse', atsSlug: 'custom-slug', careersUrl: 'https://example.lever.co' });
  assert.equal(result.ats, 'greenhouse');
  assert.equal(result.slug, 'custom-slug');
  assert.equal(result.source, 'explicit');
});

test('unsupported explicit ATS is rejected instead of silently falling back', () => {
  const result = resolveATSConfig({ ats: 'unknown-ats', careersUrl: 'https://boards.greenhouse.io/example' });
  assert.equal(result.ats, null);
  assert.equal(result.source, 'invalid-explicit-ats');
});

test('normaliseCompanyConfig resolves ATS and slug without changing company identity', () => {
  const result = normaliseCompanyConfig({
    company_id: 'Acme-Tech',
    company_name: 'Acme Tech',
    enabled: 'true',
    ats: 'auto',
    careers_url: 'https://boards.greenhouse.io/acme'
  });

  assert.equal(result.companyId, 'acme-tech');
  assert.equal(result.companyName, 'Acme Tech');
  assert.equal(result.ats, 'greenhouse');
  assert.equal(result.slug, 'acme');
  assert.equal(result.atsSource, 'url');
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
