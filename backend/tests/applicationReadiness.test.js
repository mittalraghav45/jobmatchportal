import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateApplicationReadiness } from '../utils/applicationReadiness.js';

test('ready job is immediately actionable', () => {
  const result = calculateApplicationReadiness({
    matchScore: 90,
    applicationPriority: { action: 'apply-now' },
    isLive: true,
    applyUrl: 'https://example.com/apply',
    verificationStatus: 'live',
    sponsorship: 'verified'
  });
  assert.equal(result.readiness, 'ready');
  assert.equal(result.action, 'apply-now');
  assert.deepEqual(result.blockers, []);
});

test('missing application URL blocks the job', () => {
  const result = calculateApplicationReadiness({ matchScore: 90, isLive: true, verificationStatus: 'live' });
  assert.equal(result.readiness, 'blocked');
  assert.ok(result.blockers.includes('No application URL'));
});

test('unknown sponsorship requires review', () => {
  const result = calculateApplicationReadiness({
    matchScore: 90,
    isLive: true,
    applyUrl: 'https://example.com/apply',
    verificationStatus: 'live',
    sponsorship: 'unknown'
  });
  assert.equal(result.readiness, 'review');
  assert.ok(result.warnings.includes('Sponsorship status is unknown'));
});

test('closed job is blocked', () => {
  const result = calculateApplicationReadiness({
    matchScore: 90,
    isLive: true,
    applyUrl: 'https://example.com/apply',
    verificationStatus: 'live',
    closingAt: '2020-01-01T00:00:00.000Z'
  });
  assert.equal(result.readiness, 'blocked');
  assert.ok(result.blockers.includes('Application deadline has passed'));
});
