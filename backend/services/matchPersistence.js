import { Job } from '../models/Job.js';
import { MatchResult } from '../models/MatchResult.js';
import { CandidateProfile, DEFAULT_PROFILE_ID } from '../models/CandidateProfile.js';
import { matchJobToCandidate } from './candidateMatching.js';

export async function persistJobMatch({ profileId = DEFAULT_PROFILE_ID, jobId }) {
  const id = String(profileId || DEFAULT_PROFILE_ID).trim() || DEFAULT_PROFILE_ID;
  const [profile, job] = await Promise.all([
    CandidateProfile.findOne({ profileId: id }).lean(),
    Job.findById(jobId).lean()
  ]);
  if (!profile) { const error = new Error(`Candidate profile '${id}' not found`); error.code = 'PROFILE_NOT_FOUND'; throw error; }
  if (!job) { const error = new Error('Job not found'); error.code = 'JOB_NOT_FOUND'; throw error; }

  const result = matchJobToCandidate(job, profile);
  return MatchResult.findOneAndUpdate(
    { profileId: id, jobId: job._id },
    {
      $set: {
        matchScore: result.matchScore,
        applicationFit: result.applicationFit,
        reasons: result.reasons,
        components: result.components,
        calculatedAt: new Date(),
        profileVersion: String(profile.metadata?.version || 'v1'),
        matcherVersion: 'v1'
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

export async function persistJobMatches({ profileId = DEFAULT_PROFILE_ID, jobs }) {
  const id = String(profileId || DEFAULT_PROFILE_ID).trim() || DEFAULT_PROFILE_ID;
  const profile = await CandidateProfile.findOne({ profileId: id }).lean();
  if (!profile) { const error = new Error(`Candidate profile '${id}' not found`); error.code = 'PROFILE_NOT_FOUND'; throw error; }
  if (!Array.isArray(jobs) || jobs.length === 0) return { processed: 0, upserted: 0, updated: 0 };

  const operations = [];
  for (const job of jobs) {
    if (!job?._id) continue;
    const result = matchJobToCandidate(job, profile);
    operations.push({
      updateOne: {
        filter: { profileId: id, jobId: job._id },
        update: { $set: {
          matchScore: result.matchScore,
          applicationFit: result.applicationFit,
          reasons: result.reasons,
          components: result.components,
          calculatedAt: new Date(),
          profileVersion: String(profile.metadata?.version || 'v1'),
          matcherVersion: 'v1'
        } },
        upsert: true
      }
    });
  }
  if (!operations.length) return { processed: 0, upserted: 0, updated: 0 };
  const write = await MatchResult.bulkWrite(operations, { ordered: false });
  return { processed: operations.length, upserted: write.upsertedCount || 0, updated: write.modifiedCount || 0 };
}

export async function listPersistedMatches({ profileId = DEFAULT_PROFILE_ID, page = 1, limit = 20, minimumScore = 0, applicationFit }) {
  const id = String(profileId || DEFAULT_PROFILE_ID).trim() || DEFAULT_PROFILE_ID;
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const filter = { profileId: id, matchScore: { $gte: Math.max(0, Number(minimumScore) || 0) } };
  if (applicationFit && ['strong', 'possible', 'weak'].includes(applicationFit)) filter.applicationFit = applicationFit;

  const [rows, total] = await Promise.all([
    MatchResult.find(filter).sort({ matchScore: -1, calculatedAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
    MatchResult.countDocuments(filter)
  ]);
  const jobIds = rows.map(row => row.jobId);
  const jobs = await Job.find({ _id: { $in: jobIds } }).select('title companyName companyId location employmentType source dates status verification quality applyUrl').lean();
  const jobMap = new Map(jobs.map(job => [String(job._id), job]));
  return {
    page: safePage,
    limit: safeLimit,
    total,
    pages: Math.ceil(total / safeLimit),
    matches: rows.map(row => ({ ...row, job: jobMap.get(String(row.jobId)) || null })).filter(row => row.job)
  };
}
