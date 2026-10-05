export function normalizeCompanyName(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function parseCompanySelection(value) {
  if (!value) return [];
  return [...new Set(String(value)
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean))];
}

export function selectConfiguredCompanies(companies, selections) {
  if (!selections.length) return companies;

  const byId = new Map(companies.map(company => [
    String(company.companyId || '').trim().toLowerCase(),
    company
  ]));
  const byName = new Map(companies.map(company => [
    normalizeCompanyName(company.companyName),
    company
  ]));

  return selections
    .map(selection => {
      const normalizedSelection = normalizeCompanyName(selection);
      return byId.get(selection)
        || byName.get(normalizedSelection)
        || companies.find(company => normalizeCompanyName(company.companyName)
          .startsWith(normalizedSelection));
    })
    .filter(Boolean);
}
