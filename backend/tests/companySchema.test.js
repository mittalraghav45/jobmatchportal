import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseCompany, validateCompany } from '../config/companySchema.js';

test('normalises supported company input fields', () => {
  const company = normaliseCompany({ company_id:'demo-1', company_name:'Demo Co', company_number:'123', enabled:true, priority:'high', sponsorship:'unknown' });
  assert.equal(company.companyId, 'demo-1');
  assert.equal(company.companyName, 'Demo Co');
  assert.equal(company.enabled, true);
  assert.equal(validateCompany(company).valid, true);
});

test('rejects invalid company priority and sponsorship state', () => {
  const result = validateCompany(normaliseCompany({ company_id:'x', company_name:'X', priority:'critical', sponsorship:'maybe' }));
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 2);
});
