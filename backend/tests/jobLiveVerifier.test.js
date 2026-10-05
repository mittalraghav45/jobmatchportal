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

test('closed source-page language wins over generic apply-now text', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    '<html><body><a>Apply now</a><p>This job is no longer available for applications.</p></body></html>',
    { status: 200, headers: { 'content-type': 'text/html' } }
  );
  try {
    const result = await verifyJobLiveStatus({ source: { url: 'https://example.com/job' } });
    assert.equal(result.state, 'closed');
    assert.equal(result.isLive, false);
    assert.match(result.reason, /^source_text:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('future JobPosting validThrough is accepted as live evidence and supplies a closing date', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    '<script type="application/ld+json">{"@type":"JobPosting","title":"Software Engineer","validThrough":"2026-12-15T23:59:59Z"}</script>',
    { status: 200, headers: { 'content-type': 'text/html' } }
  );
  try {
    const result = await verifyJobLiveStatus(
      { source: { url: 'https://example.com/job' } },
      { now: new Date('2026-10-01T12:00:00.000Z') }
    );
    assert.equal(result.state, 'live');
    assert.equal(result.isLive, true);
    assert.equal(result.reason, 'structured_data:JobPosting.validThrough');
    assert.equal(result.closingAt, '2026-12-15T23:59:59.000Z');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
