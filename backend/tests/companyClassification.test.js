import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCompanyEmployerType } from '../utils/companyClassification.js';

test('classifies NHS organisations', () => {
  assert.equal(classifyCompanyEmployerType({ company: { companyName: 'NHS Digital' } }), 'nhs');
});

test('classifies councils', () => {
  assert.equal(classifyCompanyEmployerType({ company: { companyName: 'Southampton City Council' } }), 'councils');
});

test('classifies universities without treating generic colleges as universities', () => {
  assert.equal(classifyCompanyEmployerType({ company: { companyName: 'University of Southampton' } }), 'universities');
  assert.equal(classifyCompanyEmployerType({ company: { companyName: 'Example College Ltd' } }), 'private');
});

test('classifies DWP', () => {
  assert.equal(classifyCompanyEmployerType({ company: { companyName: 'Department for Work and Pensions' } }), 'dwp');
});

test('defaults ordinary technology companies to private', () => {
  assert.equal(classifyCompanyEmployerType({ company: { companyName: 'Vercel' } }), 'private');
});
