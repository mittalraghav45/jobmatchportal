import 'dotenv/config';
import mongoose from 'mongoose';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) throw new Error('Missing MONGODB_URI/MONGO_URI');

const APPLY = process.argv.includes('--apply');

const ALIASES = {
  deliveroo: /^deliveroo(?:\s|$)/i,
  monzo: /^monzo(?:\s|$)/i,
  wise: /^wise(?:\s|$)/i
};

await mongoose.connect(MONGO_URI);

try {
  const orphanIds = ['deliveroo', 'monzo', 'wise'];
  const mappings = [];
  const errors = [];

  for (const orphanId of orphanIds) {
    const jobs = await Job.find({
      'status.isLive': true,
      companyId: orphanId
    }).select('_id companyId companyName title applyUrl').lean();

    if (!jobs.length) continue;

    const candidates = await Company.find({
      companyName: ALIASES[orphanId]
    }).select('companyId companyName companyNumber website careersUrl ats enabled').lean();

    if (candidates.length !== 1) {
      errors.push({
        orphanId,
        liveJobCount: jobs.length,
        candidateCount: candidates.length,
        candidates
      });
      continue;
    }

    mappings.push({
      orphanId,
      canonicalCompany: candidates[0],
      liveJobCount: jobs.length
    });
  }

  const summary = {
    dryRun: !APPLY,
    mappings,
    errors,
    totalJobsToRepair: mappings.reduce((sum, x) => sum + x.liveJobCount, 0),
    updated: 0
  };

  if (errors.length) {
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = 2;
  } else if (APPLY) {
    for (const mapping of mappings) {
      const result = await Job.updateMany(
        { 'status.isLive': true, companyId: mapping.orphanId },
        { $set: { companyId: String(mapping.canonicalCompany.companyId), companyName: mapping.canonicalCompany.companyName } }
      );
      summary.updated += result.modifiedCount;
    }
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(JSON.stringify(summary, null, 2));
  }
} finally {
  await mongoose.disconnect();
}
