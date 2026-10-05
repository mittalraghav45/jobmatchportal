import 'dotenv/config';
import mongoose from 'mongoose';
import { Job } from '../models/Job.js';
import { MatchResult } from '../models/MatchResult.js';
import { CandidateProfile, DEFAULT_PROFILE_ID } from '../models/CandidateProfile.js';
import { matchJobToCandidate } from '../services/candidateMatching.js';
import { classifyNightlyJob, incrementReasonCounts } from '../utils/nightlyDiagnostics.js';

const batchSize = Math.max(1, Number(process.env.MATCH_BATCH_SIZE || 100));
const calibrationLimit = Math.max(1, Number(process.env.MATCH_CALIBRATION_LIMIT || 25));
const profileId = process.env.MATCH_PROFILE_ID || DEFAULT_PROFILE_ID;

await mongoose.connect(process.env.MONGODB_URI);
try {
  const profile = await CandidateProfile.findOne({ profileId }).lean();
  if (!profile) throw new Error(`Candidate profile '${profileId}' not found`);
  const profileVersion = String(profile.activeVersion || profile.metadata?.version || 'v1');

  const filter = {};
  const total = await Job.countDocuments(filter);
  const counts = { strong: 0, possible: 0, weak: 0, strong_unconfirmed_sponsorship: 0 };
  const eligibleCounts = { strong: 0, possible: 0, weak: 0, strong_unconfirmed_sponsorship: 0 };
  const classification = {
    uk: 0, nonUk: 0, ukConfirmed: 0, ukAmbiguous: 0, nonUkConfirmed: 0, ukEvidence: {},
    live: 0, notLive: 0, verified: 0, unverified: 0,
    sourceProcessingComplete: 0, sourceProcessingIncomplete: 0, eligibleUk: 0, ineligibleUk: 0
  };
  const exclusionReasons = {};
  const calibrationCandidates = [];
  let processed = 0;
  let ops = [];

  const cursor = Job.find(filter).lean().cursor();
  for await (const job of cursor) {
    const result = matchJobToCandidate(job, profile);
    counts[result.applicationFit] = (counts[result.applicationFit] ?? 0) + 1;

    const eligibility = classifyNightlyJob(job);
    if (eligibility.uk) {
      classification.uk += 1;
      classification.ukConfirmed += 1;
      classification.ukEvidence[eligibility.ukEvidenceSource] = (classification.ukEvidence[eligibility.ukEvidenceSource] || 0) + 1;
    } else if (eligibility.ukStatus === 'non_uk') {
      classification.nonUk += 1;
      classification.nonUkConfirmed += 1;
    } else {
      classification.nonUk += 1;
      classification.ukAmbiguous += 1;
    }
    if (eligibility.live) classification.live += 1; else classification.notLive += 1;
    if (eligibility.verified) classification.verified += 1; else classification.unverified += 1;
    if (eligibility.processingComplete) classification.sourceProcessingComplete += 1; else classification.sourceProcessingIncomplete += 1;

    if (eligibility.eligible) {
      classification.eligibleUk += 1;
      eligibleCounts[result.applicationFit] = (eligibleCounts[result.applicationFit] ?? 0) + 1;
      calibrationCandidates.push({
        jobId: String(job._id), title: job.title || '', companyName: job.companyName || '', location: job.location || '',
        applyUrl: job.applyUrl || job.source?.url || '', matchScore: result.matchScore,
        applicationFit: result.applicationFit, components: result.components, reasons: result.reasons,
        ukEvidenceSource: eligibility.ukEvidenceSource
      });
    } else {
      classification.ineligibleUk += 1;
      incrementReasonCounts(exclusionReasons, eligibility.reasons);
    }

    ops.push({
      updateOne: {
        filter: { profileId, profileVersion, jobId: job._id },
        update: { $set: {
          profileId, profileVersion, jobId: job._id, ...result,
          eligibility: { ...eligibility, calculatedAt: new Date() },
          matcherVersion: 'v1', calculatedAt: new Date()
        } },
        upsert: true
      }
    });

    if (ops.length >= batchSize) {
      await MatchResult.bulkWrite(ops, { ordered: false });
      processed += ops.length;
      ops = [];
      console.log(`[nightly-match] profile=${profileId}@${profileVersion} processed=${processed}/${total}`);
    }
  }

  if (ops.length) {
    await MatchResult.bulkWrite(ops, { ordered: false });
    processed += ops.length;
    console.log(`[nightly-match] profile=${profileId}@${profileVersion} processed=${processed}/${total}`);
  }

  calibrationCandidates.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    if ((b.components.skills ?? 0) !== (a.components.skills ?? 0)) return (b.components.skills ?? 0) - (a.components.skills ?? 0);
    return (b.components.title ?? 0) - (a.components.title ?? 0);
  });

  const topMatches = calibrationCandidates.slice(0, calibrationLimit);
  const scoreDistribution = calibrationCandidates.reduce((distribution, candidate) => {
    const bucket = Math.floor(candidate.matchScore / 10) * 10;
    const key = `${bucket}-${Math.min(bucket + 9, 100)}`;
    distribution[key] = (distribution[key] ?? 0) + 1;
    return distribution;
  }, {});

  console.log(JSON.stringify({
    profileId, profileVersion, inputJobs: total, processed, classification, exclusionReasons,
    counts, eligibleCounts,
    calibration: { eligibleJobs: calibrationCandidates.length, scoreDistribution, topMatches },
    matcherVersion: 'v1', mode: 'nightly_full_corpus'
  }, null, 2));
} finally {
  await mongoose.disconnect();
}
