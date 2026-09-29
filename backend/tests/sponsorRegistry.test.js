import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseSponsorRecord,
  evaluateSponsorship,
  canRecommendForSponsorship,
  mergeSponsorEvidence
} from '../sponsorRegistry.js';

test('normalises an invalid status to unknown', () => {
  const result = normaliseSponsorRecord({ name: 'Example Ltd', status: 'probably-sponsors' });
  assert.equal(result.status, 'unknown');
  assert.equal(result.confidence, 'unknown');
});

test('verified sponsorship requires a verification timestamp by default', () => {
  const result = evaluateSponsorship({ name: 'Example Ltd', status: 'verified' });
  assert.equal(result.decision, 'unknown');
  assert.equal(result.eligibleForFiltering, false);
});

test('current verified sponsorship is usable for filtering', () => {
  const result = evaluateSponsorship({
    name: 'Example Ltd',
    status: 'verified',
    source: 'home_office_register',
    checkedAt: '2026-09-29T12:00:00Z'
  });
  assert.equal(result.decision, 'verified');
  assert.equal(result.eligibleForFiltering, true);
});

test('expired evidence becomes unknown', () => {
  const result = evaluateSponsorship({
    name: 'Example Ltd',
    status: 'verified',
    checkedAt: '2025-01-01T00:00:00Z',
    expiresAt: '2025-02-01T00:00:00Z'
  });
  assert.equal(result.decision, 'unknown');
});

test('not-sponsor is the only status that blocks recommendation', () => {
  assert.equal(canRecommendForSponsorship({ status: 'not-sponsor', checkedAt: '2026-09-29T00:00:00Z' }), false);
  assert.equal(canRecommendForSponsorship({ status: 'unknown' }), true);
  assert.equal(canRecommendForSponsorship({ status: 'verified', checkedAt: '2026-09-29T00:00:00Z' }), true);
});

test('verified evidence wins when merging multiple records', () => {
  const result = mergeSponsorEvidence(
    { name: 'Example Ltd', status: 'unknown' },
    { name: 'Example Ltd', status: 'verified', source: 'home_office_register', checkedAt: '2026-09-29T00:00:00Z' }
  );
  assert.equal(result.status, 'verified');
});
