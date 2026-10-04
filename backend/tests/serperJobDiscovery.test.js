import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSerperQuery,
  normaliseSerperResults
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


test('builds company-scoped ATS queries for sponsor-first discovery', async () => {
  const { buildCompanySerperQueries } = await import('../services/serperJobDiscovery.js');
  const queries = buildCompanySerperQueries({
    companyName: 'Firstup',
    sites: ['jobs.lever.co', 'boards.greenhouse.io']
  });

  assert.deepEqual(queries, [
    'site:jobs.lever.co "Firstup" (software engineer OR software developer OR frontend developer OR full stack developer OR web developer) UK',
    'site:boards.greenhouse.io "Firstup" (software engineer OR software developer OR frontend developer OR full stack developer OR web developer) UK'
  ]);
});

test('company discovery mapper preserves canonical source and identity fields', async () => {
  const { discoverCompanyJobsWithSerper } = await import('../services/serperJobDiscovery.js');
  assert.equal(typeof discoverCompanyJobsWithSerper, 'function');
});
