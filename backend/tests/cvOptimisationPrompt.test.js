import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_IN_ONE_CV_OPTIMISER_SYSTEM_PROMPT,
  CV_OUTPUT_CONTRACT,
  buildCvOptimisationPrompt
} from '../prompts/cvOptimisationPrompt.js';

test('All in One prompt enforces factual accuracy', () => {
  assert.match(ALL_IN_ONE_CV_OPTIMISER_SYSTEM_PROMPT, /Never invent achievements/i);
  assert.match(ALL_IN_ONE_CV_OPTIMISER_SYSTEM_PROMPT, /Never claim a tool or competency unless evidence supports it/i);
  assert.match(ALL_IN_ONE_CV_OPTIMISER_SYSTEM_PROMPT, /British English/i);
});

test('All in One prompt defines the required CV workflows', () => {
  for (const workflow of [
    'SKILLS SECTION',
    'KEYWORD CUSTOMISATION',
    'WORK-EXPERIENCE OPTIMISATION',
    'PROJECTS',
    'PROFESSIONAL SUMMARY',
    'COVER LETTERS',
    'COLD EMAIL OPTIMISATION'
  ]) {
    assert.match(ALL_IN_ONE_CV_OPTIMISER_SYSTEM_PROMPT, new RegExp(workflow));
  }
});

test('output contract matches All in One requirements', () => {
  assert.equal(CV_OUTPUT_CONTRACT.language, 'British English');
  assert.equal(CV_OUTPUT_CONTRACT.maxCoverLetterWords, 400);
  assert.equal(CV_OUTPUT_CONTRACT.keywordCount, 15);
  assert.deepEqual(CV_OUTPUT_CONTRACT.skillsSections, ['Functional Competencies', 'Technical Tools']);
});

test('prompt builder injects job material and candidate evidence', () => {
  const prompt = buildCvOptimisationPrompt({
    jobDescription: 'React TypeScript developer. AWS experience required.',
    candidateEvidence: 'Built React applications and migrated workloads to AWS.',
    task: 'Tailor the CV skills section.'
  });

  assert.match(prompt, /Tailor the CV skills section/);
  assert.match(prompt, /React TypeScript developer/);
  assert.match(prompt, /migrated workloads to AWS/);
  assert.match(prompt, /do not guess/i);
});

test('prompt builder does not invent candidate evidence', () => {
  const prompt = buildCvOptimisationPrompt({
    jobDescription: 'Python and Kubernetes required.',
    candidateEvidence: 'React and TypeScript experience only.'
  });

  assert.match(prompt, /Return only claims supported by the supplied evidence/i);
  assert.match(prompt, /Mark any missing measurable result with a placeholder/i);
});
