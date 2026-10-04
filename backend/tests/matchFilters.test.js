import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVerifiedLiveMatchFilter } from '../utils/matchFilters.js';

test('verified-live match filter only includes frontend-ready UK technology jobs', () => {
  const filter = buildVerifiedLiveMatchFilter();
  assert.deepEqual(filter.$and[0], { 'status.isLive': true });
  assert.deepEqual(filter.$and[1], { 'verification.status': 'live' });
  assert.deepEqual(filter.$and[2], { applyUrl: { $type: 'string', $ne: '' } });
  assert.deepEqual(filter.$and[3], { 'processing.status': 'complete' });
  assert.ok(filter.$and[4].$or);
  assert.ok(filter.$and[5].$or);
  assert.equal(filter.companyId, undefined);
});

test('verified-live match filter can constrain sponsorship companies', () => {
  const filter = buildVerifiedLiveMatchFilter(['company-a', 'company-b']);
  assert.deepEqual(filter.companyId, { $in: ['company-a', 'company-b'] });
  assert.deepEqual(filter.$and[1], { 'verification.status': 'live' });
});
