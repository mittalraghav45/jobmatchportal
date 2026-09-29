export const COMPANY_SCHEMA_VERSION = '1.0';

const clean = value => String(value ?? '').trim();

export function normaliseCompany(raw = {}) {
  return {
    schemaVersion: COMPANY_SCHEMA_VERSION,
    companyId: clean(raw.company_id || raw.companyId || raw.id),
    companyName: clean(raw.company_name || raw.companyName || raw.name),
    companyNumber: clean(raw.company_number || raw.companyNumber || ''),
    website: clean(raw.website || ''),
    careersUrl: clean(raw.careers_url || raw.careersUrl || ''),
    enabled: raw.enabled !== false && String(raw.enabled ?? true).toLowerCase() !== 'false',
    priority: clean(raw.priority || 'medium'),
    ats: clean(raw.ats || 'unknown').toLowerCase(),
    sponsorship: clean(raw.sponsorship || 'unknown').toLowerCase(),
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {}
  };
}

export function validateCompany(company) {
  const errors = [];
  if (!company.companyId) errors.push('companyId is required');
  if (!company.companyName) errors.push('companyName is required');
  if (!['low','medium','high'].includes(company.priority)) errors.push('priority must be low, medium or high');
  if (!['verified','not-sponsor','unknown'].includes(company.sponsorship)) errors.push('sponsorship must be verified, not-sponsor or unknown');
  return { valid: errors.length === 0, errors };
}
