import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVerifiedLiveMatchFilter } from '../utils/matchFilters.js';

test('verified-live match filter excludes unverified and stale jobs', () => {
  const filter = buildVerifiedLiveMatchFilter();
  assert.deepEqual(filter.$and[0], { 'status.isLive': true });
  assert.deepEqual(filter.$and[1], { 'verification.status': 'live' });
  assert.equal(filter.companyId, undefined);
});

test('verified-live match filter can constrain sponsorship companies', () => {
  const filter = buildVerifiedLiveMatchFilter(['company-a', 'company-b']);
  assert.deepEqual(filter.companyId, { $in: ['company-a', 'company-b'] });
  assert.deepEqual(filter.$and[1], { 'verification.status': 'live' });
});
