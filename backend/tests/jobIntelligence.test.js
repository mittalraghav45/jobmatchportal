import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseJob, detectSeniority, extractTechnicalSkills, extractCriteria, detectSponsorshipLanguage, extractSalary, scoreCandidateAgainstJob } from '../jobIntelligence.js';

test('detects mid-level seniority', () => {
  assert.equal(detectSeniority('Software Engineer', 'This is a mid-level role').level, 2);
});

test('extracts technical skills and normalises aliases', () => {
  const skills = extractTechnicalSkills('Experience with React.js, Node.js, TypeScript, PostgreSQL and AWS required.');
  assert.ok(skills.includes('react'));
  assert.ok(skills.includes('node.js'));
  assert.ok(skills.includes('typescript'));
  assert.ok(skills.includes('postgresql'));
  assert.ok(skills.includes('aws'));
});

test('separates essential and desirable criteria', () => {
  const result = extractCriteria(`Essential criteria\n- Experience with React and TypeScript\n- Strong communication\nDesirable criteria\n- AWS experience\n- Playwright`);
  assert.equal(result.essential.length, 2);
  assert.equal(result.desirable.length, 2);
});

test('detects explicit sponsorship language without treating silence as no sponsorship', () => {
  assert.equal(detectSponsorshipLanguage('Skilled Worker visa sponsorship is available.').status, 'explicitly-mentioned');
  assert.equal(detectSponsorshipLanguage('This employer cannot sponsor visas.').status, 'explicitly-unavailable');
  assert.equal(detectSponsorshipLanguage('Competitive salary and benefits.').status, 'not-stated');
});

test('extracts GBP salary range', () => {
  assert.deepEqual(extractSalary('Salary: £45,000 - £55,000 per annum'), { min:45000, max:55000, currency:'GBP' });
});

test('produces explainable candidate score and missing skills', () => {
  const job = analyseJob({ title:'Mid-level Software Engineer', description:'Essential criteria\n- React\n- TypeScript\nDesirable criteria\n- AWS' });
  const result = scoreCandidateAgainstJob({ cvSkills:['react','typescript'], yearsExperience:2, cvText:'React TypeScript AWS', job });
  assert.ok(result.score >= 60);
  assert.deepEqual(result.missingSkills, []);
  assert.ok(Object.hasOwn(result.components, 'skillScore'));
});
