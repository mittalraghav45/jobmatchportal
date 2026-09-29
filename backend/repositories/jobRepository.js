import { Job } from '../models/Job.js';
import { normaliseJob, jobFingerprint } from '../models/jobSchema.js';

export async function upsertJob(rawJob) {
  const job = normaliseJob(rawJob);
  const fingerprint = jobFingerprint(job);
  if (!job.title || !job.companyId || !fingerprint) throw new Error('Job requires title, companyId and a fingerprint.');
  const now = new Date();
  const document = { ...job, fingerprint, 'dates.lastSeenAt': now };
  delete document.dates;
  const update = { ...document, 'dates.lastSeenAt': now };
  return Job.findOneAndUpdate(
    { fingerprint },
    { $set: update, $setOnInsert: { 'dates.firstSeenAt': now } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

export async function upsertJobs(rawJobs = []) {
  const results = { saved: 0, rejected: [] };
  for (const raw of rawJobs) {
    try { await upsertJob(raw); results.saved += 1; }
    catch (error) { results.rejected.push({ raw, error: error.message }); }
  }
  return results;
}
