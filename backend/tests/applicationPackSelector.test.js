import test from 'node:test';
import assert from 'node:assert/strict';
import { selectApplicationOutput, validateApplicationOutput } from '../applicationPackSelector.js';

test('selects only requested CV skills output', () => {
  const result = selectApplicationOutput({ keywords:['React','TypeScript'], skills:{functional:['API development'], technical:['React']}, coverLetter:'unused' }, 'skills');
  assert.deepEqual(result.keywords, ['React','TypeScript']);
  assert.equal(result.coverLetter, undefined);
  assert.equal(result.validation.valid, true);
});

test('selects public-sector supporting statement with evidence', () => {
  const result = selectApplicationOutput({ supportingStatement:'Evidence statement', evidenceMatrix:[{criterion:'Communication', evidence:'Verified'}], evidenceGaps:['Need metric'] }, 'supportingStatement');
  assert.equal(result.supportingStatement, 'Evidence statement');
  assert.equal(result.evidenceMatrix.length, 1);
  assert.deepEqual(result.evidenceGaps, ['Need metric']);
});

test('caps keywords and validates cover letter length', () => {
  const output = validateApplicationOutput({ keywords:Array.from({length:16}, (_,i)=>`k${i}`), coverLetter:Array(401).fill('word').join(' ') });
  assert.equal(output.valid, false);
  assert.equal(output.errors.length, 2);
});

test('flags metric placeholders', () => {
  const output = validateApplicationOutput({ summary:'Improved performance by [X%].' });
  assert.equal(output.valid, true);
  assert.ok(output.placeholders.includes('[X%]'));
});
