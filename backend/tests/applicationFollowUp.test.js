import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFollowUp, buildFollowUpQueue } from '../utils/applicationFollowUp.js';

const NOW = new Date('2026-10-10T12:00:00.000Z');

test('defaults an applied application to a seven-day follow-up', () => {
  const result = calculateFollowUp({ status: 'applied', appliedAt: '2026-10-01T12:00:00.000Z' }, NOW);
  assert.equal(result.followUpAt, '2026-10-08T12:00:00.000Z');
  assert.equal(result.due, true);
  assert.equal(result.stale, true);
});

test('scheduled follow-up overrides the default date', () => {
  const result = calculateFollowUp({ status: 'applied', appliedAt: '2026-10-01T12:00:00.000Z', followUpAt: '2026-10-20T12:00:00.000Z' }, NOW);
  assert.equal(result.followUpAt, '2026-10-20T12:00:00.000Z');
  assert.equal(result.due, false);
});

test('only active post-application statuses enter the follow-up queue', () => {
  const queue = buildFollowUpQueue([
    { applicationId: 'a1', status: 'applied', appliedAt: '2026-10-01T12:00:00.000Z', job: { title: 'Engineer' } },
    { applicationId: 'a2', status: 'rejected', appliedAt: '2026-09-01T12:00:00.000Z', job: { title: 'Rejected role' } }
  ], NOW);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].applicationId, 'a1');
  assert.equal(queue[0].daysOverdue, 2);
});
