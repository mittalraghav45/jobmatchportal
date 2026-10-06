const PARKED_OR_SEARCH_HOSTS = new Set([
  'sedo.com', 'www.sedo.com', 'google.com', 'www.google.com',
  'bing.com', 'www.bing.com', 'search.com', 'www.search.com'
]);

const ATS_HOST_PATTERNS = [
  /(^|\\.)myworkdayjobs\\.com$/i, /(^|\\.)greenhouse\\.io$/i,
  /(^|\\.)lever\\.co$/i, /(^|\\.)ashbyhq\\.com$/i,
  /(^|\\.)smartrecruiters\\.com$/i, /(^|\\.)recruitee\\.com$/i,
  /(^|\\.)workable\\.com$/i, /(^|\\.)icims\\.com$/i,
  /(^|\\.)successfactors\\.com$/i, /(^|\\.)oraclecloud\\.com$/i,
  /(^|\\.)jobtrain\\.co\\.uk$/i, /(^|\\.)jobs\\.ac\\.uk$/i
];

function hostOf(value = '') {
  try { return new URL(String(value).trim()).hostname.toLowerCase(); } catch { return ''; }
}

function significantTokens(value = '') {
  return String(value).toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/)
    .filter(token => token.length >= 4 && !['city','county','borough','district','council','university','hospital','trust','group','limited','ltd','plc','public','service','services'].includes(token));
}

export function evaluateApifySource(company = {}) {
  const url = String(company.careersUrl || company.careers_url || company.website || company.metadata?.careersUrl || company.metadata?.website || '').trim();
  const host = hostOf(url);
  if (!url || !host) return { valid: false, severity: 'hard', reason: 'missing_or_invalid_url', url, host };
  if (PARKED_OR_SEARCH_HOSTS.has(host) || host.endsWith('.sedo.com')) return { valid: false, severity: 'hard', reason: 'parked_or_search_domain', url, host };

  const type = String(company.employerType || '').toLowerCase();
  if (type === 'councils' || type === 'dwp') {
    if (/\\.ac\\.uk$/i.test(host) || /\\.edu(?:\\.|$)/i.test(host)) {
      return { valid: false, severity: 'hard', reason: 'education_domain_for_public_employer', url, host };
    }
  }
  if (type === 'universities' && /\\.gov\\.uk$/i.test(host)) {
    return { valid: false, severity: 'hard', reason: 'government_domain_for_university', url, host };
  }
  if (type === 'nhs' && /\\.ac\\.uk$/i.test(host) && !/nhs/i.test(host)) {
    return { valid: false, severity: 'hard', reason: 'education_domain_for_nhs', url, host };
  }

  const companyTokens = significantTokens(company.companyName);
  const hostTokens = host.replace(/\\.[a-z.]+$/i, '').split(/[.-]+/).filter(Boolean);
  const tokenMatch = companyTokens.some(token => hostTokens.some(hostToken => hostToken.includes(token) || token.includes(hostToken)));
  const atsHost = ATS_HOST_PATTERNS.some(pattern => pattern.test(host));

  return {
    valid: true,
    severity: tokenMatch || atsHost ? 'ok' : 'suspicious',
    reason: tokenMatch || atsHost ? 'plausible_source' : 'company_name_not_reflected_in_host',
    url,
    host,
    tokenMatch,
    atsHost
  };
}
