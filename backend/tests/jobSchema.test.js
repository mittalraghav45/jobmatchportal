import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseJob, deduplicateJobs, withLiveStatus } from '../jobSchema.js';

test('normalises common ATS job fields without inventing dates', () => {
  const job = normaliseJob({
    title: 'Frontend Engineer',
    company: 'Example Ltd',
    url: 'https://example.com/jobs/1',
    ats: 'Greenhouse'
  });

  assert.equal(job.title, 'Frontend Engineer');
  assert.equal(job.companyName, 'Example Ltd');
  assert.equal(job.ats, 'greenhouse');
  assert.equal(job.posting_date, null);
  assert.equal(job.closing_date, null);
});

test('invalid ATS values become unknown', () => {
  assert.equal(normaliseJob({ title: 'Engineer', ats: 'random-source' }).ats, 'unknown');
});

test('deduplicates by canonical URL', () => {
  const result = deduplicateJobs([
    { title: 'Engineer', url: 'https://example.com/jobs/1', ats: 'greenhouse' },
    { title: 'Engineer copy', url: 'https://example.com/jobs/1', ats: 'lever' }
  ]);
  assert.equal(result.length, 1);
});

test('closing date controls live status', () => {
  const now = Date.parse('2026-09-29T12:00:00Z');
  const closed = withLiveStatus(normaliseJob({ title: 'Engineer', closing_date: '2026-09-28T12:00:00Z' }), now);
  const open = withLiveStatus(normaliseJob({ title: 'Engineer', closing_date: '2026-10-01T12:00:00Z' }), now);

  assert.equal(closed.isLive, false);
  assert.equal(closed.liveStatus, 'closed');
  assert.equal(open.isLive, true);
  assert.equal(open.liveStatus, 'open');
});
