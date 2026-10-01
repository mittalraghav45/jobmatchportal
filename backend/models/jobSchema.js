export const JOB_SCHEMA_VERSION = '1.0';

const clean = value => String(value ?? '').trim();

export function normaliseJob(raw = {}) {
  const source = clean(raw.source || raw.ats || 'unknown').toLowerCase();
  const externalId = clean(raw.externalId || raw.id || raw.job_id || raw.jobId || '');
  const title = clean(raw.title || raw.job_title || '');
  const companyId = clean(raw.companyId || raw.company_id || raw.slug || '');
  const companyName = clean(raw.companyName || raw.company_name || raw.employerName || raw.employer_name || raw.company?.name || raw.employer?.name || '');
  const location = clean(raw.location || raw.job_location || '');
  const description = clean(raw.description || raw.job_description || '');
  const postedAt = raw.postedAt || raw.posted_date || raw.posting_date || raw.posted || null;
  const closingAt = raw.closingAt || raw.closing_date || raw.closing_date_time || null;
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
    source: { ats: source, url: clean(raw.url || raw.job_url || '') },
    dates: { postedAt, closingAt, lastSeenAt: raw.lastSeenAt || new Date().toISOString() },
    status: { isLive: raw.isLive !== false && raw.status !== 'closed' },
    raw
  };
}

export function jobFingerprint(job) {
  const normalise = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return [job.companyId, job.externalId || job.title, job.location].map(normalise).filter(Boolean).join('|');
}
