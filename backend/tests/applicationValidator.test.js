import test from 'node:test';
import assert from 'node:assert/strict';
import { validateApplicationOutput, stripUnsupportedFields } from '../applicationValidator.js';

const base = {
  classification: {}, keywords: [], skills: [], experienceBullets: [], projects: [], summary: '',
  coverLetter: 'A short letter.', supportingStatement: '', evidenceMatrix: [], evidenceGaps: []
};

test('accepts a valid commercial application output', () => {
  const result = validateApplicationOutput(base, { publicSector: false, candidateEvidence: 'React experience' });
  assert.equal(result.valid, true);
  assert.equal(result.coverLetterWords, 3);
});

test('rejects cover letters over 400 words', () => {
  const result = validateApplicationOutput({...base, coverLetter: Array(401).fill('word').join(' ')}, {publicSector:false});
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /400 words/);
});

test('flags missing public-sector supporting statement', () => {
  const result = validateApplicationOutput(base, {publicSector:true});
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(w => /supporting statement/i.test(w)));
});

test('detects placeholders for manual verification', () => {
  const result = validateApplicationOutput({...base, summary:'Improved performance by [X%].'}, {publicSector:false});
  assert.deepEqual(result.placeholders, ['[X%]']);
});

test('keeps only the application contract fields', () => {
  const result = stripUnsupportedFields({...base, secret:'remove me'});
  assert.equal('secret' in result, false);
  assert.equal('summary' in result, true);
});
