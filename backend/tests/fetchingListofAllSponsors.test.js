import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichCompanyIdentity } from '../fetchingListofAllSponsors.js';

test('Companies House enrichment verifies company identity but preserves sponsor status separately', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => {
    if (String(url).includes('/search/companies')) {
      return { ok: true, status: 200, json: async () => ({ items: [{ company_number: '01234567', title: 'Example Ltd' }] }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ company_name: 'EXAMPLE LTD', company_status: 'active', sic_codes: ['62012'] })
    };
  };

  try {
    const result = await enrichCompanyIdentity({
      name: 'Example Ltd',
      sponsorStatus: 'unknown'
    }, 'test-key');

    assert.equal(result.companyVerification.verified, true);
    assert.equal(result.companyNumber, '01234567');
    assert.deepEqual(result.companyVerification.sicCodes, ['62012']);
    assert.equal(result.sponsorStatus, 'unknown');
  } finally {
    global.fetch = originalFetch;
  }
});

test('Companies House identity success does not turn an unknown sponsor into verified', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => String(url).includes('/search/companies')
    ? { ok: true, status: 200, json: async () => ({ items: [{ company_number: '01234567', title: 'Example Ltd' }] }) }
    : { ok: true, status: 200, json: async () => ({ company_name: 'EXAMPLE LTD', company_status: 'active', sic_codes: [] }) };

  try {
    const result = await enrichCompanyIdentity({ name: 'Example Ltd' }, 'test-key');
    assert.equal(result.sponsorStatus, 'unknown');
    assert.notEqual(result.sponsorStatus, 'verified');
  } finally {
    global.fetch = originalFetch;
  }
});
