import test from 'node:test';
import assert from 'node:assert/strict';
import { matchJobToCandidate } from '../services/candidateMatching.js';

const profile = {
  yearsExperience: 2.5,
  skills: ['React', 'TypeScript', 'JavaScript', 'Node.js'],
  targetTitles: ['Frontend Developer', 'Software Engineer'],
  targetSeniority: ['junior', 'mid', 'engineer'],
  locations: ['UK'],
  employmentTypes: ['full-time'],
  workAuthorisation: { sponsorshipRequired: true },
  excludedSkills: ['Java'],
  excludedKeywords: ['React Native']
};

test('strongly matches a fresh verified sponsored frontend job', () => {
  const result = matchJobToCandidate({
    title: 'Frontend Software Engineer',
    description: 'React TypeScript JavaScript Node.js. Skilled Worker sponsorship available.',
    location: 'UK',
    employmentType: 'full-time',
    quality: { freshness: 'fresh' },
    verification: { status: 'live' }
  }, profile);

  assert.equal(result.applicationFit, 'strong');
  assert.ok(result.matchScore >= 80);
  assert.ok(result.reasons.includes('strong_skill_match'));
  assert.ok(result.reasons.includes('sponsorship_evidence'));
  assert.ok(result.reasons.includes('verified_live'));
});

test('penalises a job that explicitly does not sponsor', () => {
  const result = matchJobToCandidate({
    title: 'Software Engineer',
    description: 'React TypeScript. Unfortunately we are unable to sponsor applicants.',
    location: 'UK',
    quality: { freshness: 'fresh' },
    verification: { status: 'live' }
  }, profile);

  assert.equal(result.applicationFit, 'weak');
  assert.ok(result.reasons.includes('sponsorship_not_supported'));
});

test('hard-caps excluded technology matches', () => {
  const result = matchJobToCandidate({
    title: 'React Native Engineer',
    description: 'React Native JavaScript TypeScript. Sponsorship available.',
    location: 'UK',
    quality: { freshness: 'fresh' },
    verification: { status: 'live' }
  }, profile);

  assert.equal(result.matchScore, 20);
  assert.equal(result.applicationFit, 'weak');
  assert.ok(result.reasons.some((reason) => reason.startsWith('excluded_keyword:')));
});

test('does not claim sponsorship when the job provides no sponsorship evidence', () => {
  const result = matchJobToCandidate({
    title: 'Software Engineer',
    description: 'React TypeScript JavaScript.',
    location: 'UK',
    quality: { freshness: 'recent' },
    verification: { status: 'live' }
  }, profile);

  assert.equal(result.components.sponsorship, 25);
  assert.ok(result.reasons.includes('sponsorship_not_confirmed'));
  assert.notEqual(result.applicationFit, 'strong');
});

test('recognises the persisted Skilled Worker sponsorship profile field', () => {
  const result = matchJobToCandidate({
    title: 'Software Engineer',
    description: 'React TypeScript JavaScript.',
    location: 'UK',
    quality: { freshness: 'fresh' },
    verification: { status: 'live' }
  }, {
    ...profile,
    workAuthorisation: { country: 'United Kingdom', requiresSkilledWorkerSponsorship: true },
    preferences: { requiresSponsorship: true }
  });

  assert.equal(result.components.sponsorship, 25);
  assert.equal(result.components.sponsorshipStatus, 'unconfirmed');
});

test('does not let description keywords turn a data science title into a frontend match', () => {
  const result = matchJobToCandidate({
    title: 'Data Scientist',
    description: 'Work with React, TypeScript and frontend engineers on the platform.',
    location: 'UK',
    quality: { freshness: 'fresh' },
    verification: { status: 'live' }
  }, profile);

  assert.equal(result.components.roleCompatibilityStatus, 'mismatch');
  assert.equal(result.applicationFit, 'weak');
});

test('rejects intern and new-grad roles for a 2.5-year candidate', () => {
  for (const title of ['Associate Software Engineer - Intern', 'Software Engineer, New Grad']) {
    const result = matchJobToCandidate({
      title,
      description: 'React TypeScript JavaScript. Skilled Worker sponsorship available.',
      location: 'UK',
      quality: { freshness: 'fresh' },
      verification: { status: 'live' }
    }, profile);

    assert.equal(result.applicationFit, 'weak');
    assert.ok(result.reasons.includes('early_career_role_mismatch'));
  }
});

test('applies profile excludeTechnologies as hard exclusions', () => {
  const result = matchJobToCandidate({
    title: 'Python Software Engineer',
    description: 'Python, React and TypeScript. Skilled Worker sponsorship available.',
    location: 'UK',
    quality: { freshness: 'fresh' },
    verification: { status: 'live' }
  }, {
    ...profile,
    preferences: { excludeTechnologies: ['Python'] }
  });

  assert.equal(result.matchScore, 20);
  assert.equal(result.applicationFit, 'weak');
});
