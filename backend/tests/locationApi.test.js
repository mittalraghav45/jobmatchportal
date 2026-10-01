import test, { after } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const NATIONS = ['England', 'Scotland', 'Wales', 'Northern Ireland'];

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
  test('location API smoke tests skipped when backend is not running', { skip: `Backend unavailable at ${BASE_URL}` }, () => {});
} else {
  test('location search returns the expected API contract', async () => {
    const { response, body } = await get('/api/jobs?limit=5&location=Southampton');
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.jobs));
    assert.ok(body.pagination);
    assert.equal(typeof body.pagination.total, 'number');
  });

  for (const nation of NATIONS) {
    test(`nation filter accepts ${nation}`, async () => {
      const { response, body } = await get(`/api/jobs?limit=10&nation=${encodeURIComponent(nation)}`);
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(body.jobs));
      assert.ok(body.pagination);
      assert.equal(typeof body.pagination.total, 'number');

      // The API's canonical geographic field is `nation`.
      // A job may legitimately have a generic source location such as `UK`
      // while its company metadata identifies the nation. The API enriches
      // the response with the resolved nation, so do not require the raw
      // `location` string itself to contain a city/country name.
      for (const job of body.jobs) {
        assert.equal(
          job.nation,
          nation,
          `Returned job does not match ${nation}: ${job.title} / raw location=${job.location} / nation=${job.nation}`
        );
      }
    });
  }

  test('combined nation and employer filters return a valid response', async () => {
    const { response, body } = await get('/api/jobs?limit=10&nation=England&employerType=nhs');
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.jobs));
    assert.ok(body.pagination);

    for (const job of body.jobs) {
      assert.equal(job.nation, 'England');
      assert.equal(String(job.employerType || '').toLowerCase(), 'nhs');
    }
  });
}

after(() => {});
