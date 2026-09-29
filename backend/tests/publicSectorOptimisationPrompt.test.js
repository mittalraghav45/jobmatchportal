import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPublicSectorOrganisation,
  extractCriteria,
  buildEvidenceMatrix
} from '../prompts/publicSectorOptimisationPrompt.js';

test('detects NHS and DWP applications', () => {
  const result = classifyPublicSectorOrganisation('Software Developer - NHS Trust / DWP');
  assert.equal(result.isPublicSector, true);
  assert.ok(result.matchedTypes.includes('NHS'));
  assert.ok(result.matchedTypes.includes('DWP'));
});

test('does not classify an ordinary private employer', () => {
  assert.equal(
    classifyPublicSectorOrganisation('Software Engineer - Acme Ltd').isPublicSector,
    false
  );
});

test('separates essential and desirable criteria', () => {
  const result = extractCriteria(`
    Essential criteria
    Experience with JavaScript
    Experience working with stakeholders
    Desirable criteria
    Experience in higher education
  `);

  assert.equal(result.essential.length, 2);
  assert.equal(result.desirable.length, 1);
  assert.match(result.essential[0], /JavaScript/);
});

test('flags criteria with candidate evidence without inventing evidence', () => {
  const result = buildEvidenceMatrix(
    ['Experience with React', 'Experience with Python'],
    'I have professional experience building React applications.'
  );

  assert.equal(result[0].supported, true);
  assert.equal(result[1].supported, false);
});
