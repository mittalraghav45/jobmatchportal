import assert from 'node:assert/strict';
import test from 'node:test';
import { normaliseSponsorRecord, evaluateSponsorship } from '../sponsorRegistry.js';

test('verified sponsor is eligible when current evidence is present', () => {
  const result = evaluateSponsorship({
    status: 'verified',
    organisationName: 'Example Ltd',
    source: 'home_office_register',
    checkedAt: '2026-09-29T10:00:00Z'
  });
  assert.equal(result.eligibleForFiltering, true);
  assert.equal(result.decision, 'verified');
  assert.equal(result.sponsor.confidence, 'verified');
  assert.equal(result.sponsor.checkedAt, '2026-09-29T10:00:00.000Z');
});

test('verified sponsor without current evidence remains unverified', () => {
  const result = evaluateSponsorship({ status: 'verified', organisationName: 'Example Ltd' });
  assert.equal(result.eligibleForFiltering, false);
  assert.equal(result.decision, 'unknown');
  assert.match(result.reason, /unverified/i);
});

test('verified non-sponsor blocks sponsorship-only recommendations', () => {
  const result = evaluateSponsorship({ status: 'not-sponsor', organisationName: 'Example Ltd' });
  assert.equal(result.eligibleForFiltering, true);
  assert.equal(result.decision, 'not-sponsor');
});

test('unknown sponsorship never becomes a negative sponsor claim', () => {
  const result = evaluateSponsorship({ organisationName: 'Unknown Ltd' });
  assert.equal(result.eligibleForFiltering, false);
  assert.equal(result.decision, 'unknown');
  assert.match(result.reason, /unverified/i);
});

test('expired sponsorship becomes unverified for current filtering', () => {
  const result = evaluateSponsorship({
    status: 'verified',
    organisationName: 'Example Ltd',
    checkedAt: '2026-01-01T10:00:00Z',
    expiresAt: '2026-01-02T10:00:00Z'
  });
  assert.equal(result.eligibleForFiltering, false);
  assert.equal(result.decision, 'unknown');
  assert.match(result.reason, /expired|unverified/i);
});

test('invalid dates and statuses are normalised safely', () => {
  const result = normaliseSponsorRecord({ status: 'something-else', checkedAt: 'not-a-date' });
  assert.equal(result.status, 'unknown');
  assert.equal(result.checkedAt, null);
  assert.equal(result.confidence, 'unknown');
});
