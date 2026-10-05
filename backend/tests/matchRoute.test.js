import test from 'node:test';
import assert from 'node:assert/strict';

import { analyseJob, scoreCandidateAgainstJob } from '../jobIntelligence.js';
import { addToTopMatches, compareRankedMatches } from '../routes/matchRoutes.js';

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

test('global ranking puts higher match scores ahead of newer lower-scoring jobs', () => {
  const matches = [
    { candidateScore: { score: 71 }, sponsorship: 'verified', job: { postedAt: '2026-10-01', id: 'newer' } },
    { candidateScore: { score: 92 }, sponsorship: 'unknown', job: { postedAt: '2026-09-01', id: 'older' } }
  ];

  matches.sort(compareRankedMatches);
  assert.equal(matches[0].job.id, 'older');
});

test('verified sponsorship breaks equal-score ties', () => {
  const matches = [
    { candidateScore: { score: 85 }, sponsorship: 'unknown', job: { postedAt: '2026-10-01', id: 'unknown' } },
    { candidateScore: { score: 85 }, sponsorship: 'verified', job: { postedAt: '2026-09-01', id: 'verified' } }
  ];

  matches.sort(compareRankedMatches);
  assert.equal(matches[0].job.id, 'verified');
});

test('top-match collection retains only the requested ranking window', () => {
  const top = [];
  addToTopMatches(top, { candidateScore: { score: 60 }, sponsorship: 'unknown', job: { id: 'a' } }, 2);
  addToTopMatches(top, { candidateScore: { score: 90 }, sponsorship: 'unknown', job: { id: 'b' } }, 2);
  addToTopMatches(top, { candidateScore: { score: 80 }, sponsorship: 'unknown', job: { id: 'c' } }, 2);

  assert.equal(top.length, 2);
  assert.deepEqual(top.map(item => item.job.id), ['b', 'c']);
});
