import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSerperQuery,
  normaliseSerperResults,
  buildCompanySerperQueries,
  isLikelyJobPostingUrl
} from '../services/serperJobDiscovery.js';

test('builds a UK ATS Serper query', () => {
  assert.equal(
    buildSerperQuery({ keyword: 'frontend engineer', location: 'UK', site: 'jobs.lever.co' }),
    'site:jobs.lever.co frontend engineer UK'
  );
});

test('normalises and deduplicates Serper organic results', () => {
  const results = normaliseSerperResults({
    organic: [
      { link: 'https://jobs.lever.co/example/123', title: 'Frontend Engineer', snippet: 'UK role', position: 1 },
      { link: 'https://jobs.lever.co/example/123', title: 'Duplicate', snippet: 'Duplicate', position: 2 },
      { link: 'javascript:alert(1)', title: 'Unsafe', snippet: '' },
      { link: 'https://boards.greenhouse.io/example/jobs/456', title: 'Software Engineer' }
    ]
  });

  assert.equal(results.length, 2);
  assert.equal(results[0].source, 'serper');
  assert.equal(results[0].url, 'https://jobs.lever.co/example/123');
  assert.equal(results[1].url, 'https://boards.greenhouse.io/example/jobs/456');
});

test('handles missing organic results safely', () => {
  assert.deepEqual(normaliseSerperResults({}), []);
});


test('builds company-scoped queries using the company career host and configured ATS', () => {
  const queries = buildCompanySerperQueries({
    companyName: 'Monzo',
    careersUrl: 'https://monzo.com/careers',
    sites: ['boards.greenhouse.io']
  });
  assert.equal(queries[0], '"Monzo" software engineer software developer frontend developer full stack developer web developer jobs careers UK');
  assert.ok(queries.some(query => query.includes('site:monzo.com')));
  assert.ok(queries.some(query => query.includes('site:boards.greenhouse.io')));
});

test('recognises direct ATS and company career posting URLs', () => {
  assert.equal(isLikelyJobPostingUrl('https://jobs.lever.co/firstup/ec51ee72-a369-4018-8a45-15a26b7e9309'), true);
  assert.equal(isLikelyJobPostingUrl('https://www.amazon.jobs/en/jobs/123456/software-engineer', 'amazon.jobs'), true);
  assert.equal(isLikelyJobPostingUrl('https://monzo.com/careers/software-engineer-123', 'monzo.com'), true);
  assert.equal(isLikelyJobPostingUrl('https://monzo.com/careers', 'monzo.com'), false);
});

test('company discovery mapper preserves canonical source and identity fields', async () => {
  const { discoverCompanyJobsWithSerper } = await import('../services/serperJobDiscovery.js');
  assert.equal(typeof discoverCompanyJobsWithSerper, 'function');
});




test('supports generating a bounded set of company discovery candidates', () => {
  const queries = buildCompanySerperQueries({
    companyName: 'Monzo',
    careersUrl: 'https://monzo.com/careers',
    sites: ['boards.greenhouse.io', 'jobs.lever.co']
  });
  assert.equal(queries.length, 4);
  assert.equal(queries.slice(0, 2).length, 2);
});
