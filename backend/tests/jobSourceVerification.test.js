import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySourceResponse, verifyJobSource, atsPageEvidence } from '../services/jobSourceVerification.js';

const job = {
  title: 'Software Engineer',
  source: { url: 'https://jobs.example.com/jobs/123' },
  dates: { closingAt: null }
};

test('marks a job live only when source page has job-specific and application evidence', () => {
  const result = classifySourceResponse({ job, statusCode: 200, finalUrl: job.source.url, body: '<h1>Software Engineer</h1><p>Responsibilities and requirements.</p><button>Apply now</button>' });
  assert.equal(result.status, 'live');
  assert.equal(result.evidenceType, 'page_text');
});

test('marks a job closed from explicit source-page closure language', () => {
  const result = classifySourceResponse({ job, statusCode: 200, finalUrl: job.source.url, body: '<h1>Software Engineer</h1><p>This job is no longer available.</p>' });
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
  const result = classifySourceResponse({ job, statusCode: 200, finalUrl: 'https://jobs.example.com/careers', body: '<h1>Careers</h1><p>Explore our opportunities and apply now.</p>' });
  assert.equal(result.status, 'unknown');
});

test('uses a known closing date as authoritative closure evidence', () => {
  const result = classifySourceResponse({ job: { ...job, dates: { closingAt: '2020-01-01T00:00:00.000Z' } }, statusCode: 200, finalUrl: job.source.url, body: '<h1>Software Engineer</h1><button>Apply now</button>' });
  assert.equal(result.status, 'closed');
  assert.equal(result.evidenceType, 'closing_date');
});

test('marks a job unknown when a job URL redirects to a generic board', () => {
  const result = classifySourceResponse({ job, statusCode: 200, finalUrl: 'https://jobs.example.com/jobs', body: '<h1>Software Engineer</h1><p>Responsibilities and requirements.</p><button>Apply now</button>' });
  assert.equal(result.status, 'unknown');
  assert.equal(result.evidenceType, 'redirected_source');
});

test('recognises ATS-specific job URLs for Greenhouse, Lever, SmartRecruiters and Workable', () => {
  assert.equal(classifySourceResponse({ job, statusCode: 200, finalUrl: 'https://job-boards.greenhouse.io/acme/jobs/123', body: '<h1>Software Engineer</h1><p>Greenhouse job description</p><button>Apply</button>' }).status, 'live');
  assert.equal(classifySourceResponse({ job, statusCode: 200, finalUrl: 'https://jobs.lever.co/acme/abc123', body: '<h1>Software Engineer</h1><p>Lever job description</p><button>Apply</button>' }).status, 'live');
  assert.equal(classifySourceResponse({ job, statusCode: 200, finalUrl: 'https://jobs.smartrecruiters.com/Acme/123', body: '<h1>Software Engineer</h1><p>SmartRecruiters job description</p><button>Apply</button>' }).status, 'live');
  assert.equal(classifySourceResponse({ job, statusCode: 200, finalUrl: 'https://apply.workable.com/acme/j/123', body: '<h1>Software Engineer</h1><p>Workable job description</p><button>Apply</button>' }).status, 'live');
});

test('uses ATS page evidence without requiring a generic Apply phrase', () => {
  const result = classifySourceResponse({ job, statusCode: 200, finalUrl: 'https://jobs.lever.co/acme/abc123', body: '<h1>Software Engineer</h1><p>Lever</p><p>Responsibilities</p><p>Qualifications</p>' });
  assert.equal(result.status, 'live');
  assert.equal(result.evidenceType, 'ats_page');
});

test('does not treat an ATS homepage as a job posting', () => {
  const result = classifySourceResponse({ job, statusCode: 200, finalUrl: 'https://jobs.lever.co/acme', body: '<h1>Careers</h1><p>Lever</p><p>Explore our opportunities.</p>' });
  assert.equal(result.status, 'unknown');
});

test('exposes ATS evidence helper conservatively', () => {
  assert.equal(atsPageEvidence('https://jobs.ashbyhq.com/acme/123', '<h1>Software Engineer</h1><p>Apply</p>'), 'ATS job-page markers present');
  assert.equal(atsPageEvidence('https://example.com/jobs/123', '<h1>Software Engineer</h1><p>Apply</p>'), null);
});

test('verifies through an injected fetch implementation and preserves source metadata', async () => {
  const result = await verifyJobSource(job, { timeoutMs: 3000, fetchImpl: async () => ({ status: 200, url: job.source.url, text: async () => '<h1>Software Engineer</h1><p>Requirements</p><a>Apply now</a>' }) });
  assert.equal(result.status, 'live');
  assert.equal(result.httpStatus, 200);
  assert.equal(result.sourceUrl, job.source.url);
  assert.equal(result.finalUrl, job.source.url);
  assert.equal(result.attempts, 1);
});

test('retries transient HTTP failures before accepting a live source', async () => {
  let calls = 0;
  const result = await verifyJobSource(job, { retryDelayMs: 0, maxRetries: 2, fetchImpl: async () => {
    calls += 1;
    if (calls < 3) return { status: 503, url: job.source.url, text: async () => '' };
    return { status: 200, url: job.source.url, text: async () => '<h1>Software Engineer</h1><p>Requirements</p><a>Apply now</a>' };
  } });
  assert.equal(calls, 3);
  assert.equal(result.status, 'live');
  assert.equal(result.attempts, 3);
});

test('does not retry definitive 404 closure responses', async () => {
  let calls = 0;
  const result = await verifyJobSource(job, { retryDelayMs: 0, maxRetries: 2, fetchImpl: async () => {
    calls += 1;
    return { status: 404, url: job.source.url, text: async () => '' };
  } });
  assert.equal(calls, 1);
  assert.equal(result.status, 'closed');
  assert.equal(result.attempts, 1);
});
