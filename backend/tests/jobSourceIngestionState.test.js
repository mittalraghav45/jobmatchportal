import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldProcessSource,
  buildSourceIngestionState,
  summariseSourceIngestion
} from '../services/jobSourceIngestionState.js';

test('processes a source with no previous ingestion state', () => {
  assert.equal(shouldProcessSource({}), true);
});

test('skips a recently attempted source', () => {
  const now = new Date('2026-10-04T12:00:00.000Z');
  assert.equal(
    shouldProcessSource({ lastAttemptedAt: '2026-10-04T06:00:00.000Z' }, { now, retryAfterHours: 24 }),
    false
  );
});

test('retries a source after the configured interval', () => {
  const now = new Date('2026-10-05T12:00:00.000Z');
  assert.equal(
    shouldProcessSource({ lastAttemptedAt: '2026-10-04T06:00:00.000Z' }, { now, retryAfterHours: 24 }),
    true
  );
});

test('records successful source ingestion metrics', () => {
  const state = buildSourceIngestionState({
    previous: { consecutiveFailures: 2 },
    now: new Date('2026-10-04T12:00:00.000Z'),
    status: 'success',
    queries: 2,
    discovered: 12,
    added: 8,
    updated: 4
  });

  assert.equal(state.status, 'success');
  assert.equal(state.lastDiscovered, 12);
  assert.equal(state.lastAdded, 8);
  assert.equal(state.consecutiveFailures, 0);
  assert.equal(state.lastSuccessAt, '2026-10-04T12:00:00.000Z');
});

test('increments consecutive failures and preserves failure evidence', () => {
  const state = buildSourceIngestionState({
    previous: { consecutiveFailures: 1 },
    now: new Date('2026-10-04T12:00:00.000Z'),
    status: 'failed',
    error: '429 Too Many Requests'
  });

  assert.equal(state.status, 'failed');
  assert.equal(state.consecutiveFailures, 2);
  assert.equal(state.lastError, '429 Too Many Requests');
});

test('summarises a source result without changing ingestion semantics', () => {
  assert.deepEqual(
    summariseSourceIngestion({ queries: 2, discovered: 10, added: 7, updated: 3 }),
    {
      status: 'success',
      queries: 2,
      discovered: 10,
      added: 7,
      updated: 3,
      duplicatesRemoved: 0,
      rejected: 0,
      sourcePagesFetched: 0,
      sourcePageFailures: 0
    }
  );
});
