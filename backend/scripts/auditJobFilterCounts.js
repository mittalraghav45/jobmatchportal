import 'dotenv/config';
import mongoose from 'mongoose';
import { Job } from '../models/Job.js';
import { ukJobMongoFilter } from '../utils/ukJobLocation.js';
import { techJobMongoFilter } from '../utils/techJobRole.js';

function and(...filters) {
  return { $and: filters };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  const uk = ukJobMongoFilter();
  const tech = techJobMongoFilter();
  const ukTech = and(uk, tech);
  const live = { 'status.isLive': true };
  const verified = { 'verification.status': 'live' };
  const applyUrl = { applyUrl: { $type: 'string', $ne: '' } };
  const processing = { 'processing.status': { $in: ['complete', 'pending'] } };
  const frontendReady = and(ukTech, live, verified, applyUrl, processing);
  const verifiedLive = and(ukTech, live, verified, applyUrl);

  const [counts, processingBreakdown] = await Promise.all([
    (async () => ({
      allJobs: await Job.countDocuments({}),
      ukJobs: await Job.countDocuments(uk),
      techJobs: await Job.countDocuments(tech),
      ukTechJobs: await Job.countDocuments(ukTech),
      ukTechLive: await Job.countDocuments(and(ukTech, live)),
      ukTechLiveVerified: await Job.countDocuments(and(ukTech, live, verified)),
      ukTechLiveVerifiedApplyUrl: await Job.countDocuments(and(ukTech, live, verified, applyUrl)),
      frontendReady: await Job.countDocuments(frontendReady),
      ukTechClosed: await Job.countDocuments(and(ukTech, { 'status.isLive': false })),
      ukTechUnknownStatus: await Job.countDocuments(and(ukTech, { 'status.isLive': { $exists: false } }))
    }))(),
    Job.aggregate([
      { $match: verifiedLive },
      { $group: { _id: { $ifNull: ['$processing.status', 'MISSING'] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ])
  ]);

  console.log(JSON.stringify({ counts, processingBreakdown }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
