import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchResult } from '../models/MatchResult.js';
import { startIsolatedServer } from '../test-support/isolatedServer.js';

test('real MongoDB: combined filters, matching, application persistence and status transitions', async () => {
  const fixture = await startIsolatedServer();
  const request = async (path, options) => {
    const response = await fetch(fixture.url + path, options && { headers: { 'Content-Type': 'application/json' }, ...options });
    return { status: response.status, body: await response.json() };
  };
  try {
    const filtered = await request('/api/jobs?city=Belfast&nation=Northern%20Ireland&category=frontend&sponsorship=verified&employerType=universities&verifiedLive=true');
    assert.equal(filtered.status, 200);
    assert.deepEqual(filtered.body.jobs.map(j => j.fingerprint), ['eligible']);
    assert.equal(filtered.body.pagination.total, 1);
    assert.equal(filtered.body.jobs[0].sponsorship, 'verified');
    const unknown = await request('/api/jobs?city=Belfast&sponsorship=unknown');
    assert.deepEqual(unknown.body.jobs.map(j => j.fingerprint), ['orphan']);
    for (const query of ['category=invalid', 'verifiedLive=maybe']) {
      assert.equal((await request('/api/jobs?' + query)).status, 400);
    }
    const id = filtered.body.jobs[0]._id;
    const dynamic = await request('/api/match/jobs', { method: 'POST', body: JSON.stringify({ sponsorship: 'verified' }) });
    assert.equal(dynamic.status, 200);
    assert.equal(dynamic.body.rankingSource, 'dynamic_fallback');
    for (const item of dynamic.body.matches) { assert.ok(item.job.id); assert.ok(item.job.url); }
    const eligibility = { uk: true, live: true, verified: true, technology: true };
    await MatchResult.create([
      { profileId: 'default', profileVersion: 'v1', jobId: id, matchScore: 80, applicationFit: 'possible', eligibility },
      { profileId: 'default', profileVersion: 'v1', jobId: fixture.jobs.find(j => j.fingerprint === 'closed').id, matchScore: 99, applicationFit: 'possible', eligibility },
      { profileId: 'default', profileVersion: 'old', jobId: id, matchScore: 95, applicationFit: 'possible', eligibility }
    ]);
    const ranked = await request('/api/match/jobs', { method: 'POST', body: JSON.stringify({ sponsorship: 'verified', limit: 1 }) });
    assert.equal(ranked.status, 200);
    assert.equal(ranked.body.rankingSource, 'persisted_match_results');
    assert.equal(ranked.body.total, 1);
    assert.equal(ranked.body.matches[0].job.id, id);
    assert.equal(ranked.body.matches[0].candidateScore.score, 80);

    const match = await request('/api/match', { method: 'POST', body: JSON.stringify({ jobId: id, profileId: 'default' }) });
    assert.equal(match.status, 200);
    assert.equal(typeof match.body.match.score, 'number');
    const created = await request(`/api/match/jobs/${id}/application`, { method: 'POST', body: JSON.stringify({ profileId: 'default' }) });
    assert.equal(created.status, 201);
    const application = created.body.application;
    assert.equal(application.specialist, 'nhs-public-sector');
    assert.equal(application.job.id, id);
    assert.equal(application.status, 'saved');
    assert.equal((await request(`/api/match/jobs/${id}/application`, { method: 'POST', body: '{}' })).status, 409);
    for (const state of ['tailoring', 'ready_to_apply']) {
      const transition = await request(`/api/applications/${application.applicationId}/status`, { method: 'PATCH', body: JSON.stringify({ status: state }) });
      assert.equal(transition.status, 200);
    }
    const status = await request(`/api/applications/${application.applicationId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'applied' }) });
    assert.equal(status.status, 200);
    assert.equal(status.body.status, 'applied');
    const persisted = await request(`/api/applications/${application.applicationId}`);
    assert.equal(persisted.body.status, 'applied');
    const closedId = fixture.jobs.find(j => j.fingerprint === 'closed').id;
    assert.equal((await request(`/api/match/jobs/${closedId}/application`, { method: 'POST', body: '{}' })).status, 404);
  } finally { await fixture.close(); }
});
