import 'dotenv/config';
import mongoose from 'mongoose';
import { Job } from '../models/Job.js';
import { MatchResult } from '../models/MatchResult.js';
import { CandidateProfile, DEFAULT_PROFILE_ID } from '../models/CandidateProfile.js';
import { matchJobToCandidate } from '../services/candidateMatching.js';

const batchSize = Math.max(1, Number(process.env.MATCH_BATCH_SIZE || 100));
const profileId = process.env.MATCH_PROFILE_ID || DEFAULT_PROFILE_ID;

await mongoose.connect(process.env.MONGODB_URI);
try {
  const profile = await CandidateProfile.findOne({ profileId }).lean();
  if (!profile) throw new Error(`Candidate profile '${profileId}' not found`);

  // Scan the complete corpus without an unindexed sort. MongoDB's default
  // 32 MB in-memory sort limit can otherwise abort a full-corpus run.
  const filter = {};
  const total = await Job.countDocuments(filter);
  const counts = { strong: 0, possible: 0, weak: 0, strong_unconfirmed_sponsorship: 0 };
  const classification = { uk: 0, nonUk: 0, live: 0, notLive: 0, verified: 0, unverified: 0, processed: 0, unprocessed: 0 };
  let processed = 0;
  let ops = [];

  const cursor = Job.find(filter).lean().cursor();
  for await (const job of cursor) {
    const result = matchJobToCandidate(job, profile);
    counts[result.applicationFit] = (counts[result.applicationFit] ?? 0) + 1;

    const location = String(job.location || '').toLowerCase();
    const nation = String(job.nation || '').toLowerCase();
    const nonUkCountry = /\b(finland|germany|france|spain|italy|sweden|norway|denmark|netherlands|ireland|india|usa|united states|canada|australia)\b/.test(location);
    const ukEvidence = /\b(uk|united kingdom|england|scotland|wales|northern ireland)\b/.test(`${location} ${nation}`);
    if (nonUkCountry && !ukEvidence) classification.nonUk += 1;
    else if (ukEvidence || job.nation) classification.uk += 1;
    else classification.nonUk += 1;
    if (job.status?.isLive) classification.live += 1; else classification.notLive += 1;
    if (job.verification?.status === 'live') classification.verified += 1; else classification.unverified += 1;
    if (job.processing?.status === 'complete') classification.processed += 1; else classification.unprocessed += 1;

    ops.push({
      updateOne: {
        filter: { profileId, jobId: job._id },
        update: { $set: { profileId, jobId: job._id, ...result, matcherVersion: 'v1', profileVersion: String(profile.metadata?.version || 'v1'), calculatedAt: new Date() } },
        upsert: true
      }
    });

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

  console.log(JSON.stringify({
    profileId,
    inputJobs: total,
    processed,
    classification,
    counts,
    matcherVersion: 'v1',
    mode: 'nightly_full_corpus'
  }, null, 2));
} finally {
  await mongoose.disconnect();
}
