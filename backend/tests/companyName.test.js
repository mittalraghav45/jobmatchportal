import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCompanyName, extractCompanyName } from '../utils/companyName.js';

test('extracts company name from canonical companyName', () => {
  assert.equal(extractCompanyName({ companyName: 'Deliveroo' }), 'Deliveroo');
});

test('extracts company name from raw employer fields', () => {
  assert.equal(extractCompanyName({ employer: { name: 'NHS England' } }), 'NHS England');
  assert.equal(extractCompanyName({ company_name: 'University of Southampton' }), 'University of Southampton');
});

test('ignores placeholder company names', () => {
  assert.equal(cleanCompanyName('Unknown company'), '');
  assert.equal(extractCompanyName({ companyName: 'Unknown', employerName: 'Deliveroo' }), 'Deliveroo');
});

test('returns empty when company identity is genuinely unavailable', () => {
  assert.equal(extractCompanyName({ title: 'Software Engineer', location: 'London, UK' }), '');
});
