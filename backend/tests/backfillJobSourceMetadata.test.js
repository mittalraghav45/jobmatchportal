import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveJobSourceMetadata } from '../scripts/backfillJobSourceMetadata.js';

test('resolves canonical URL and ATS from nested raw source metadata', () => {
  const result = resolveJobSourceMetadata({
    applyUrl: null,
    source: { ats: '[object object]', url: '' },
    raw: {
      source: {
        ats: 'ashby',
        url: 'https://jobs.ashbyhq.com/confluent/47920ccd'
      }
    },
    verification: {}
  });

  assert.deepEqual(result, {
    ats: 'ashby',
    url: 'https://jobs.ashbyhq.com/confluent/47920ccd'
  });
});

test('uses verification URL as a safe fallback', () => {
  const result = resolveJobSourceMetadata({
    applyUrl: '',
    source: { ats: 'greenhouse', url: '' },
    raw: {},
    verification: {
      finalUrl: 'https://boards.greenhouse.io/acme/jobs/123'
    }
  });

  assert.deepEqual(result, {
    ats: 'greenhouse',
    url: 'https://boards.greenhouse.io/acme/jobs/123'
  });
});

test('does not treat object coercion as a valid ATS value', () => {
  const result = resolveJobSourceMetadata({
    source: { ats: '[object object]', url: '' },
    raw: {},
    verification: {}
  });

  assert.equal(result.ats, 'unknown');
  assert.equal(result.url, '');
});
