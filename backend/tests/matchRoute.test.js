import test from 'node:test';
import assert from 'node:assert/strict';

import { analyseJob, scoreCandidateAgainstJob } from '../jobIntelligence.js';
import { buildMatch } from '../routes/match.js';

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

test('match contract exposes application priority with explainable action', () => {
  const result = buildMatch(
    {
      skills: ['react', 'typescript', 'javascript'],
      yearsExperience: 2,
      cvText: 'Software Engineer with React, TypeScript and JavaScript experience.'
    },
    {
      title: 'Frontend Software Engineer',
      description: 'Essential criteria\n- React\n- TypeScript\n- JavaScript',
      status: { isLive: true },
      dates: { postedAt: new Date().toISOString() }
    },
    { status: 'verified', checkedAt: new Date().toISOString(), organisationName: 'Example Ltd' }
  );

  assert.equal(typeof result.applicationPriority.score, 'number');
  assert.ok(['high', 'medium', 'low', 'very-low'].includes(result.applicationPriority.band));
  assert.ok(['apply-now', 'apply', 'consider', 'skip'].includes(result.applicationPriority.action));
  assert.ok(result.applicationPriority.reasons.includes('Verified sponsor'));
});
