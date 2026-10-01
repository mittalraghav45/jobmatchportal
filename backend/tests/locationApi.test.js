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

      // If data exists, every returned job must carry either the requested nation
      // or a location signal consistent with it. A zero-result filter is valid data.
      const patterns = {
        England: /\b(england|london|southampton|manchester|birmingham|bristol|leeds|liverpool|sheffield|nottingham|newcastle|reading|oxford|cambridge|brighton|bath|exeter|portsmouth|coventry|leicester|york)\b/i,
        Scotland: /\b(scotland|edinburgh|glasgow|aberdeen|dundee|stirling|inverness|perth)\b/i,
        Wales: /\b(wales|cardiff|swansea|newport|wrexham|bangor|aberystwyth)\b/i,
        'Northern Ireland': /\b(northern ireland|belfast|derry|londonderry|lisburn|newry|armagh)\b/i
      };
      for (const job of body.jobs) {
        const signal = `${job.nation || ''} ${job.location || ''}`;
        assert.match(signal, patterns[nation], `Returned job does not match ${nation}: ${job.title} / ${job.location}`);
      }
    });
  }

  test('combined nation and employer filters return a valid response', async () => {
    const { response, body } = await get('/api/jobs?limit=10&nation=England&employerType=nhs');
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.jobs));
    assert.ok(body.pagination);
  });
}

after(() => {});
