import test, { after } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

async function get(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { response, body };
}

let available = true;
try {
  const { response } = await get('/api/health');
  if (!response.ok) available = false;
} catch {
  available = false;
}

if (!available) {
  test('jobs API tests skipped when backend is not running', { skip: `Backend unavailable at ${BASE_URL}` }, () => {});
} else {
  test('jobs endpoint returns the verified-live pagination contract', async () => {
    const { response, body } = await get('/api/jobs?limit=5');
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.jobs));
    assert.equal(body.jobs.length <= 5, true);
    assert.equal(body.pagination.limit, 5);
    assert.equal(typeof body.pagination.total, 'number');
    assert.equal(typeof body.pagination.pages, 'number');
    assert.equal(body.market, 'United Kingdom');
    assert.equal(body.roleType, 'Technology');
    assert.equal(body.visibility, 'verified-live');

    for (const job of body.jobs) {
      assert.equal(job.status?.isLive, true);
      assert.equal(job.verification?.status, 'live');
      assert.ok(job.applyUrl);
    }
  });

  test('keyword search filters returned jobs', async () => {
    const { response, body } = await get('/api/jobs?limit=10&q=software');
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.jobs));
    for (const job of body.jobs) {
      const haystack = `${job.title || ''} ${job.companyName || ''} ${job.location || ''}`.toLowerCase();
      assert.match(haystack, /software/);
    }
  });

  test('location filter is accepted', async () => {
    const { response, body } = await get('/api/jobs?limit=10&location=London');
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.jobs));
    for (const job of body.jobs) assert.match(String(job.location || ''), /london/i);
  });

  for (const nation of ['England', 'Scotland', 'Wales', 'Northern Ireland']) {
    test(`nation filter works for ${nation}`, async () => {
      const { response, body } = await get(`/api/jobs?limit=10&nation=${encodeURIComponent(nation)}`);
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(body.jobs));
      for (const job of body.jobs) assert.equal(job.nation, nation);
    });
  }

  test('verified sponsorship filter returns only verified sponsors', async () => {
    const { response, body } = await get('/api/jobs?limit=10&sponsorship=verified');
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.jobs));
    for (const job of body.jobs) assert.equal(job.sponsorship, 'verified');
  });

  test('employer type filter accepts private', async () => {
    const { response, body } = await get('/api/jobs?limit=10&employerType=private');
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.jobs));
    for (const job of body.jobs) assert.equal(job.employerType, 'private');
  });

  test('work mode filter accepts remote', async () => {
    const { response, body } = await get('/api/jobs?limit=10&workMode=remote');
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.jobs));
    for (const job of body.jobs) {
      assert.match(`${job.location || ''} ${job.description || ''}`, /remote|work from home|wfh|fully remote|remote uk|uk remote/i);
    }
  });

  test('employment type filter validates input', async () => {
    const { response } = await get('/api/jobs?employmentType=not-a-real-type');
    assert.equal(response.status, 400);
  });

  test('invalid work mode returns a validation error', async () => {
    const { response } = await get('/api/jobs?workMode=teleport');
    assert.equal(response.status, 400);
  });

  test('pagination changes page without changing the page size contract', async () => {
    const first = await get('/api/jobs?limit=3&page=1');
    const second = await get('/api/jobs?limit=3&page=2');
    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 200);
    assert.equal(first.body.pagination.limit, 3);
    assert.equal(second.body.pagination.limit, 3);
    assert.equal(first.body.pagination.page, 1);
    assert.equal(second.body.pagination.page, 2);
  });

  test('sort accepts oldest and posted modes', async () => {
    for (const sort of ['oldest', 'posted']) {
      const { response, body } = await get(`/api/jobs?limit=5&sort=${sort}`);
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(body.jobs));
    }
  });
}

after(() => {});
