import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceHealthSummary, normaliseStaleHours } from '../utils/sourceHealth.js';

test('source health summary normalises Mongo aggregation rows', () => {
  const summary = buildSourceHealthSummary({
    total: 10,
    staleLive: 2,
    missingApplyUrl: 1,
    verification: [
      { _id: 'live', count: 7 },
      { _id: 'closed', count: 2 },
      { _id: 'unknown', count: 1 }
    ],
    processing: [
      { _id: 'complete', count: 9 },
      { _id: 'failed', count: 1 }
    ],
    ats: [
      { _id: 'greenhouse', count: 6 },
      { _id: 'custom', count: 4 }
    ]
  });

  assert.deepEqual(summary, {
    total: 10,
    staleLive: 2,
    missingApplyUrl: 1,
    verification: { live: 7, closed: 2, unknown: 1 },
    processing: { complete: 9, failed: 1 },
    ats: { greenhouse: 6, custom: 4 }
  });
});

test('source health summary ignores missing aggregation ids', () => {
  const summary = buildSourceHealthSummary({
    total: 3,
    verification: [{ _id: null, count: 3 }, { _id: 'live', count: 0 }]
  });

  assert.deepEqual(summary.verification, { live: 0 });
});

test('stale hours are bounded to a safe range', () => {
  assert.equal(normaliseStaleHours(undefined), 24);
  assert.equal(normaliseStaleHours('48'), 48);
  assert.equal(normaliseStaleHours('0'), 1);
  assert.equal(normaliseStaleHours('999999'), 720);
  assert.equal(normaliseStaleHours('not-a-number'), 24);
});
