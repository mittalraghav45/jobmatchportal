import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchResult } from '../models/MatchResult.js';

test('match result schema persists one result per profile and job', () => {
  const indexes = MatchResult.schema.indexes();
  assert.ok(indexes.some(([fields, options]) => fields.profileId === 1 && fields.jobId === 1 && options?.unique === true));
  assert.ok(indexes.some(([fields]) => fields.profileId === 1 && fields.matchScore === -1));
});

test('match result schema constrains application fit and score', () => {
  const fit = MatchResult.schema.path('applicationFit');
  const score = MatchResult.schema.path('matchScore');
  assert.deepEqual(fit.enumValues, ['strong', 'possible', 'weak']);
  assert.equal(score.options.min, 0);
  assert.equal(score.options.max, 100);
});

test('match result exposes explainable fields', () => {
  for (const field of ['profileId', 'jobId', 'matchScore', 'applicationFit', 'reasons', 'components', 'calculatedAt', 'matcherVersion']) {
    assert.ok(MatchResult.schema.path(field), `missing ${field}`);
  }
});
