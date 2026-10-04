import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompanySourceQueries, rankSourceCandidates, selectBestSource } from '../services/companySourceDiscovery.js';

test('builds bounded company source queries', () => {
  const queries = buildCompanySourceQueries({ companyName: 'Acme Ltd', location: 'UK' });
  assert.equal(queries.length, 4);
  assert.match(queries[0], /"Acme Ltd" careers jobs UK/);
  assert.match(queries[1], /boards\.greenhouse\.io/);
});

test('keeps ATS discovery inside the default three-query budget', () => {
  const queries = buildCompanySourceQueries({
    companyName: 'Acme Ltd',
    location: 'UK'
  });
  assert.match(queries.slice(0, 3).join(' '), /boards\.greenhouse\.io/);
  assert.match(queries.slice(0, 3).join(' '), /jobs\.ashbyhq\.com/);
});

test('prefers a known official domain before broad company searches', () => {
  const queries = buildCompanySourceQueries({
    companyName: 'Acme Technologies',
    website: 'https://www.acme.example/about',
    location: 'UK'
  });
  assert.equal(queries.length, 5);
  assert.equal(queries[0], 'site:acme.example careers jobs UK');
  assert.match(queries[1], /jobs\.ashbyhq\.com/);
});

test('uses a careers URL as the known official domain when website is absent', () => {
  const queries = buildCompanySourceQueries({
    companyName: 'Acme Technologies',
    careersUrl: 'https://careers.acme.example/jobs',
    location: 'UK'
  });
  assert.equal(queries[0], 'site:careers.acme.example careers jobs UK');
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
      { url: 'https://acme.example/careers', title: 'Careers', snippet: 'Join our team' },
      { url: 'https://jobs.ashbyhq.com/acme', title: 'Acme Technologies jobs', snippet: 'Software Engineer' }
    ]
  });

  assert.equal(candidates[0].ats, 'ashby');
  assert.equal(candidates[0].sourceUrl, 'https://jobs.ashbyhq.com/acme');
});

test('accepts an official career page when the result omits the company name', () => {
  const candidates = rankSourceCandidates({
    company: { companyId: '123', companyName: 'Acme Technologies', website: 'https://acme.example' },
    results: [{ url: 'https://acme.example/careers', title: 'Careers', snippet: 'Join our team' }]
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].ats, 'custom');
  assert.equal(candidates[0].score, 80);
});

test('accepts a career-path result with company evidence even without an official domain', () => {
  const candidates = rankSourceCandidates({
    company: { companyId: '123', companyName: 'Acme Technologies' },
    results: [{ url: 'https://careers.example.com/acme/jobs', title: 'Acme Technologies Careers', snippet: 'Join our team' }]
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].ats, null);
  assert.equal(candidates[0].score, 35);
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
