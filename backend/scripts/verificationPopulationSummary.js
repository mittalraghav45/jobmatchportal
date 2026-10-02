import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';

dotenv.config();

const base = { 'source.url': { $exists: true, $nin: ['', null] } };

async function main() {
  await connectMongo();

  const [total, live, closed, unknown, unverified] = await Promise.all([
    Job.countDocuments(base),
    Job.countDocuments({ ...base, 'verification.status': 'live' }),
    Job.countDocuments({ ...base, 'verification.status': 'closed' }),
    Job.countDocuments({ ...base, 'verification.status': 'unknown' }),
    Job.countDocuments({
      ...base,
      $or: [
        { verification: { $exists: false } },
        { 'verification.status': { $exists: false } }
      ]
    })
  ]);

  const summary = {
    total,
    live,
    closed,
    unknown,
    unverified,
    classified: live + closed + unknown,
    invariant: total === live + closed + unknown + unverified
  };

  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('VERIFICATION SUMMARY FAILED:', error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
