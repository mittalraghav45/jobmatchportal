export const JOB_SCHEMA_VERSION = '1.1';

const clean = value => String(value ?? '').trim();

function normaliseAts(value, depth = 0) {
  if (depth > 4 || value === undefined || value === null || value === '') return 'unknown';

  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    return text && text !== '[object Object]' ? text.toLowerCase() : 'unknown';
  }

  if (typeof value === 'object') {
    const keys = ['ats', 'name', 'type', 'platform', 'provider', 'slug', 'id'];
    for (const key of keys) {
      const candidate = normaliseAts(value[key], depth + 1);
      if (candidate !== 'unknown') return candidate;
    }
  }

  return 'unknown';
}

function firstHttpUrl(...values) {
  const queue = values.flat();
  const seen = new Set();

  while (queue.length) {
    const value = queue.shift();
    if (typeof value === 'string') {
      const url = value.trim();
      if (/^https?:\/\//i.test(url)) return url;
      continue;
    }

    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);

    // ATS/application payloads are not fully consistent across sources. Walk
    // the common wrapper objects as well as direct URL fields so we never
    // lose a real application URL merely because it is nested one level deeper.
    for (const key of [
      'application', 'apply', 'job', 'source',
      'applicationUrl', 'application_url', 'applyUrl', 'apply_url', 'atsUrl',
      'ats_url', 'jobUrl', 'job_url', 'url'
    ]) {
      if (value[key] !== undefined) queue.push(value[key]);
    }
  }

  return '';
}

export function normaliseJob(raw = {}) {
  const sourceValue = raw.source?.ats ?? raw.ats ?? raw.source ?? 'unknown';
  const source = normaliseAts(sourceValue);
  const externalId = clean(raw.externalId || raw.id || raw.job_id || raw.jobId || '');
  const title = clean(raw.title || raw.job_title || '');
  const companyId = clean(raw.companyId || raw.company_id || raw.slug || '');
  const companyName = clean(raw.companyName || raw.company_name || raw.employerName || raw.employer_name || raw.company?.name || raw.employer?.name || '');
  const location = clean(raw.location || raw.job_location || '');
  const description = clean(raw.description || raw.job_description || '');
  const postedAt = raw.postedAt || raw.posted_date || raw.posting_date || raw.posted || null;
  const closingAt = raw.closingAt || raw.closing_date || raw.closing_date_time || raw.closing || null;
  const applicationUrl = firstHttpUrl(
    raw.applicationUrl,
    raw.application_url,
    raw.applyUrl,
    raw.apply_url,
    raw.atsUrl,
    raw.ats_url,
    raw.jobUrl,
    raw.job_url,
    raw.url,
    raw.source?.url,
    raw.source?.applicationUrl,
    raw.source?.application_url,
    raw.raw
  );

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
    source: { ats: source, url: applicationUrl },
    dates: { postedAt, closingAt, lastSeenAt: raw.lastSeenAt || new Date().toISOString() },
    status: { isLive: raw.isLive !== false && raw.status !== 'closed' },
    raw
  };
}

export function jobFingerprint(job) {
  const normalise = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return [job.companyId, job.externalId || job.title, job.location].map(normalise).filter(Boolean).join('|');
}
