import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyJobLiveStatus } from '../services/jobLiveVerifier.js';

test('expired known closing date is classified as closed without guessing from HTTP', async () => {
  const result = await verifyJobLiveStatus({
    source: { url: 'https://example.com/job' },
    dates: { closingAt: '2026-09-10T23:59:59.000Z' }
  }, { now: new Date('2026-10-01T12:00:00.000Z') });

  assert.equal(result.state, 'closed');
  assert.equal(result.isLive, false);
  assert.equal(result.reason, 'closing_date_passed');
});

test('missing source URL remains unknown', async () => {
  const result = await verifyJobLiveStatus({ title: 'Software Engineer' });

  assert.equal(result.state, 'unknown');
  assert.equal(result.isLive, null);
  assert.equal(result.reason, 'no_source_url');
});

test('a non-success source response does not become live', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 503 });
  try {
    const result = await verifyJobLiveStatus({ source: { url: 'https://example.com/job' } });
    assert.equal(result.state, 'unknown');
    assert.equal(result.isLive, null);
    assert.equal(result.reason, 'http_503');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
