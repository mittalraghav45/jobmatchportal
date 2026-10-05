import 'dotenv/config';
import mongoose from 'mongoose';
import { Job } from '../models/Job.js';
import { MatchResult } from '../models/MatchResult.js';
import { CandidateProfile, DEFAULT_PROFILE_ID } from '../models/CandidateProfile.js';
import { matchJobToCandidate } from '../services/candidateMatching.js';
import { buildVerifiedLiveMatchFilter } from '../utils/matchFilters.js';

const batchSize = Math.max(1, Number(process.env.MATCH_BATCH_SIZE || 100));
const profileId = process.env.MATCH_PROFILE_ID || DEFAULT_PROFILE_ID;

await mongoose.connect(process.env.MONGODB_URI);
try {
  const profile = await CandidateProfile.findOne({ profileId }).lean();
  if (!profile) throw new Error(`Candidate profile '${profileId}' not found`);

  const filter = buildVerifiedLiveMatchFilter(null);
  const total = await Job.countDocuments(filter);
  const counts = { strong: 0, possible: 0, weak: 0, strong_unconfirmed_sponsorship: 0 };
  let processed = 0;
  let ops = [];

  const cursor = Job.find(filter).sort({ 'quality.score': -1, 'dates.lastSeenAt': -1, _id: 1 }).lean().cursor();
  for await (const job of cursor) {
    const result = matchJobToCandidate(job, profile);
    counts[result.applicationFit] = (counts[result.applicationFit] ?? 0) + 1;
    ops.push({ updateOne: { filter: { profileId, jobId: job._id }, update: { $set: { profileId, jobId: job._id, ...result, matcherVersion: 'v1', profileVersion: String(profile.metadata?.version || 'v1'), calculatedAt: new Date() } }, upsert: true } });
    if (ops.length >= batchSize) {
      await MatchResult.bulkWrite(ops, { ordered: false });
      processed += ops.length;
      ops = [];
      console.log(`[nightly-match] processed=${processed}/${total}`);
    }
  }
  if (ops.length) {
    await MatchResult.bulkWrite(ops, { ordered: false });
    processed += ops.length;
    console.log(`[nightly-match] processed=${processed}/${total}`);
  }

  console.log(JSON.stringify({ profileId, eligibleJobs: total, processed, counts, matcherVersion: 'v1', mode: 'nightly' }, null, 2));
} finally {
  await mongoose.disconnect();
}
