import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySourceResponse } from '../services/jobSourceVerification.js';

const job = {
  title: 'Software Engineer',
  source: { url: 'https://jobs.example.com/jobs/123' },
  dates: { closingAt: null }
};

test('marks a job live only when source page has job-specific and application evidence', () => {
  const result = classifySourceResponse({
    job,
    statusCode: 200,
    finalUrl: job.source.url,
    body: '<h1>Software Engineer</h1><p>Responsibilities and requirements.</p><button>Apply now</button>'
  });

  assert.equal(result.status, 'live');
  assert.equal(result.evidenceType, 'page_text');
});

test('marks a job closed from explicit source-page closure language', () => {
  const result = classifySourceResponse({
    job,
    statusCode: 200,
    finalUrl: job.source.url,
    body: '<h1>Software Engineer</h1><p>This job is no longer available.</p>'
  });

  assert.equal(result.status, 'closed');
  assert.equal(result.evidenceType, 'page_text');
});

test('marks 404 and 410 source responses closed', () => {
  assert.equal(classifySourceResponse({ job, statusCode: 404, body: '' }).status, 'closed');
  assert.equal(classifySourceResponse({ job, statusCode: 410, body: '' }).status, 'closed');
});

test('keeps access failures unknown rather than assuming live', () => {
  assert.equal(classifySourceResponse({ job, statusCode: 403, body: '' }).status, 'unknown');
  assert.equal(classifySourceResponse({ job, statusCode: 429, body: '' }).status, 'unknown');
  assert.equal(classifySourceResponse({ job, statusCode: 503, body: '' }).status, 'unknown');
});

test('keeps a generic careers page unknown even when HTTP 200', () => {
  const result = classifySourceResponse({
    job,
    statusCode: 200,
    finalUrl: 'https://jobs.example.com/careers',
    body: '<h1>Careers</h1><p>Explore our opportunities and apply now.</p>'
  });

  assert.equal(result.status, 'unknown');
});

test('uses a known closing date as authoritative closure evidence', () => {
  const result = classifySourceResponse({
    job: { ...job, dates: { closingAt: '2020-01-01T00:00:00.000Z' } },
    statusCode: 200,
    finalUrl: job.source.url,
    body: '<h1>Software Engineer</h1><button>Apply now</button>'
  });

  assert.equal(result.status, 'closed');
  assert.equal(result.evidenceType, 'closing_date');
});
