const STATUS = new Set(['verified', 'not-verified', 'not-sponsor', 'unknown']);

export function normaliseSponsorshipRecord(record = {}) {
  const rawStatus = String(record.status || '').toLowerCase().trim();
  const status = STATUS.has(rawStatus) ? rawStatus : 'unknown';
  const source = record.source ? String(record.source).trim() : null;
  const checkedAt = record.checkedAt ? new Date(record.checkedAt) : null;

  return {
    status,
    sponsorLicenceNumber: record.sponsorLicenceNumber || null,
    organisationName: record.organisationName || record.name || null,
    source,
    sourceUrl: record.sourceUrl || null,
    checkedAt: checkedAt && !Number.isNaN(checkedAt.getTime()) ? checkedAt.toISOString() : null,
    evidence: record.evidence || null,
    confidence: status === 'verified' || status === 'not-sponsor' ? 'verified' : 'unknown'
  };
}

export function sponsorshipDecision(record = {}) {
  const sponsorship = normaliseSponsorshipRecord(record);
  if (sponsorship.status === 'not-sponsor') {
    return {
      status: sponsorship.status,
      shouldBlock: true,
      reason: 'Employer is verified as not holding the required sponsor status.',
      sponsorship
    };
  }
  if (sponsorship.status === 'verified') {
    return {
      status: sponsorship.status,
      shouldBlock: false,
      reason: 'Employer sponsorship status is verified.',
      sponsorship
    };
  }
  return {
    status: sponsorship.status,
    shouldBlock: false,
    reason: 'Sponsorship status is unverified; do not infer eligibility.',
    sponsorship
  };
}

export { STATUS as SPONSORSHIP_STATUSES };
