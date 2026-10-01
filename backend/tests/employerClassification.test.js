import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEmployerType, classifyJob } from '../utils/jobClassification.js';

const company = (companyName, metadata = {}, extra = {}) => ({ companyName, metadata, ...extra });

test('classifies NHS organisations as nhs', () => {
  assert.equal(classifyEmployerType({ company: company('NHS Hampshire and Isle of Wight') }), 'nhs');
  assert.equal(classifyEmployerType({ company: company('Birmingham and Solihull Mental Health NHS Foundation Trust') }), 'nhs');
});

test('classifies councils without relying on the word city alone', () => {
  assert.equal(classifyEmployerType({ company: company('Southampton City Council') }), 'councils');
  assert.equal(classifyEmployerType({ company: company('Westminster City Council') }), 'councils');
});

test('classifies universities and higher education organisations', () => {
  assert.equal(classifyEmployerType({ company: company('University of Southampton') }), 'universities');
  assert.equal(classifyEmployerType({ company: company('University of Edinburgh') }), 'universities');
  assert.equal(classifyEmployerType({ company: company('Cardiff University') }), 'universities');
});

test('classifies DWP', () => {
  assert.equal(classifyEmployerType({ company: company('Department for Work and Pensions') }), 'dwp');
  assert.equal(classifyEmployerType({ company: company('DWP Digital') }), 'dwp');
});

test('uses organisation metadata for employer classification', () => {
  assert.equal(classifyEmployerType({ company: company('Example Organisation', { organisationType: 'NHS Foundation Trust' }) }), 'nhs');
  assert.equal(classifyEmployerType({ company: company('Example Organisation', { sector: 'Local Government' }) }), 'councils');
  assert.equal(classifyEmployerType({ company: company('Example Organisation', { category: 'Higher Education' }) }), 'universities');
});

test('keeps ordinary private employers as private', () => {
  assert.equal(classifyEmployerType({ company: company('Acme Software Ltd') }), 'private');
  assert.equal(classifyEmployerType({ company: company('London Technology Services Ltd') }), 'private');
});

test('canonical company employerType overrides noisy job-feed text', () => {
  assert.equal(classifyEmployerType({
    company: company('Example Organisation', {}, { employerType: 'universities' }),
    job: { title: 'Software Engineer - NHS project' }
  }), 'universities');
});

test('employer classification is included in classifyJob', () => {
  const result = classifyJob({
    job: { title: 'Software Engineer', location: 'London, UK' },
    company: company('University of Southampton')
  });
  assert.deepEqual(result, {
    nation: 'England',
    employerType: 'universities',
    classificationVersion: 'v4'
  });
});
