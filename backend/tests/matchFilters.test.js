import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVerifiedLiveMatchFilter } from '../utils/matchFilters.js';

test('verified-live match filter only includes frontend-ready UK technology jobs', () => {
  const filter = buildVerifiedLiveMatchFilter();
  assert.deepEqual(filter.$and[0], { 'status.isLive': true });
  assert.deepEqual(filter.$and[1], { 'verification.status': 'live' });
  assert.deepEqual(filter.$and[2], { applyUrl: { $type: 'string', $ne: '' } });
  assert.deepEqual(filter.$and[3], { 'processing.status': 'complete' });

  const ukFilter = filter.$and[4];
  assert.ok(ukFilter.$or);

  const techFilter = filter.$and[5];
  assert.ok(techFilter.$and);
  assert.ok(techFilter.$and.some(condition => condition.$or));
  assert.ok(techFilter.$and.some(condition => condition.$nor));

  assert.equal(filter.companyId, undefined);
});

test('verified-live match filter can constrain sponsorship companies', () => {
  const filter = buildVerifiedLiveMatchFilter(['company-a', 'company-b']);
  assert.deepEqual(filter.companyId, { $in: ['company-a', 'company-b'] });
  assert.deepEqual(filter.$and[1], { 'verification.status': 'live' });
});
