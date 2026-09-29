import { normaliseJob, jobFingerprint } from '../models/jobSchema.js';

export function ingestJobs(rawJobs = [], { existing = new Map(), now = new Date().toISOString() } = {}) {
  const unique = new Map();
  const rejected = [];

  for (const raw of rawJobs) {
    const job = normaliseJob(raw);
    if (!job.title || !job.companyId) {
      rejected.push({ raw, reason: 'missing_title_or_company' });
      continue;
    }
    job.dates.lastSeenAt = now;
    const fingerprint = jobFingerprint(job);
    if (!fingerprint) {
      rejected.push({ raw, reason: 'missing_fingerprint' });
      continue;
    }
    const previous = unique.get(fingerprint) || existing.get(fingerprint);
    unique.set(fingerprint, {
      ...job,
      id: previous?.id || job.id || fingerprint,
      firstSeenAt: previous?.firstSeenAt || now,
      dates: { ...job.dates, lastSeenAt: now }
    });
  }

  const jobs = [...unique.values()];
  const added = jobs.filter(job => !existing.has(jobFingerprint(job))).length;
  const updated = jobs.length - added;
  return { jobs, added, updated, duplicatesRemoved: rawJobs.length - jobs.length - rejected.length, rejected };
}
