import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRoleFamily, classifyRoleSpecialisations, roleFamilyCompatibility } from '../utils/roleFamily.js';

test('classifies frontend and software engineering roles', () => {
  assert.ok(classifyRoleFamily('Frontend Software Engineer').includes('frontend'));
  assert.ok(classifyRoleFamily('Frontend Software Engineer').includes('software'));
});

test('matches a frontend candidate to frontend and full-stack roles', () => {
  const profile = { targetTitles: ['Frontend Engineer', 'Software Engineer'], skills: ['React', 'TypeScript', 'JavaScript'] };
  assert.equal(roleFamilyCompatibility({ title: 'Frontend Engineer' }, profile).status, 'match');
  assert.equal(roleFamilyCompatibility({ title: 'Full-stack Engineer' }, profile).status, 'match');
  assert.equal(roleFamilyCompatibility({ title: 'Backend Engineer' }, profile).status, 'match');
});

test('marks data science and security roles as specialist mismatches for a frontend candidate', () => {
  const profile = { targetTitles: ['Frontend Engineer', 'Software Engineer'], skills: ['React', 'TypeScript', 'JavaScript'] };
  assert.equal(roleFamilyCompatibility({ title: 'Data Scientist' }, profile).status, 'specialisation_mismatch');
  assert.equal(roleFamilyCompatibility({ title: 'Security Engineer' }, profile).status, 'specialisation_mismatch');
});

test('uses the job title as the authoritative role-family signal', () => {
  const profile = { targetTitles: ['Frontend Engineer', 'Software Engineer'], skills: ['React', 'TypeScript', 'JavaScript'] };
  const result = roleFamilyCompatibility({ title: 'Data Scientist', description: 'Build data products with React and TypeScript alongside frontend engineers.' }, profile);
  assert.equal(result.status, 'specialisation_mismatch');
  assert.deepEqual(result.jobFamilies, ['data']);
});

test('distinguishes specialist software titles from general software roles', () => {
  assert.deepEqual(classifyRoleSpecialisations('Software Engineer (Machine Learning)'), ['machine_learning']);
  assert.deepEqual(classifyRoleSpecialisations('Senior Software Engineer - iOS'), ['mobile']);
  assert.deepEqual(classifyRoleSpecialisations('Principal Statistical Programmer / Analyst Consultant'), ['data']);
  const profile = { targetTitles: ['Frontend Engineer', 'Full-stack Software Engineer'], skills: ['React', 'TypeScript', 'JavaScript'] };
  const specialist = roleFamilyCompatibility({ title: 'Software Engineer (Machine Learning)' }, profile);
  assert.equal(specialist.status, 'specialisation_mismatch');
  assert.equal(specialist.score, 0.4);
  const general = roleFamilyCompatibility({ title: 'Full Stack Software Engineer' }, profile);
  assert.equal(general.status, 'match');
  assert.equal(general.score, 1);
});

test('keeps unknown role families neutral rather than rejecting them', () => {
  const result = roleFamilyCompatibility({ title: 'Technology Specialist' }, { targetTitles: ['Frontend Engineer'], skills: ['React'] });
  assert.equal(result.status, 'unknown');
  assert.equal(result.score, 0.5);
});
