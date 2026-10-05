import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyNightlyJob, incrementReasonCounts } from '../utils/nightlyDiagnostics.js';

test('nightly diagnostics marks a complete UK live verified technology job eligible', () => {
  const result = classifyNightlyJob({
    title: 'Software Engineer',
    location: 'London, United Kingdom',
    applyUrl: 'https://example.com/job',
    status: { isLive: true },
    verification: { status: 'live' },
    processing: { status: 'complete' }
  });

  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
});

test('nightly diagnostics explains non-UK and incomplete-source exclusions', () => {
  const result = classifyNightlyJob({
    title: 'Software Engineer',
    location: 'Helsinki, Finland',
    applyUrl: '',
    status: { isLive: false },
    verification: { status: 'pending' },
    processing: { status: 'pending' }
  });

  assert.equal(result.eligible, false);
  assert.deepEqual(result.reasons, [
    'non_uk',
    'not_live',
    'unverified',
    'missing_apply_url',
    'source_processing_incomplete'
  ]);
});

test('nightly diagnostics counts exclusion reasons without deleting jobs', () => {
  const counts = {};
  incrementReasonCounts(counts, ['non_uk', 'unverified']);
  incrementReasonCounts(counts, ['non_uk']);
  assert.deepEqual(counts, { non_uk: 2, unverified: 1 });
});
