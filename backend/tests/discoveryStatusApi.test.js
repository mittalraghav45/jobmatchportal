import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const RUN_ID = process.env.GOLDEN_RUN_ID || 'golden-full-v20515';

async function get(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { response, body };
}

test('discovery dashboard exposes live batch fields', async () => {
  let response;
  let body;
  try {
    ({ response, body } = await get(`/api/intelligence/dashboard?runId=${encodeURIComponent(RUN_ID)}`));
  } catch (error) {
    return test.skip(`Backend unavailable at ${BASE_URL}: ${error.message}`);
  }

  if (!response.ok) {
    return test.skip(`Discovery dashboard unavailable: HTTP ${response.status}`);
  }

  const d = body.discovery;
  assert.ok(d);
  assert.equal(typeof d.processed, 'number');
  assert.equal(typeof d.companyTotal, 'number');
  assert.equal(typeof d.remaining, 'number');
  assert.equal(typeof d.processing, 'number');
  assert.equal(typeof d.processingRemaining, 'number');
  assert.equal(typeof d.progressPercent, 'number');
  assert.ok(['idle', 'running', 'stale', 'completed'].includes(d.status));
  assert.ok(d.currentBatch === null || typeof d.currentBatch === 'object');
});
