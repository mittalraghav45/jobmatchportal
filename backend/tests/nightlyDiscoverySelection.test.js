import test from 'node:test';
import assert from 'node:assert/strict';

function parseCompanySelection(value) {
  if (!value) return [];
  return [...new Set(String(value).split(',').map(item => item.trim().toLowerCase()).filter(Boolean))];
}

function selectCompanies(companies, selections) {
  if (!selections.length) return companies;
  const byId = new Map(companies.map(company => [String(company.companyId || '').trim().toLowerCase(), company]));
  const byName = new Map(companies.map(company => [String(company.companyName || '').trim().toLowerCase(), company]));
  return selections.map(selection => byId.get(selection) || byName.get(selection)).filter(Boolean);
}

test('parses and de-duplicates explicit company selection', () => {
  assert.deepEqual(parseCompanySelection(' Vercel,monzo,vercel, ,WISE '), ['vercel', 'monzo', 'wise']);
});

test('selects only explicitly requested companies', () => {
  const companies = [
    { companyId: '1', companyName: 'Vercel UK Limited' },
    { companyId: '2', companyName: 'Monzo Bank Limited' },
    { companyId: '3', companyName: 'Unrelated Company' }
  ];
  assert.deepEqual(selectCompanies(companies, ['2', 'vercel']), [companies[1], companies[0]]);
});

test('does not fall back to the default corpus when an explicit selection is supplied', () => {
  const companies = [{ companyId: '1', companyName: 'Vercel UK Limited' }];
  assert.deepEqual(selectCompanies(companies, ['missing']), []);
});
