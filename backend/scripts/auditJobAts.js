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

function bucket(ats) {
  return ats && ats !== 'unknown' ? ats : 'unknown';
}

async function main() {
  await connectMongo();

  const filter = {
    'source.url': { $exists: true, $nin: ['', null] }
  };

  let processed = 0;
  let known = 0;
  let inferred = 0;
  let unknown = 0;
  let invalidUrl = 0;
  let lastId = null;
  const byAts = {};

  while (true) {
    const remaining = LIMIT ? Math.min(BATCH_SIZE, LIMIT - processed) : BATCH_SIZE;
    if (remaining <= 0) break;
    const batchFilter = lastId ? { ...filter, _id: { $gt: lastId } } : filter;
    const jobs = await Job.find(batchFilter)
      .sort({ _id: 1 })
      .limit(remaining)
      .select('_id source.ats source.url applyUrl')
      .lean();
    if (!jobs.length) break;

    for (const job of jobs) {
      const urls = [job.applyUrl, job.source?.url].filter(Boolean);
      if (!urls.length) {
        invalidUrl += 1;
        processed += 1;
        continue;
      }

      const inferredAts = urls.map(inferAtsFromUrl).find(value => value && value !== 'unknown') || 'unknown';
      const currentAts = bucket(job.source?.ats);

      if (currentAts !== 'unknown') {
        known += 1;
      } else if (inferredAts !== 'unknown') {
        inferred += 1;
      } else {
        unknown += 1;
      }

      const effective = inferredAts !== 'unknown' ? inferredAts : currentAts;
      byAts[effective] = (byAts[effective] || 0) + 1;
      processed += 1;
    }

    lastId = jobs[jobs.length - 1]._id;
    console.log(`[ats-audit] processed=${processed}${LIMIT ? `/${LIMIT}` : ''} known=${known} inferred=${inferred} unknown=${unknown}`);
  }

  console.log('\n=== JOB ATS AUDIT SUMMARY ===');
  console.log(JSON.stringify({
    processed,
    known,
    inferred,
    unknown,
    invalidUrl,
    byAts
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('JOB ATS AUDIT FAILED:', error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
