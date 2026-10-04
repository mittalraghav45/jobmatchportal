import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompanySourceQueries, rankSourceCandidates, selectBestSource } from '../services/companySourceDiscovery.js';

test('builds bounded company source queries', () => {
  const queries = buildCompanySourceQueries({ companyName: 'Acme Ltd', location: 'UK' });
  assert.equal(queries.length, 2);
  assert.match(queries[0], /"Acme Ltd"/);
  assert.match(queries[0], /careers jobs UK/);
});

test('ranks ATS sources above generic career pages', () => {
  const company = {
    companyId: '123',
    companyName: 'Acme Technologies',
    website: 'https://acme.example'
  };
  const candidates = rankSourceCandidates({
    company,
    results: [
      { url: 'https://acme.example/careers', title: 'Acme Careers', snippet: 'Join Acme Technologies' },
      { url: 'https://jobs.ashbyhq.com/acme', title: 'Acme Technologies jobs', snippet: 'Software Engineer' }
    ]
  });

  assert.equal(candidates[0].ats, 'ashby');
  assert.equal(candidates[0].sourceUrl, 'https://jobs.ashbyhq.com/acme');
});

test('rejects unrelated search results', () => {
  const candidates = rankSourceCandidates({
    company: { companyId: '123', companyName: 'Acme Technologies', website: 'https://acme.example' },
    results: [{ url: 'https://example.com/careers', title: 'Other Company Careers', snippet: 'Other Company' }]
  });
  assert.equal(candidates.length, 0);
});

test('selects an ATS candidate before a generic candidate', () => {
  const generic = { sourceUrl: 'https://acme.example/careers', score: 150, ats: null };
  const ats = { sourceUrl: 'https://jobs.ashbyhq.com/acme', score: 120, ats: 'ashby' };
  assert.equal(selectBestSource([generic, ats]), ats);
});
