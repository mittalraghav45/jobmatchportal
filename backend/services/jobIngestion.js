import { normaliseJob, jobFingerprint } from '../models/jobSchema.js';

function legacyFingerprint(job) {
  const normalise = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return [job?.companyId, job?.externalId, job?.location]
    .map(normalise)
    .filter(Boolean)
    .join('|');
}

/**
 * Convert raw ATS records into the canonical job model, remove duplicates and
 * preserve first-seen/last-seen timestamps when an existing job is supplied.
 */
export function ingestJobs(rawJobs = [], { existing = new Map(), now = new Date().toISOString() } = {}) {
  const unique = new Map();
  const rejected = [];
  let duplicatesRemoved = 0;

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

    // A duplicate in the same discovery response must not become a second
    // update. Keep the first record and count later copies separately.
    if (unique.has(fingerprint)) {
      duplicatesRemoved += 1;
      continue;
    }

    // Support records/maps created before the externalId identity change. The
    // canonical fingerprint remains company + externalId; the legacy lookup is
    // only a compatibility bridge for existing in-memory data.
    const previous = existing.get(fingerprint) || existing.get(legacyFingerprint(job));
    unique.set(fingerprint, {
      ...job,
      id: previous?.id || job.id || fingerprint,
      dates: {
        ...job.dates,
        lastSeenAt: now,
        postedAt: job.dates?.postedAt || previous?.dates?.postedAt || null,
        closingAt: job.dates?.closingAt || previous?.dates?.closingAt || null,
        firstSeenAt: previous?.dates?.firstSeenAt || job.dates?.firstSeenAt || previous?.firstSeenAt || now
      },
      firstSeenAt: previous?.firstSeenAt || job.firstSeenAt || now
    });
  }

  const jobs = [...unique.values()];
  let added = 0;
  let updated = 0;

  for (const job of jobs) {
    const fingerprint = jobFingerprint(job);
    if (existing.has(fingerprint) || existing.has(legacyFingerprint(job))) updated += 1;
    else added += 1;
  }

  return {
    jobs,
    added,
    updated,
    duplicatesRemoved,
    rejected
  };
}
