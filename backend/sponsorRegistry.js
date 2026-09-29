const VALID_STATUSES = new Set(['verified', 'not-sponsor', 'unknown']);
const VALID_SOURCES = new Set([
  'home_office_register',
  'employer_careers_page',
  'job_advertisement',
  'company_provided',
  'companies_house',
  'manual_review'
]);

function clean(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normaliseSponsorRecord(record = {}) {
  const requestedStatus = clean(record.status)?.toLowerCase();
  const status = VALID_STATUSES.has(requestedStatus) ? requestedStatus : 'unknown';
  const source = clean(record.source)?.toLowerCase();

  return {
    organisationName: clean(record.organisationName || record.name),
    legalName: clean(record.legalName),
    companyNumber: clean(record.companyNumber),
    sponsorLicenceNumber: clean(record.sponsorLicenceNumber),
    status,
    source: VALID_SOURCES.has(source) ? source : null,
    sourceUrl: clean(record.sourceUrl),
    evidence: clean(record.evidence),
    checkedAt: isoDate(record.checkedAt),
    expiresAt: isoDate(record.expiresAt),
    confidence: status === 'verified' || status === 'not-sponsor' ? 'verified' : 'unknown'
  };
}

export function evaluateSponsorship(record = {}, options = {}) {
  const sponsor = normaliseSponsorRecord(record);
  const requireCurrentEvidence = options.requireCurrentEvidence !== false;

  if (sponsor.status === 'verified') {
    if (requireCurrentEvidence && !sponsor.checkedAt) {
      return {
        eligibleForFiltering: false,
        decision: 'unknown',
        reason: 'Sponsorship is marked verified but has no verification timestamp; it remains unverified for current filtering.',
        sponsor
      };
    }

    if (sponsor.expiresAt && new Date(sponsor.expiresAt) < new Date()) {
      return {
        eligibleForFiltering: false,
        decision: 'unknown',
        reason: 'The supplied sponsorship evidence has expired and is therefore unverified for current filtering.',
        sponsor
      };
    }

    return {
      eligibleForFiltering: true,
      decision: 'verified',
      reason: 'Current sponsorship evidence is available.',
      sponsor
    };
  }

  if (sponsor.status === 'not-sponsor') {
    return {
      eligibleForFiltering: true,
      decision: 'not-sponsor',
      reason: 'The employer is explicitly recorded as not sponsoring.',
      sponsor
    };
  }

  return {
    eligibleForFiltering: false,
    decision: 'unknown',
    reason: 'No sufficiently verified sponsorship evidence is available; sponsorship remains unverified.',
    sponsor
  };
}

export function canRecommendForSponsorship(record = {}) {
  const result = evaluateSponsorship(record);
  return result.decision !== 'not-sponsor';
}

export function mergeSponsorEvidence(...records) {
  const normalised = records.map(normaliseSponsorRecord).filter(record => record.organisationName);
  const verified = normalised.find(record => record.status === 'verified' && record.checkedAt);
  if (verified) return verified;

  const explicitNegative = normalised.find(record => record.status === 'not-sponsor' && record.checkedAt);
  if (explicitNegative) return explicitNegative;

  return normalised[0] || normaliseSponsorRecord({});
}

export { VALID_STATUSES as SPONSOR_STATUSES, VALID_SOURCES as SPONSOR_SOURCES };
