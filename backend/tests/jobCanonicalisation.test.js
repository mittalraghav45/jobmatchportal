import test from 'node:test';
import assert from 'node:assert/strict';

import { normaliseJob } from '../models/jobSchema.js';

test('normaliseJob extracts ATS from nested source objects', () => {
  const job = normaliseJob({
    id: 'legacy-1',
    companyId: '1',
    companyName: 'Example Ltd',
    title: 'Software Engineer',
    source: {
      ats: { name: 'greenhouse' },
      url: 'https://example.com/jobs/legacy-1'
    }
  });

  assert.equal(job.source.ats, 'greenhouse');
  assert.equal(job.source.url, 'https://example.com/jobs/legacy-1');
});

test('normaliseJob recovers application URL from nested ATS fields', () => {
  const job = normaliseJob({
    id: 'legacy-2',
    companyId: '2',
    companyName: 'Example Ltd',
    title: 'Frontend Engineer',
    source: {
      ats: { platform: 'ashby' },
      application: {
        applicationUrl: 'https://jobs.example.com/frontend-engineer'
      }
    }
  });

  assert.equal(job.source.ats, 'ashby');
  assert.equal(job.source.url, 'https://jobs.example.com/frontend-engineer');
});

test('normaliseJob preserves closing date and live status', () => {
  const liveJob = normaliseJob({
    id: 'live-1',
    companyId: '3',
    title: 'Software Engineer',
    closingAt: '2026-10-15T23:59:59.000Z',
    isLive: true
  });
  const closedJob = normaliseJob({
    id: 'closed-1',
    companyId: '3',
    title: 'Closed Engineer',
    closing_date: '2026-09-30T23:59:59.000Z',
    status: 'closed'
  });

  assert.equal(liveJob.dates.closingAt, '2026-10-15T23:59:59.000Z');
  assert.equal(liveJob.status.isLive, true);
  assert.equal(closedJob.dates.closingAt, '2026-09-30T23:59:59.000Z');
  assert.equal(closedJob.status.isLive, false);
});

test('normaliseJob never persists the stringified object marker as ATS', () => {
  const job = normaliseJob({
    id: 'legacy-3',
    companyId: '3',
    title: 'Software Developer',
    source: { ats: '[object Object]' }
  });

  assert.notEqual(job.source.ats, '[object Object]');
  assert.equal(job.source.ats, 'unknown');
});
