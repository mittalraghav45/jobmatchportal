import { Job } from '../models/Job.js';
import { normaliseJob, jobFingerprint } from '../models/jobSchema.js';

export async function upsertJob(rawJob) {
  const job = normaliseJob(rawJob);
  const fingerprint = jobFingerprint(job);
  if (!job.title || !job.companyId || !fingerprint) {
    throw new Error('Job requires title, companyId and a fingerprint.');
  }

  const now = new Date();
  const postedAt = job.dates?.postedAt ? new Date(job.dates.postedAt) : null;
  const closingAt = job.dates?.closingAt ? new Date(job.dates.closingAt) : null;

  const setFields = {
    schemaVersion: job.schemaVersion,
    id: job.id,
    externalId: job.externalId,
    companyId: job.companyId,
    title: job.title,
    description: job.description,
    location: job.location,
    employmentType: job.employmentType,
    department: job.department,
    source: job.source,
    'dates.postedAt': Number.isNaN(postedAt?.getTime?.()) ? null : postedAt,
    'dates.closingAt': Number.isNaN(closingAt?.getTime?.()) ? null : closingAt,
    'dates.lastSeenAt': now,
    'status.isLive': job.status?.isLive !== false,
    raw: job.raw
  };

  return Job.findOneAndUpdate(
    { fingerprint },
    {
      $set: setFields,
      $setOnInsert: { 'dates.firstSeenAt': now }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

export async function upsertJobs(rawJobs = []) {
  const results = { saved: 0, rejected: [] };
  for (const raw of rawJobs) {
    try {
      await upsertJob(raw);
      results.saved += 1;
    } catch (error) {
      results.rejected.push({ raw, error: error.message });
    }
  }
  return results;
}
