import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitiseCandidateProfile } from '../models/CandidateProfile.js';

test('candidate profile sanitiser keeps only supported fields', () => {
  const result = sanitiseCandidateProfile({
    name: 'Candidate',
    skills: ['React', 'React', ' TypeScript '],
    yearsExperience: '2.5',
    secretToken: 'must not persist'
  });

  assert.deepEqual(result.skills, ['React', 'TypeScript']);
  assert.equal(result.yearsExperience, 2.5);
  assert.equal('secretToken' in result, false);
});

test('candidate profile sanitiser rejects invalid experience', () => {
  assert.throws(
    () => sanitiseCandidateProfile({ yearsExperience: -1 }),
    /yearsExperience must be a non-negative number/
  );
});

test('candidate profile sanitiser requires skills to be an array', () => {
  assert.throws(
    () => sanitiseCandidateProfile({ skills: 'React, TypeScript' }),
    /skills must be an array/
  );
});
