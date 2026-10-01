import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';
import { classifyJob } from '../utils/jobClassification.js';

dotenv.config();

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const BATCH_SIZE = Math.max(50, Math.min(1000, Number(arg('batch-size', 500)) || 500));
const LIMIT = Math.max(0, Number(arg('limit', 0)) || 0);

async function main() {
  await connectMongo();
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
  let lastId = null;
  let processed = 0;
  let changed = 0;

  while (true) {
    const filter = lastId ? { _id: { $gt: lastId } } : {};
    const remaining = LIMIT ? Math.min(BATCH_SIZE, LIMIT - processed) : BATCH_SIZE;
    if (remaining <= 0) break;

    const jobs = await Job.find(filter)
      .sort({ _id: 1 })
      .limit(remaining)
      .lean();
    if (!jobs.length) break;

    const companyIds = [...new Set(jobs.map(job => String(job.companyId || '')).filter(Boolean))];
    const companies = await Company.find({ companyId: { $in: companyIds } })
      .select('companyId companyName companyNumber metadata')
      .lean();
    const byId = new Map(companies.map(company => [String(company.companyId), company]));

    const operations = [];
    for (const job of jobs) {
      const company = byId.get(String(job.companyId));
      const classification = classifyJob({ job, company, raw: job.raw || {} });
      if (job.nation === classification.nation && job.employerType === classification.employerType && job.classificationVersion === classification.classificationVersion) continue;
      operations.push({
        updateOne: {
          filter: { _id: job._id },
          update: { $set: classification }
        }
      });
    }

    if (operations.length) {
      const result = await Job.bulkWrite(operations, { ordered: false });
      changed += result.modifiedCount || 0;
    }

    processed += jobs.length;
    lastId = jobs[jobs.length - 1]._id;
    console.log(`[enrich] processed=${processed}${LIMIT ? `/${LIMIT}` : ''} changed=${changed}`);
  }

  console.log(JSON.stringify({ processed, changed, batchSize: BATCH_SIZE }, null, 2));
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('JOB ENRICHMENT FAILED:', error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
