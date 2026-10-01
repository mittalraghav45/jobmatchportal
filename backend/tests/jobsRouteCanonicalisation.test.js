import test from 'node:test';
import assert from 'node:assert/strict';

import { normaliseAts } from '../routes/jobs.js';

test('jobs API never exposes [object Object] for nested ATS values', () => {
  assert.equal(normaliseAts({ platform: 'greenhouse' }), 'greenhouse');
  assert.equal(normaliseAts({ source: { ats: { name: 'ashby' } } }), 'unknown');
  assert.equal(normaliseAts('[object Object]'), 'unknown');
  assert.equal(normaliseAts({ ats: { provider: 'lever' } }), 'lever');
});
