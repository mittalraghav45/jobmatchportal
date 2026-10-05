import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRoleFamily, roleFamilyCompatibility } from '../utils/roleFamily.js';

test('classifies frontend and software engineering roles', () => {
  assert.ok(classifyRoleFamily('Frontend Software Engineer').includes('frontend'));
  assert.ok(classifyRoleFamily('Frontend Software Engineer').includes('software'));
});

test('matches a frontend candidate to frontend and full-stack roles', () => {
  const profile = {
    targetTitles: ['Frontend Engineer', 'Software Engineer'],
    skills: ['React', 'TypeScript', 'JavaScript']
  };

  assert.equal(roleFamilyCompatibility({ title: 'Frontend Engineer' }, profile).status, 'match');
  assert.equal(roleFamilyCompatibility({ title: 'Full-stack Engineer' }, profile).status, 'adjacent');
});

test('marks data science and security roles as mismatches for a frontend candidate', () => {
  const profile = {
    targetTitles: ['Frontend Engineer', 'Software Engineer'],
    skills: ['React', 'TypeScript', 'JavaScript']
  };

  assert.equal(roleFamilyCompatibility({ title: 'Data Scientist' }, profile).status, 'mismatch');
  assert.equal(roleFamilyCompatibility({ title: 'Security Engineer' }, profile).status, 'mismatch');
});

test('uses the job title as the authoritative role-family signal', () => {
  const profile = {
    targetTitles: ['Frontend Engineer', 'Software Engineer'],
    skills: ['React', 'TypeScript', 'JavaScript']
  };

  const result = roleFamilyCompatibility({
    title: 'Data Scientist',
    description: 'Build data products with React and TypeScript alongside frontend engineers.'
  }, profile);

  assert.equal(result.status, 'mismatch');
  assert.deepEqual(result.jobFamilies, ['data']);
});

test('keeps unknown role families neutral rather than rejecting them', () => {
  const result = roleFamilyCompatibility({ title: 'Technology Specialist' }, {
    targetTitles: ['Frontend Engineer'],
    skills: ['React']
  });
  assert.equal(result.status, 'unknown');
  assert.equal(result.score, 0.5);
});
