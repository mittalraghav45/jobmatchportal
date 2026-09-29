import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceProfile, buildApplicationPromptContext, buildApplicationPack, validateApplicationPack } from '../applicationPack.js';

test('builds a normalised evidence profile without inventing content', () => {
  const profile = buildEvidenceProfile({ cvSkills:['React','React'], experience:[{employer:'IndiaMART', role:'Software Engineer', bullets:['Built a workflow']} ] });
  assert.deepEqual(profile.skills, ['react']);
  assert.equal(profile.experience[0].employer, 'IndiaMART');
  assert.equal(profile.experience[0].bullets[0], 'Built a workflow');
});

test('builds specialist prompt context from job and candidate evidence', () => {
  const context = buildApplicationPromptContext({
    specialist:'nhs-public-sector', task:'supportingStatement',
    job:{title:'Developer', companyName:'University', criteria:{essential:['React'], desirable:['AWS']}, technicalSkills:['react']},
    candidateEvidence:{cvText:'React developer', cvSkills:['React']}
  });
  assert.equal(context.specialist, 'nhs-public-sector');
  assert.deepEqual(context.job.criteria.essential, ['React']);
  assert.match(context.instruction, /Do not invent/);
});

test('rejects cover letters over 400 words', () => {
  const result = validateApplicationPack({ summary:'Valid summary', coverLetter: Array(401).fill('word').join(' ') });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('400')));
});

test('flags placeholders for manual verification', () => {
  const result = validateApplicationPack({ summary:'Delivered [X%] improvement.' });
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(w => w.includes('[X%]')));
});

test('builds a complete application pack and validation result', () => {
  const result = buildApplicationPack({ summary:'Software Engineer with verified production experience.', keywords:['React'], coverLetter:'Dear Hiring Team.' });
  assert.ok(result.validation);
  assert.deepEqual(result.keywords, ['React']);
  assert.equal(result.summary.startsWith('Software Engineer'), true);
});
