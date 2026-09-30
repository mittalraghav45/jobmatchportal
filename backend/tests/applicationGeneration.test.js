import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGeneratedApplication } from '../applicationGeneration.js';

test('validateGeneratedApplication strips unsupported output fields', () => {
  const result = validateGeneratedApplication({
    coverLetter: 'I am applying for this role.',
    unexpectedField: 'remove me'
  });

  assert.equal('unexpectedField' in result.result, false);
  assert.ok(result.validation);
});
