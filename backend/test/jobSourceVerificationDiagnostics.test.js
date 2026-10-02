const {
  classifySourceUrl,
  classifyVerificationOutcome,
} = require('../jobSourceVerificationDiagnostics');

describe('job source verification diagnostics', () => {
  test('classifies supported ATS source URLs', () => {
    expect(classifySourceUrl('https://boards.greenhouse.io/acme/jobs/123')).toBe('greenhouse');
    expect(classifySourceUrl('https://jobs.lever.co/acme/abc')).toBe('lever');
    expect(classifySourceUrl('https://jobs.ashbyhq.com/acme/abc')).toBe('ashby');
    expect(classifySourceUrl('https://acme.wd3.myworkdayjobs.com/en-US/jobs/job/123')).toBe('workday');
    expect(classifySourceUrl('https://jobs.smartrecruiters.com/Acme/123')).toBe('smartrecruiters');
    expect(classifySourceUrl('https://acme.recruitee.com/o/acme/jobs/123')).toBe('recruitee');
  });

  test('distinguishes a generic company careers page', () => {
    expect(classifySourceUrl('https://example.com/careers')).toBe('career-page');
  });

  test('classifies verification outcomes without guessing', () => {
    expect(classifyVerificationOutcome({ status: 'live' })).toBe('live-evidence');
    expect(classifyVerificationOutcome({ status: 'closed' })).toBe('closed-evidence');
    expect(classifyVerificationOutcome({ httpStatus: 403 })).toBe('blocked-403');
    expect(classifyVerificationOutcome({ httpStatus: 429 })).toBe('rate-limited-429');
    expect(classifyVerificationOutcome({ httpStatus: 404 })).toBe('not-found');
    expect(classifyVerificationOutcome({ httpStatus: 200 })).toBe('http-200-unclassified');
    expect(classifyVerificationOutcome({ error: 'request timeout' })).toBe('timeout');
  });
});
