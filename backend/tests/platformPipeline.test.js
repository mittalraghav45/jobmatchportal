import test from 'node:test';
import assert from 'node:assert/strict';
import { detectATS, resolveATS, normaliseSlug } from '../ats/detect.js';
import { scoreJobAgainstCandidate } from '../services/candidateMatcher.js';
import { ingestJobs } from '../services/jobIngestion.js';

const candidate = {
  targetRoles: ['Software Engineer'],
  preferredTechnologies: ['React', 'TypeScript', 'Node.js'],
  excludedTechnologies: ['React Native', 'Java'],
  locations: ['United Kingdom'],
  preferredEmploymentTypes: ['full-time'],
  minimumMatchPercent: 60
};

test('ATS detection identifies supported public ATS hosts', () => {
  assert.equal(detectATS('https://boards.greenhouse.io/example').ats, 'greenhouse');
  assert.equal(detectATS('https://jobs.ashbyhq.com/example').ats, 'ashby');
  assert.equal(detectATS('https://example.wd3.myworkdayjobs.com/en-US/careers').ats, 'workday');
  assert.equal(detectATS('https://example.com/careers').ats, 'unknown');
});

test('explicit ATS configuration wins over auto detection', () => {
  assert.deepEqual(resolveATS({ ats: 'lever', careersUrl: 'https://example.com/careers' }).ats, 'lever');
  assert.equal(resolveATS({ ats: 'not-real', careersUrl: 'https://example.com' }).ats, 'unknown');
});

test('company slugs are deterministic', () => {
  assert.equal(normaliseSlug('Acme Software, Ltd.'), 'acme-software-ltd');
});

test('candidate matcher rewards relevant skills and penalises excluded technologies', () => {
  const good = scoreJobAgainstCandidate({ title: 'Software Engineer', description: 'React TypeScript Node.js full-time role in United Kingdom', location: 'United Kingdom', employmentType: 'full-time' }, candidate);
  const bad = scoreJobAgainstCandidate({ title: 'Java React Native Developer', description: 'Java and React Native', location: 'United Kingdom' }, candidate);
  assert.ok(good.score > bad.score);
  assert.equal(bad.excludedHits.length, 2);
});

test('job ingestion removes duplicates by canonical fingerprint', () => {
  const raw = [
    { id: '1', companyId: 'acme', title: 'Software Engineer', description: 'React', location: 'UK', ats: 'greenhouse', url: 'https://example/jobs/1' },
    { id: '1-copy', companyId: 'acme', title: 'Software Engineer', description: 'React', location: 'UK', ats: 'greenhouse', url: 'https://example/jobs/1' }
  ];
  const result = ingestJobs(raw);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.duplicatesRemoved, 1);
});
