import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyApplication,
  extractJobKeywords,
  buildOptimisationRequest,
  buildStructuredApplicationMessages
} from '../applicationEngine.js';

test('routes NHS and DWP applications to the public-sector specialist', () => {
  const result = classifyApplication({
    companyName: 'Department for Work and Pensions',
    role: 'Software Developer',
    jobDescription: 'The DWP team is looking for a developer.'
  });
  assert.equal(result.type, 'public-sector');
  assert.equal(result.specialist, 'nhs-public-sector');
});

test('routes an ordinary technology employer to All in One', () => {
  const result = classifyApplication({
    companyName: 'Example Technology Ltd',
    role: 'Frontend Software Engineer',
    jobDescription: 'React and TypeScript experience required.'
  });
  assert.equal(result.type, 'commercial');
  assert.equal(result.specialist, 'all-in-one');
});

test('extracts technical ATS keywords without copying the entire job description', () => {
  const keywords = extractJobKeywords(
    'We need a Software Engineer with strong React, TypeScript and Node.js experience. AWS is desirable.'
  );
  assert.ok(keywords.includes('react'));
  assert.ok(keywords.includes('typescript'));
  assert.ok(keywords.includes('node.js'));
  assert.ok(keywords.includes('aws'));
  assert.ok(keywords.length <= 15);
});

test('builds a public-sector optimisation request with evidence rules', () => {
  const request = buildOptimisationRequest({
    companyName: 'NHS Trust',
    role: 'Software Developer',
    jobDescription: 'Essential: experience with React.',
    candidateEvidence: 'Professional React development experience.'
  });
  assert.equal(request.classification.specialist, 'nhs-public-sector');
  assert.match(request.systemPrompt, /Never invent NHS/i);
  assert.ok(request.outputContract.factualAccuracy === 'strict');
});

test('structured request always includes a factuality instruction', () => {
  const result = buildStructuredApplicationMessages({
    companyName: 'Example Ltd',
    role: 'Software Engineer',
    jobDescription: 'React and TypeScript required.',
    candidateEvidence: 'React and TypeScript experience.'
  });
  assert.equal(result.messages.length, 2);
  assert.match(result.messages[0].content, /Never invent evidence/i);
  assert.match(result.messages[0].content, /coverLetter/i);
});

console.log('PASS applicationEngine tests');
