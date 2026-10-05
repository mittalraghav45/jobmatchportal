import test from 'node:test';
import assert from 'node:assert/strict';
import { matchJobToCandidate } from '../services/candidateMatching.js';

const profile = {
  targetTitles: ['Frontend Engineer', 'Software Engineer'],
  skills: ['React', 'TypeScript', 'JavaScript'],
  yearsExperience: 2.5,
  targetSeniority: ['junior', 'mid'],
  locations: ['UK'],
  employmentTypes: ['full-time']
};

test('does not let description keywords turn a data science title into a frontend match', () => {
  const result = matchJobToCandidate({
    title: 'Data Scientist',
    description: 'Work with React, TypeScript and frontend engineers on the platform.',
    location: 'UK',
    quality: { freshness: 'fresh' },
    verification: { status: 'live' }
  }, profile);

  assert.equal(result.components.roleCompatibilityStatus, 'specialisation_mismatch');
  assert.equal(result.applicationFit, 'weak');
});
