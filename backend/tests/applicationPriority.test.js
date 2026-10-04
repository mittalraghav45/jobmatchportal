import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateApplicationPriority } from '../utils/applicationPriority.js';

test('high-match verified sponsor becomes apply-now', () => {
  const result = calculateApplicationPriority({ matchScore: 86, sponsorship: 'verified', seniorityLevel: 2, isLive: true });
  assert.equal(result.band, 'high');
  assert.equal(result.action, 'apply-now');
  assert.ok(result.score >= 90);
  assert.ok(result.reasons.includes('Verified sponsor'));
});

test('non-sponsor is materially penalised', () => {
  const result = calculateApplicationPriority({ matchScore: 80, sponsorship: 'not-sponsor', isLive: true });
  assert.ok(result.score < 80);
  assert.equal(result.action, 'consider');
  assert.ok(result.penalties.includes('No sponsor licence'));
});

test('senior leadership role is penalised for this profile', () => {
  const result = calculateApplicationPriority({ matchScore: 80, sponsorship: 'verified', seniorityLevel: 5, isLive: true });
  assert.ok(result.penalties.includes('Senior leadership level'));
  assert.ok(result.score < 92);
});

test('recent closing deadline increases application urgency', () => {
  const result = calculateApplicationPriority({
    matchScore: 70,
    sponsorship: 'verified',
    isLive: true,
    closingAt: new Date(Date.now() + 2 * 86400000).toISOString()
  });
  assert.equal(result.action, 'apply-now');
  assert.ok(result.reasons.includes('Closing soon'));
});

test('closed job cannot receive a high application priority', () => {
  const result = calculateApplicationPriority({
    matchScore: 95,
    sponsorship: 'verified',
    isLive: true,
    closingAt: new Date(Date.now() - 86400000).toISOString()
  });
  assert.notEqual(result.action, 'apply-now');
  assert.ok(result.penalties.includes('Application closed'));
});
