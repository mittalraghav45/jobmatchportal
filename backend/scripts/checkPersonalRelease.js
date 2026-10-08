import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { disconnectMongo } from '../db/mongoose.js';

// Read-only release check: never creates/changes jobs, profiles or applications.
process.env.NODE_ENV = 'test';
process.env.SERVE_FRONTEND = 'true';
process.env.PERSONAL_USERNAME = 'release-check';
process.env.PERSONAL_PASSWORD = randomBytes(32).toString('hex');
const { app } = await import('../server.js');
const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
const base = `http://127.0.0.1:${server.address().port}`;
const headers = { Authorization: 'Basic ' + Buffer.from(`${process.env.PERSONAL_USERNAME}:${process.env.PERSONAL_PASSWORD}`).toString('base64'), 'Content-Type': 'application/json' };
try {
  assert.equal((await fetch(base + '/')).status, 401);
  const index = await fetch(base + '/', { headers });
  assert.equal(index.status, 200);
  assert.match(await index.text(), /<div id="root">/);
  const response = await fetch(base + '/api/jobs?limit=5&verifiedLive=true', { headers });
  assert.equal(response.status, 200);
  const jobs = await response.json();
  assert.ok(jobs.pagination.total > 0, 'No verified-live UK technology jobs are available');
  for (const job of jobs.jobs) {
    assert.equal(job.status.isLive, true);
    assert.equal(job.verification.status, 'live');
    assert.ok(job.applyUrl);
    assert.ok(['verified', 'not-sponsor', 'unknown'].includes(job.sponsorship));
  }
  const profileResponse = await fetch(base + '/api/profile/default', { headers });
  assert.equal(profileResponse.status, 200);
  const { profile } = await profileResponse.json();
  const matchResponse = await fetch(base + '/api/match/jobs', { method: 'POST', headers, body: JSON.stringify({ profileId: profile.profileId, limit: 5 }) });
  assert.equal(matchResponse.status, 200);
  const matches = await matchResponse.json();
  assert.ok(matches.total > 0, 'No current eligible matches are available');
  assert.equal(matches.rankingSource, 'persisted_match_results');
  for (const item of matches.matches) {
    assert.ok(item.job.id);
    assert.ok(item.job.url);
    assert.equal(item.job.status.isLive, true);
    assert.equal(item.job.verification.status, 'live');
  }
  const applications = await fetch(base + '/api/applications?limit=1', { headers });
  assert.equal(applications.status, 200);
  console.log(JSON.stringify({ status: 'PASS', authenticatedFrontend: true, verifiedLiveJobs: jobs.pagination.total, currentEligibleMatches: matches.total, rankingSource: matches.rankingSource, profileVersion: profile.activeVersion, applicationListReadable: true }));
} finally {
  await new Promise(resolve => server.close(resolve));
  await disconnectMongo();
}
