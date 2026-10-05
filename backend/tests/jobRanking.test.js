import test from 'node:test';
import assert from 'node:assert/strict';
import { rankJob } from '../services/jobRanking.js';

test('ranks a strong verified fresh React TypeScript role highly', () => {
  const result = rankJob({
    title: 'Frontend Software Engineer',
    description: 'Build React and TypeScript applications with JavaScript.',
    location: 'London, UK',
    employmentType: 'Full Time',
    verification: { status: 'live' },
    quality: { freshness: 'fresh' }
  }, {
    targetTitles: ['Frontend Software Engineer', 'Frontend Developer'],
    skills: ['React', 'TypeScript', 'JavaScript'],
    targetSeniority: ['engineer'],
    locations: ['London'],
    employmentTypes: ['Full Time']
  });

  assert.equal(result.matchScore >= 80, true);
  assert.equal(result.reasons.includes('strong_skill_match'), true);
  assert.equal(result.reasons.includes('verified_live'), true);
  assert.equal(result.reasons.includes('fresh_source'), true);
});

test('penalises closed and expired jobs', () => {
  const result = rankJob({
    title: 'Frontend Developer',
    description: 'React TypeScript',
    verification: { status: 'closed' },
    quality: { freshness: 'expired' }
  }, {
    targetTitles: ['Frontend Developer'],
    skills: ['React', 'TypeScript']
  });

  assert.equal(result.matchScore < 70, true);
  assert.equal(result.reasons.includes('verified_live'), false);
  assert.equal(result.reasons.includes('fresh_source'), false);
});

test('returns a bounded score with incomplete profile data', () => {
  const result = rankJob({ title: 'Software Engineer', verification: { status: 'unknown' }, quality: { freshness: 'unknown' } }, {});
  assert.equal(result.matchScore >= 0 && result.matchScore <= 100, true);
});
