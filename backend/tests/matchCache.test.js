import test from 'node:test';
import assert from 'node:assert/strict';

import { JobMatchCache } from '../models/JobMatchCache.js';

test('match cache has the indexes required for profile/job reuse and ranking', () => {
  const indexKeys = JobMatchCache.schema.indexes().map(([keys]) => keys);

  assert.ok(indexKeys.some(keys => keys.profileId === 1 && keys.jobFingerprint === 1));
  assert.ok(indexKeys.some(keys => keys.profileId === 1 && keys.score === -1));
  assert.ok(indexKeys.some(keys => keys.profileId === 1 && keys.calculatedAt === -1));
});

test('match cache requires the identity and cached match payload', () => {
  const profileId = JobMatchCache.schema.path('profileId');
  const jobFingerprint = JobMatchCache.schema.path('jobFingerprint');
  const score = JobMatchCache.schema.path('score');
  const match = JobMatchCache.schema.path('match');

  assert.equal(profileId.options.required, true);
  assert.equal(jobFingerprint.options.required, true);
  assert.equal(score.options.required, true);
  assert.equal(match.options.required, true);
});
