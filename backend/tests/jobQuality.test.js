import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJobQualityFields, calculateJobFreshness, calculateJobQualityScore } from '../services/jobQuality.js';

const NOW = new Date('2026-10-05T00:00:00.000Z');

test('marks a recently posted verified job as fresh', () => {
  const job = { verification: { status: 'live' }, source: { ats: 'greenhouse' }, dates: { postedAt: '2026-10-01' }, title: 'Software Engineer', companyName: 'Example', location: 'London', description: 'A'.repeat(200), applyUrl: 'https://example.com/apply', source: { ats: 'greenhouse', url: 'https://example.com/job/1' } };
  const result = buildJobQualityFields(job, NOW);
  assert.equal(result.freshness, 'fresh');
  assert.equal(result.sourceConfidence, 1);
  assert.equal(result.qualityScore, 100);
});

test('uses last seen when posted date is unavailable', () => {
  assert.equal(calculateJobFreshness({ dates: { lastSeenAt: '2026-09-20' } }, NOW), 'recent');
});

test('marks passed closing dates as expired', () => {
  const job = { verification: { status: 'live' }, dates: { closingAt: '2026-10-01' } };
  const result = calculateJobQualityScore(job, NOW);
  assert.equal(result.freshness, 'expired');
  assert.ok(result.score <= 20);
});

test('unknown verification is lower confidence than verified live', () => {
  const live = calculateJobQualityScore({ verification: { status: 'live' }, title: 'Engineer' }, NOW);
  const unknown = calculateJobQualityScore({ verification: { status: 'unknown' }, title: 'Engineer' }, NOW);
  assert.ok(live.score > unknown.score);
});
