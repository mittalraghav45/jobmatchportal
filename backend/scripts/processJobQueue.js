import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { verifyJobSource } from '../services/jobSourceVerification.js';

dotenv.config();

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const BATCH_SIZE = Math.max(1, Math.min(200, Number(arg('batch-size', 50)) || 50));
const CONCURRENCY = Math.max(1, Math.min(10, Number(arg('concurrency', 4)) || 4));
const POLL_MS = Math.max(1000, Number(arg('poll-ms', 10000)) || 10000);
const TIMEOUT_MS = Math.max(3000, Math.min(30000, Number(arg('timeout-ms', 12000)) || 12000));
const STALE_MS = Math.max(60000, Number(arg('stale-ms', 600000)) || 600000);
const ONCE = process.argv.includes('--once');

async function mapConcurrent(items, worker, concurrency) {
  let next = 0;
  async function consume() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consume));
}

function pendingFilter() {
  const staleBefore = new Date(Date.now() - STALE_MS);
  return {
    'source.url': { $exists: true, $nin: ['', null] },
    'verification.status': 'unknown',
    $or: [
      { 'processing.status': { $exists: false } },
      { 'processing.status': 'pending' },
      { 'processing.status': 'failed' },
      { 'processing.status': 'processing', 'processing.claimedAt': { $lt: staleBefore } }
    ]
  };
}

async function claimJob() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_MS);
  return Job.findOneAndUpdate(
    {
      'source.url': { $exists: true, $nin: ['', null] },
      'verification.status': 'unknown',
      $or: [
        { 'processing.status': { $exists: false } },
        { 'processing.status': 'pending' },
        { 'processing.status': 'failed' },
        { 'processing.status': 'processing', 'processing.claimedAt': { $lt: staleBefore } }
      ]
    },
    { $set: { 'processing.status': 'processing', 'processing.claimedAt': now, 'processing.error': '' } },
    { sort: { 'dates.firstSeenAt': 1, _id: 1 }, new: true }
  ).lean();
}

async function processOne(job) {
  try {
    const result = await verifyJobSource(job, { timeoutMs: TIMEOUT_MS });
    const set = {
      'verification.status': result.status,
      'verification.checkedAt': result.checkedAt,
      'verification.sourceUrl': result.sourceUrl || job.source?.url || '',
      'verification.finalUrl': result.finalUrl || '',
      'verification.httpStatus': result.httpStatus ?? null,
      'verification.evidenceType': result.evidenceType || '',
      'verification.evidence': result.evidence || '',
      'processing.status': 'complete',
      'processing.completedAt': new Date(),
      'processing.error': ''
    };
    if (result.status === 'live') set['status.isLive'] = true;
    if (result.status === 'closed') set['status.isLive'] = false;
    await Job.updateOne({ _id: job._id, 'processing.status': 'processing' }, { $set: set });
    return { status: result.status, error: null };
  } catch (error) {
    await Job.updateOne(
      { _id: job._id, 'processing.status': 'processing' },
      { $set: { 'processing.status': 'failed', 'processing.completedAt': new Date(), 'processing.error': error.message } }
    );
    return { status: 'failed', error: error.message };
  }
}

async function counts() {
  const base = { 'source.url': { $exists: true, $nin: ['', null] } };
  const [pending, processing, complete, failed, unknown, live, closed] = await Promise.all([
    Job.countDocuments({ ...base, 'verification.status': 'unknown', $or: [{ 'processing.status': { $exists: false } }, { 'processing.status': 'pending' }, { 'processing.status': 'failed' }] }),
    Job.countDocuments({ ...base, 'processing.status': 'processing' }),
    Job.countDocuments({ ...base, 'processing.status': 'complete' }),
    Job.countDocuments({ ...base, 'processing.status': 'failed' }),
    Job.countDocuments({ ...base, 'verification.status': 'unknown' }),
    Job.countDocuments({ ...base, 'verification.status': 'live' }),
    Job.countDocuments({ ...base, 'verification.status': 'closed' })
  ]);
  return { pending, processing, complete, failed, unknown, live, closed };
}

async function main() {
  await connectMongo();
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
  console.log(`=== INCREMENTAL JOB PROCESSOR === batch=${BATCH_SIZE} concurrency=${CONCURRENCY} poll=${POLL_MS}ms timeout=${TIMEOUT_MS}ms ===`);

  do {
    const started = Date.now();
    const jobs = [];
    for (let i = 0; i < BATCH_SIZE; i += 1) {
      const job = await claimJob();
      if (!job) break;
      jobs.push(job);
    }

    let live = 0;
    let closed = 0;
    let unknown = 0;
    let failed = 0;
    await mapConcurrent(jobs, async job => {
      const result = await processOne(job);
      if (result.status === 'live') live += 1;
      else if (result.status === 'closed') closed += 1;
      else if (result.status === 'unknown') unknown += 1;
      else failed += 1;
    }, CONCURRENCY);

    const state = await counts();
    console.clear();
    console.log('=== JobMatchPortal Incremental Processor ===');
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      batch: { claimed: jobs.length, live, closed, unknown, failed, durationMs: Date.now() - started },
      queue: state,
      rateJobsPerMinute: jobs.length ? Math.round((jobs.length / Math.max(1, Date.now() - started)) * 60000) : 0,
      mongo: mongoose.connection.readyState === 1 ? 'HEALTHY' : 'DISCONNECTED'
    }, null, 2));

    if (!ONCE && !jobs.length) await new Promise(resolve => setTimeout(resolve, POLL_MS));
  } while (!ONCE);

  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('INCREMENTAL PROCESSOR FAILED:', error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
