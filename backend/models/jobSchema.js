export const JOB_SCHEMA_VERSION = '1.0';

const clean = value => String(value ?? '').trim();

function canonicalUrl(value) {
  const raw = clean(value);
  if (!raw) return '';

  try {
    const url = new URL(raw);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }

    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.protocol}//${url.host}${pathname}${url.search}`;
  } catch {
    return raw.replace(/#.*$/, '').replace(/\/+$/, '');
  }
}

export function normaliseJob(raw = {}) {
  const rawSource = raw.source && typeof raw.source === 'object' ? raw.source : {};
  const rawVerification = raw.verification && typeof raw.verification === 'object' ? raw.verification : {};
  const sourceAts = clean(rawSource.ats || raw.ats || 'unknown').toLowerCase();
  const sourceUrl = canonicalUrl(rawSource.url || raw.url || raw.job_url || '');
  const externalId = clean(raw.externalId || raw.id || raw.job_id || raw.jobId || '');
  const title = clean(raw.title || raw.job_title || '');
  const companyId = clean(raw.companyId || raw.company_id || raw.slug || '');
  const companyName = clean(raw.companyName || raw.company_name || raw.employerName || raw.employer_name || raw.company?.name || raw.employer?.name || '');
  const location = clean(raw.location || raw.job_location || '');
  const description = clean(raw.description || raw.job_description || '');
  const postedAt = raw.postedAt || raw.posted_date || raw.posting_date || raw.posted || null;
  const closingAt = raw.closingAt || raw.closing_date || raw.closing_date_time || null;
  const applyUrl = canonicalUrl(raw.applyUrl || raw.apply_url || sourceUrl);
  const verificationStatus = clean(rawVerification.status || '').toLowerCase();
  const verification = {
    status: ['live', 'closed', 'unknown'].includes(verificationStatus) ? verificationStatus : 'unknown',
    checkedAt: rawVerification.checkedAt || null,
    sourceUrl: canonicalUrl(rawVerification.sourceUrl || sourceUrl),
    finalUrl: canonicalUrl(rawVerification.finalUrl || ''),
    httpStatus: Number.isFinite(rawVerification.httpStatus) ? rawVerification.httpStatus : null,
    evidenceType: clean(rawVerification.evidenceType || ''),
    evidence: clean(rawVerification.evidence || '')
  };

  return {
    schemaVersion: JOB_SCHEMA_VERSION,
    id: clean(raw.id || externalId),
    externalId,
    companyId,
    companyName,
    title,
    description,
    location,
    employmentType: clean(raw.employmentType || raw.employment_type || ''),
    department: clean(raw.department || ''),
    source: { ats: sourceAts, url: sourceUrl },
    applyUrl,
    dates: { postedAt, closingAt, lastSeenAt: raw.lastSeenAt || new Date().toISOString() },
    status: { isLive: raw.isLive !== false && raw.status !== 'closed' && verification.status !== 'closed' },
    verification,
    raw
  };
}

export function jobFingerprint(job) {
  const normalise = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const canonicalJobUrl = canonicalUrl(job?.source?.url || job?.url || job?.applyUrl);

  if (canonicalJobUrl) return `url|${normalise(canonicalJobUrl)}`;

  if (job?.companyId && job?.externalId) {
    return [job.companyId, job.externalId].map(normalise).filter(Boolean).join('|');
  }

  return [job?.companyId, job?.title, job?.location].map(normalise).filter(Boolean).join('|');
}
