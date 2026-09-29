const HOST_RULES = [
  ['greenhouse', /(?:boards\.)?greenhouse\.io/i],
  ['lever', /jobs\.lever\.co|jobs\.lever\.co/i],
  ['ashby', /jobs\.ashbyhq\.com|ashbyhq\.com/i],
  ['workday', /myworkdayjobs\.com/i],
  ['smartrecruiters', /smartrecruiters\.com/i],
  ['workable', /workable\.com/i],
  ['teamtailor', /teamtailor\.com/i],
  ['pinpoint', /pinpointhq\.com/i],
  ['recruitee', /recruitee\.com/i],
  ['bamboohr', /bamboohr\.com/i],
  ['nhs', /jobs\.nhs\.uk/i]
];

export const SUPPORTED_ATS = HOST_RULES.map(([name]) => name);

export function normaliseSlug(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export function detectATS(careersUrl = '') {
  const value = String(careersUrl || '').trim();
  if (!value || /google\.com\/search/i.test(value)) return { ats: 'unknown', confidence: 0, reason: 'no_direct_careers_url' };
  for (const [ats, pattern] of HOST_RULES) {
    if (pattern.test(value)) return { ats, confidence: 1, reason: 'careers_url_host_match' };
  }
  return { ats: 'unknown', confidence: 0, reason: 'unsupported_or_unrecognised_host' };
}

export function resolveATS({ ats = 'auto', careersUrl = '' } = {}) {
  const requested = String(ats || 'auto').trim().toLowerCase();
  if (requested && requested !== 'auto') {
    return SUPPORTED_ATS.includes(requested)
      ? { ats: requested, confidence: 1, reason: 'explicit_configuration' }
      : { ats: 'unknown', confidence: 0, reason: 'unsupported_configured_ats' };
  }
  return detectATS(careersUrl);
}

export function extractATSContext(company = {}) {
  const resolved = resolveATS(company);
  return {
    ...company,
    ats: resolved.ats,
    atsConfidence: resolved.confidence,
    atsDetectionReason: resolved.reason,
    slug: company.atsSlug || company.slug || normaliseSlug(company.name)
  };
}
