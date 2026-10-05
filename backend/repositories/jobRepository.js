import { Job } from '../models/Job.js';
import { normaliseJob, jobFingerprint } from '../models/jobSchema.js';

function toDateOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toMongoJob(rawJob, now) {
  const job = normaliseJob(rawJob);
  const fingerprint = jobFingerprint(job);

  if (!job.title || !job.companyId || !fingerprint) {
    throw new Error('Job requires title, companyId and a fingerprint.');
  }

  const seenAt = toDateOrNull(now) || new Date();
  const postedAt = toDateOrNull(job.dates?.postedAt);
  const closingAt = toDateOrNull(job.dates?.closingAt);
  const checkedAt = toDateOrNull(job.verification?.checkedAt);
  const httpStatus = Number.isFinite(job.verification?.httpStatus) ? job.verification.httpStatus : null;

  return {
    fingerprint,
    update: {
      schemaVersion: job.schemaVersion,
      externalId: job.externalId,
      companyId: job.companyId,
      companyName: job.companyName,
      title: job.title,
      description: job.description,
      location: job.location,
      employmentType: job.employmentType,
      department: job.department,
      applyUrl: job.applyUrl,
      source: job.source,
      'dates.postedAt': postedAt,
      'dates.closingAt': closingAt,
      nation: job.nation,
      employerType: job.employerType,
      classificationVersion: job.classificationVersion,
      'dates.lastSeenAt': seenAt,
      'status.isLive': job.status?.isLive !== false,
      'verification.status': job.verification?.status || 'unknown',
      'verification.checkedAt': checkedAt,
      'verification.sourceUrl': job.verification?.sourceUrl || job.source?.url || '',
      'verification.finalUrl': job.verification?.finalUrl || '',
      'verification.httpStatus': httpStatus,
      'verification.evidenceType': job.verification?.evidenceType || '',
      'verification.evidence': job.verification?.evidence || '',
      raw: job.raw
    }
  };
}

export async function upsertJob(rawJob, { now = new Date() } = {}) {
  const { fingerprint, update } = toMongoJob(rawJob, now);

  return Job.findOneAndUpdate(
    { fingerprint },
    {
      $set: update,
      $setOnInsert: {
        fingerprint,
        'dates.firstSeenAt': toDateOrNull(now) || new Date()
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

export async function upsertJobs(rawJobs = [], { now = new Date() } = {}) {
  const operations = [];
  const rejected = [];
  const seen = new Set();

  for (const rawJob of rawJobs) {
    try {
      const { fingerprint, update } = toMongoJob(rawJob, now);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);

      operations.push({
        updateOne: {
          filter: { fingerprint },
          update: {
            $set: update,
            $setOnInsert: {
              fingerprint,
              'dates.firstSeenAt': toDateOrNull(now) || new Date()
            }
          },
          upsert: true
        }
      });
    } catch (error) {
      rejected.push({ raw: rawJob, reason: error.message });
    }
  }

  if (!operations.length) {
    return { added: 0, updated: 0, matched: 0, upserted: 0, rejected };
  }

  const result = await Job.bulkWrite(operations, { ordered: false });
  return {
    added: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
    matched: result.matchedCount || 0,
    upserted: result.upsertedCount || 0,
    rejected
  };
}

export async function countJobs(filter = {}) {
  return Job.countDocuments(filter);
}

export async function findJobs(filter = {}, options = {}) {
  const query = Job.find(filter).sort(options.sort || { 'dates.lastSeenAt': -1 });
  if (options.limit) query.limit(options.limit);
  return query.lean();
}
