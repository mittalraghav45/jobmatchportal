const EMPLOYER_PATTERNS = {
  nhs: /\bnhs\b|nhs trust|nhs foundation trust|health board|health and social care|nhs scotland|nhs england|nhs wales|nhs northern ireland/i,
  dwp: /\bdepartment for work and pensions\b|\bdwp\b/i,
  councils: /\b(council|borough council|city council|county council|district council|metropolitan borough|unitary authority|local authority|local government)\b/i,
  universities: /\b(university|universities|higher education|institute of technology|university of)\b/i
};

function flatten(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(flatten).join(' ');
  if (typeof value === 'object') return Object.values(value).map(flatten).join(' ');
  return '';
}

export function classifyCompanyEmployerType({ company = {} } = {}) {
  const metadata = company?.metadata || {};
  const signals = [
    company.companyName,
    company.companyNumber,
    metadata.name,
    metadata.legalName,
    metadata.industry,
    metadata.category,
    metadata.organisationType,
    metadata.organizationType,
    metadata.sector,
    metadata.description,
    metadata.type,
    metadata.entityType
  ].map(flatten).join(' ');

  if (EMPLOYER_PATTERNS.nhs.test(signals)) return 'nhs';
  if (EMPLOYER_PATTERNS.dwp.test(signals)) return 'dwp';
  if (EMPLOYER_PATTERNS.councils.test(signals)) return 'councils';
  if (EMPLOYER_PATTERNS.universities.test(signals)) return 'universities';
  return 'private';
}

export function classifyCompany({ company = {} } = {}) {
  return {
    employerType: classifyCompanyEmployerType({ company }),
    classificationVersion: 'company-v1'
  };
}
