import 'dotenv/config';
import mongoose from 'mongoose';
import { Job } from '../models/Job.js';
import { MatchResult } from '../models/MatchResult.js';
import { CandidateProfile, DEFAULT_PROFILE_ID } from '../models/CandidateProfile.js';
import { matchJobToCandidate } from '../services/candidateMatching.js';
import { buildVerifiedLiveMatchFilter } from '../utils/matchFilters.js';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value ?? true];
}));

const requestedLimit = args.limit == null ? 100 : Number(args.limit);
const batchSize = Math.max(1, Number(args['batch-size'] ?? 50));
const profileId = args['profile-id'] || process.env.MATCH_PROFILE_ID || DEFAULT_PROFILE_ID;
const reconcile = args.reconcile === true || args.reconcile === 'true';

if (!Number.isFinite(requestedLimit) || requestedLimit < 1) {
  console.error('--limit must be a positive number');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

const profile = await CandidateProfile.findOne({ profileId }).lean();
if (!profile) {
  console.error(`Candidate profile '${profileId}' not found`);
  await mongoose.disconnect();
  process.exit(1);
}

const filter = buildVerifiedLiveMatchFilter(null);
const totalEligible = await Job.countDocuments(filter);
const effectiveLimit = reconcile ? totalEligible : Math.min(requestedLimit, totalEligible);
const jobs = await Job.find(filter)
  .sort({ 'quality.score': -1, 'dates.lastSeenAt': -1, _id: 1 })
  .limit(effectiveLimit)
  .lean();

if (reconcile && jobs.length !== totalEligible) {
  console.error(`Reconciliation aborted: expected ${totalEligible} eligible jobs but loaded ${jobs.length}`);
  await mongoose.disconnect();
  process.exit(1);
}

let processed = 0;
const counts = { strong: 0, possible: 0, weak: 0, strong_unconfirmed_sponsorship: 0 };

for (let i = 0; i < jobs.length; i += batchSize) {
  const batch = jobs.slice(i, i + batchSize);
  const ops = batch.map((job) => {
    const result = matchJobToCandidate(job, profile);
    counts[result.applicationFit] = (counts[result.applicationFit] ?? 0) + 1;
    return {
      updateOne: {
        filter: { profileId, jobId: job._id },
        update: { $set: { profileId, jobId: job._id, ...result, matcherVersion: 'v1', profileVersion: String(profile.metadata?.version || 'v1'), calculatedAt: new Date() } },
        upsert: true
      }
    };
  });
  await MatchResult.bulkWrite(ops, { ordered: false });
  processed += batch.length;
  console.log(`[match] processed=${processed}/${jobs.length}`);
}

let staleResultsDeleted = 0;
if (reconcile) {
  const eligibleIds = jobs.map((job) => job._id);
  const staleFilter = eligibleIds.length
    ? { profileId, jobId: { $nin: eligibleIds } }
    : { profileId };
  const cleanup = await MatchResult.deleteMany(staleFilter);
  staleResultsDeleted = cleanup.deletedCount || 0;
}

console.log(JSON.stringify({
  profileId,
  eligibleJobs: totalEligible,
  selected: jobs.length,
  processed,
  counts,
  reconcile,
  staleResultsDeleted
}, null, 2));

await mongoose.disconnect();
