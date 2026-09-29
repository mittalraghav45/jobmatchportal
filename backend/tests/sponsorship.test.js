import assert from 'node:assert/strict';
import test from 'node:test';
import { normaliseSponsorshipRecord, sponsorshipDecision } from '../sponsorship.js';

test('verified sponsor is eligible and retains evidence', () => {
  const result = sponsorshipDecision({
    status: 'verified',
    organisationName: 'Example Ltd',
    source: 'verified register',
    checkedAt: '2026-09-29T10:00:00Z'
  });
  assert.equal(result.shouldBlock, false);
  assert.equal(result.sponsorship.confidence, 'verified');
  assert.equal(result.sponsorship.checkedAt, '2026-09-29T10:00:00.000Z');
});

test('verified non-sponsor blocks sponsorship-only recommendations', () => {
  const result = sponsorshipDecision({status: 'not-sponsor'});
  assert.equal(result.shouldBlock, true);
  assert.equal(result.status, 'not-sponsor');
});

test('unknown sponsorship never becomes a negative sponsor claim', () => {
  const result = sponsorshipDecision({organisationName: 'Unknown Ltd'});
  assert.equal(result.shouldBlock, false);
  assert.equal(result.status, 'unknown');
  assert.match(result.reason, /unverified/i);
});

test('invalid dates and statuses are normalised safely', () => {
  const result = normaliseSponsorshipRecord({status: 'something-else', checkedAt: 'not-a-date'});
  assert.equal(result.status, 'unknown');
  assert.equal(result.checkedAt, null);
  assert.equal(result.confidence, 'unknown');
});

console.log('PASS sponsorship tests');
