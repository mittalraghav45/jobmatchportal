const ATS_VALUES = new Set(['greenhouse','lever','ashby','workday','smartrecruiters','workable','teamtailor','pinpoint','recruitee','bamboohr','nhs','unknown']);

function clean(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normaliseJob(raw = {}) {
  const url = clean(raw.url || raw.jobUrl || raw.applyUrl);
  const atsValue = clean(raw.ats)?.toLowerCase();
  const ats = ATS_VALUES.has(atsValue) ? atsValue : 'unknown';
  const postingDate = dateOrNull(raw.posting_date || raw.postingDate || raw.publishedAt || raw.createdAt);
  const closingDate = dateOrNull(raw.closing_date || raw.closingDate || raw.closeDate || raw.expirationDate);

  return {
    id: clean(raw.id) || (url ? `job-${Buffer.from(url).toString('base64url').slice(0, 32)}` : null),
    title: clean(raw.title) || 'Untitled role',
    companyName: clean(raw.companyName || raw.company || raw.organisationName),
    location: clean(raw.location) || 'UK',
    department: clean(raw.department),
    employmentType: clean(raw.employmentType || raw.employment_type),
    description: clean(raw.description) || '',
    url,
    applyUrl: clean(raw.applyUrl || raw.url),
    posting_date: postingDate,
    closing_date: closingDate,
    ats,
    source_verified: raw.source_verified !== false,
    isTech: Boolean(raw.isTech),
    salaryMin: Number.isFinite(raw.salaryMin) ? raw.salaryMin : null,
    salaryMax: Number.isFinite(raw.salaryMax) ? raw.salaryMax : null,
    salaryCurrency: clean(raw.salaryCurrency),
    sponsorshipEvidence: raw.sponsorshipEvidence || null
  };
}

export function getJobKey(job) {
  return job.url || `${job.ats || 'unknown'}:${job.id || job.title}`;
}

export function deduplicateJobs(jobs = []) {
  const seen = new Set();
  return jobs.map(normaliseJob).filter(job => {
    const key = getJobKey(job);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function withLiveStatus(job, now = Date.now()) {
  const posting = dateOrNull(job.posting_date);
  const closing = dateOrNull(job.closing_date);
  const closeTime = closing ? new Date(closing).getTime() : null;
  const isLive = closeTime === null || closeTime >= now;

  return {
    ...job,
    posting_date: posting,
    closing_date: closing,
    postingDate: posting,
    closingDate: closing,
    isLive,
    liveStatus: isLive ? 'open' : 'closed',
    lastVerifiedAt: new Date(now).toISOString(),
    daysAgo: posting ? Math.max(0, Math.floor((now - new Date(posting).getTime()) / 86400000)) : null,
    daysUntilClose: closing ? Math.ceil((new Date(closing).getTime() - now) / 86400000) : null
  };
}
