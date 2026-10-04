import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { buildJobQualityFields } from '../services/jobQuality.js';

dotenv.config();

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const LIMIT = Math.max(0, Number(arg('limit', 0)) || 0);
const BATCH_SIZE = Math.max(10, Math.min(1000, Number(arg('batch-size', 500)) || 500));

async function main() {
  await connectMongo();
  const filter = {};
  let processed = 0;
  let lastId = null;
  const summary = { fresh: 0, recent: 0, ageing: 0, stale: 0, expired: 0, unknown: 0 };

  while (true) {
    const remaining = LIMIT ? Math.min(BATCH_SIZE, LIMIT - processed) : BATCH_SIZE;
    if (remaining <= 0) break;
    const batchFilter = lastId ? { ...filter, _id: { $gt: lastId } } : filter;
    const jobs = await Job.find(batchFilter).sort({ _id: 1 }).limit(remaining).lean();
    if (!jobs.length) break;

    const now = new Date();
    const ops = jobs.map(job => {
      const quality = buildJobQualityFields(job, now);
      summary[quality.freshness] += 1;
      return { updateOne: { filter: { _id: job._id }, update: { $set: { quality: { ...quality, calculatedAt: now } } } } };
    });
    await Job.bulkWrite(ops, { ordered: false });
    processed += jobs.length;
    lastId = jobs[jobs.length - 1]._id;
    console.log(`[quality] processed=${processed}${LIMIT ? `/${LIMIT}` : ''}`);
  }

  console.log('\n=== JOB QUALITY SCORING SUMMARY ===');
  console.log(JSON.stringify({ processed, ...summary }, null, 2));
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('JOB QUALITY SCORING FAILED:', error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
