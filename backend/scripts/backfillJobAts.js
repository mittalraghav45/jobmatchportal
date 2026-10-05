import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { inferAtsFromUrl } from '../services/serperJobDiscovery.js';

dotenv.config();

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const LIMIT = Math.max(0, Number(arg('limit', 0)) || 0);
const BATCH_SIZE = Math.max(10, Math.min(1000, Number(arg('batch-size', 500)) || 500));
const FORCE = arg('force', 'false') === 'true';

async function main() {
  await connectMongo();
  const filter = {
    'source.url': { $exists: true, $nin: ['', null] },
    ...(FORCE ? {} : { $or: [
      { 'source.ats': { $exists: false } },
      { 'source.ats': { $in: ['', 'unknown', 'serper'] } }
    ] })
  };

  let processed = 0;
  let updated = 0;
  let recognised = 0;
  let unknown = 0;
  let lastId = null;

  while (true) {
    const remaining = LIMIT ? Math.min(BATCH_SIZE, LIMIT - processed) : BATCH_SIZE;
    if (remaining <= 0) break;
    const batchFilter = lastId ? { ...filter, _id: { $gt: lastId } } : filter;
    const jobs = await Job.find(batchFilter).sort({ _id: 1 }).limit(remaining).select('_id source.ats source.url applyUrl').lean();
    if (!jobs.length) break;

    const operations = [];
    for (const job of jobs) {
      const urls = [job.applyUrl, job.source?.url].filter(Boolean);
      const ats = urls.map(inferAtsFromUrl).find(value => value && value !== 'unknown') || 'unknown';
      processed += 1;
      if (ats === 'unknown') {
        unknown += 1;
        continue;
      }
      recognised += 1;
      if (FORCE || job.source?.ats !== ats) {
        operations.push({ updateOne: { filter: { _id: job._id }, update: { $set: { 'source.ats': ats } } } });
      }
    }

    if (operations.length) {
      const result = await Job.bulkWrite(operations, { ordered: false });
      updated += result.modifiedCount || 0;
    }
    lastId = jobs[jobs.length - 1]._id;
    console.log(`[ats-backfill] processed=${processed}${LIMIT ? `/${LIMIT}` : ''} recognised=${recognised} unknown=${unknown} updated=${updated}`);
  }

  console.log('\n=== JOB ATS BACKFILL SUMMARY ===');
  console.log(JSON.stringify({ processed, recognised, unknown, updated, force: FORCE }, null, 2));
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('JOB ATS BACKFILL FAILED:', error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
