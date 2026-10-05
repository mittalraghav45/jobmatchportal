import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNightlyQualityGate } from '../utils/nightlyQualityGate.js';

const strong = (overrides = {}) => ({
  jobId: 'job-1',
  title: 'Software Engineer',
  applicationFit: 'strong',
  components: {
    skills: 85,
    roleCompatibilityStatus: 'match',
    experienceStatus: 'match'
  },
  reasons: ['strong_core_match'],
  ...overrides
});

test('passes a well-evidenced strong match', () => {
  const result = evaluateNightlyQualityGate([strong()]);
  assert.equal(result.status, 'PASS');
  assert.equal(result.criticalCount, 0);
});

test('fails strong matches with weak skill evidence', () => {
  const result = evaluateNightlyQualityGate([strong({ components: { skills: 59, roleCompatibilityStatus: 'match', experienceStatus: 'match' } })]);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.strongWithLowSkills, 1);
});

test('fails specialist mismatches promoted to strong', () => {
  const result = evaluateNightlyQualityGate([strong({ components: { skills: 90, roleCompatibilityStatus: 'specialisation_mismatch', experienceStatus: 'match' } })]);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.strongSpecialistMismatches, 1);
});

test('fails strong matches with unknown role compatibility', () => {
  const result = evaluateNightlyQualityGate([strong({ components: { skills: 90, roleCompatibilityStatus: 'unknown', experienceStatus: 'match' } })]);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.strongWithRoleProblems, 1);
});

test('fails strong matches with incompatible experience', () => {
  const result = evaluateNightlyQualityGate([strong({ components: { skills: 90, roleCompatibilityStatus: 'match', experienceStatus: 'mismatch' } })]);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.strongWithExperienceProblems, 1);
});

test('treats unconfirmed sponsorship as a warning, not a quality failure', () => {
  const result = evaluateNightlyQualityGate([strong({ applicationFit: 'strong_unconfirmed_sponsorship' })]);
  assert.equal(result.status, 'PASS');
  assert.equal(result.strongUnknownSponsorship, 1);
  assert.equal(result.warningCount, 1);
});
