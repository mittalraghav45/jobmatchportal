import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';
import { extractCompanyName } from '../utils/companyName.js';

dotenv.config();

const arg = (name, fallback = undefined) => {
  const prefix = `--${name}=`;
  const value = process.argv.find(item => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
};

const toInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const START = Math.max(1, toInt(arg('start', '1'), 1));
const END = Math.max(START, toInt(arg('end', '0'), 0));
const LIMIT = toInt(arg('limit', '0'), 0);
const BATCH_SIZE = Math.max(1, toInt(arg('batch-size', '100'), 100));
const RUN_ID = arg('run-id', `missing-job-companies-${new Date().toISOString().slice(0, 10)}`);

const checkpointSchema = new mongoose.Schema({
  runId: { type: String, required: true },
  companyId: { type: String, required: true },
  status: { type: String, required: true },
  companyName: { type: String, default: '' },
  reason: { type: String, default: '' },
  processedAt: { type: Date, default: Date.now }
}, { collection: 'missing_job_company_checkpoints', timestamps: true });
checkpointSchema.index({ runId: 1, companyId: 1 }, { unique: true });
const Checkpoint = mongoose.models.MissingJobCompanyCheckpoint || mongoose.model('MissingJobCompanyCheckpoint', checkpointSchema);

function chooseEmployerType(jobs) {
  const counts = new Map();
  for (const job of jobs) {
    const type = String(job.employerType || '').trim().toLowerCase();
    if (!['nhs', 'councils', 'universities', 'dwp', 'private'].includes(type)) continue;
    counts.set(type, (counts.get(type) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'private';
}

async function main() {
  console.log('=== Missing Job Company Resolver ===');
  console.log(`Run ID: ${RUN_ID}`);
  console.log(`Company range: ${START}-${END || 'end'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  if (LIMIT) console.log(`Limit: ${LIMIT}`);

  await connectMongo();
  console.log(`MongoDB connected: ${mongoose.connection.name}`);

  const completed = new Set((await Checkpoint.find({ runId: RUN_ID, status: 'completed' }).select('companyId').lean()).map(x => String(x.companyId)));
  const jobCompanyIds = await Job.distinct('companyId');
  const ids = jobCompanyIds.map(String).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const selected = ids.slice(START - 1, END || ids.length).filter(id => !completed.has(id));
  const limited = LIMIT ? selected.slice(0, LIMIT) : selected;

  console.log(`Job company IDs: ${ids.length}`);
  console.log(`Missing-company candidates: ${limited.length}`);

  let scanned = 0;
  let created = 0;
  let skippedExisting = 0;
  let unresolved = 0;

  for (let offset = 0; offset < limited.length; offset += BATCH_SIZE) {
    const batch = limited.slice(offset, offset + BATCH_SIZE);
    const existing = await Company.find({ companyId: { $in: batch } }).select('companyId').lean();
    const existingIds = new Set(existing.map(x => String(x.companyId)));

    for (const companyId of batch) {
      scanned += 1;
      if (existingIds.has(companyId)) {
        skippedExisting += 1;
        continue;
      }

      const jobs = await Job.find({ companyId }).select('companyId companyName employerType raw title source').sort({ 'dates.lastSeenAt': -1 }).limit(100).lean();
      const names = jobs.map(job => extractCompanyName({ companyName: job.companyName, ...(job.raw || {}) })).filter(Boolean);
      const companyName = names[0] || '';

      if (!companyName) {
        unresolved += 1;
        await Checkpoint.updateOne(
          { runId: RUN_ID, companyId },
          { $set: { runId: RUN_ID, companyId, status: 'unresolved', reason: 'No company name found in job or raw source data', processedAt: new Date() } },
          { upsert: true }
        );
        continue;
      }

      const employerType = chooseEmployerType(jobs);
      await Company.updateOne(
        { companyId },
        {
          $setOnInsert: {
            companyId,
            companyName,
            employerType,
            sponsorship: 'unknown',
            ats: 'unknown',
            website: '',
            careersUrl: '',
            metadata: {
              resolutionStatus: 'pending',
              resolutionSource: 'job-data',
              jobCountAtResolution: jobs.length
            }
          }
        },
        { upsert: true }
      );

      created += 1;
      await Checkpoint.updateOne(
        { runId: RUN_ID, companyId },
        { $set: { runId: RUN_ID, companyId, status: 'completed', companyName, processedAt: new Date() } },
        { upsert: true }
      );
    }

    console.log(`[progress] scanned=${scanned} created=${created} skippedExisting=${skippedExisting} unresolved=${unresolved}`);
  }

  console.log(JSON.stringify({ runId: RUN_ID, scanned, created, skippedExisting, unresolved, totalJobCompanyIds: ids.length }, null, 2));
  await mongoose.connection.close();
  console.log('MongoDB connection closed.');
}

main().catch(async error => {
  console.error('MISSING JOB COMPANY RESOLUTION FAILED:', error.message);
  try { await mongoose.connection.close(); } catch {}
  process.exit(1);
});
