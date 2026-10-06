import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VALID_APPLICATION_FITS,
  VALID_EMPLOYER_TYPES,
  VALID_NATIONS,
  buildMatchResultJobFilter,
  validateMatchResultFilters
} from '../utils/matchResultFilters.js';

test('accepts every supported employer sector', () => {
  for (const employerType of VALID_EMPLOYER_TYPES) {
    assert.deepEqual(validateMatchResultFilters({ employerType }).employerType, employerType);
    assert.deepEqual(buildMatchResultJobFilter({ employerType }), { employerType });
  }
});

test('accepts every supported UK nation', () => {
  for (const nation of VALID_NATIONS) {
    assert.equal(validateMatchResultFilters({ nation }).nation, nation);
    assert.deepEqual(buildMatchResultJobFilter({ nation }), { nation });
  }
});

test('combines employer sector and nation without losing either filter', () => {
  assert.deepEqual(
    buildMatchResultJobFilter({ employerType: 'councils', nation: 'England' }),
    { employerType: 'councils', nation: 'England' }
  );
});

test('validates application fit alongside geography and sector', () => {
  assert.deepEqual(
    validateMatchResultFilters({
      applicationFit: VALID_APPLICATION_FITS[0],
      employerType: 'nhs',
      nation: 'Wales'
    }),
    { applicationFit: 'strong', employerType: 'nhs', nation: 'Wales' }
  );
});

test('rejects invalid employer sector', () => {
  assert.throws(() => validateMatchResultFilters({ employerType: 'local-authority' }), /employerType must be one of/);
});

test('rejects invalid UK nation', () => {
  assert.throws(() => validateMatchResultFilters({ nation: 'Republic of Ireland' }), /nation must be one of/);
});

test('rejects invalid application fit', () => {
  assert.throws(() => validateMatchResultFilters({ applicationFit: 'excellent' }), /applicationFit must be one of/);
});
