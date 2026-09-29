import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCompanies, getEnabledCompanies } from '../config/companies.js';

test('loads enabled and disabled companies from CSV', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobmatch-companies-'));
  const file = path.join(dir, 'companies.csv');
  fs.writeFileSync(file, 'company_id,company_name,enabled,priority,careers_url\na,Alpha,true,high,https://alpha.test\nb,Beta,false,low,\n');
  const all = loadCompanies(file);
  const enabled = getEnabledCompanies(file);
  assert.equal(all.length, 2);
  assert.equal(all[0].enabled, true);
  assert.equal(enabled.length, 1);
  assert.equal(enabled[0].company_id, 'a');
});
