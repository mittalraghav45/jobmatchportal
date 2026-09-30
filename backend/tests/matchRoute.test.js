import test from 'node:test';
import assert from 'node:assert/strict';

import { analyseJob, scoreCandidateAgainstJob } from '../jobIntelligence.js';

test('unified matching contract produces explainable match data', () => {
  const profile = {
    skills: ['react', 'typescript', 'node.js'],
    yearsExperience: 2,
    cvText: 'Software Engineer with React, TypeScript and Node.js experience.'
  };

  const job = analyseJob({
    title: 'Software Engineer',
    description: 'Essential criteria\n- React\n- TypeScript\n- Node.js\nDesirable criteria\n- AWS'
  });

  const result = scoreCandidateAgainstJob({ ...profile, job });

  assert.equal(typeof result.score, 'number');
  assert.ok(Array.isArray(result.matchedSkills));
  assert.ok(Array.isArray(result.missingSkills));
  assert.ok(result.components);
  assert.ok(result.matchedSkills.includes('react'));
});
