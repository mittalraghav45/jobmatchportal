import { normaliseJob, jobFingerprint } from '../models/jobSchema.js';

/**
 * Convert raw ATS records into the canonical job model, remove duplicates and
 * preserve first-seen/last-seen timestamps when an existing job is supplied.
 */
export function ingestJobs(rawJobs = [], { existing = new Map(), now = new Date().toISOString() } = {}) {
  const unique = new Map();
  const rejected = [];

  for (const raw of rawJobs) {
    const job = normaliseJob(raw);
    if (!job.title || !job.companyId) {
      rejected.push({ raw, reason: 'missing_title_or_company' });
      continue;
    }

    const fingerprint = jobFingerprint(job);
    if (!fingerprint) {
      rejected.push({ raw, reason: 'missing_fingerprint' });
      continue;
    }

    const previous = unique.get(fingerprint) || existing.get(fingerprint);
    unique.set(fingerprint, {
      ...job,
      fingerprint,
      id: previous?.id || job.id || fingerprint,
      dates: {
        ...job.dates,
        firstSeenAt: previous?.dates?.firstSeenAt || job.dates?.firstSeenAt || now,
        lastSeenAt: now,
        postedAt: job.dates?.postedAt || previous?.dates?.postedAt || null,
        closingAt: job.dates?.closingAt || previous?.dates?.closingAt || null
      }
    });
  }

  const jobs = [...unique.values()];
  const added = jobs.filter(job => !existing.has(job.fingerprint)).length;
  const updated = jobs.length - added;

  return {
    jobs,
    added,
    updated,
    duplicatesRemoved: Math.max(0, rawJobs.length - jobs.length - rejected.length),
    rejected
  };
}
