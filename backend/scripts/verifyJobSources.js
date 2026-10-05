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

const BATCH_SIZE = Math.max(10, Math.min(500, Number(arg('batch-size', 100)) || 100));
const CONCURRENCY = Math.max(1, Math.min(20, Number(arg('concurrency', 8)) || 8));
const LIMIT = Math.max(0, Number(arg('limit', 0)) || 0);
const ONLY_UNVERIFIED = arg('only-unverified', 'true') !== 'false';
const RECHECK_DAYS = Math.max(0, Number(arg('recheck-days', 0)) || 0);
const TIMEOUT_MS = Math.max(3000, Math.min(30000, Number(arg('timeout-ms', 12000)) || 12000));
const MAX_RETRIES = Math.max(0, Math.min(5, Number(arg('max-retries', 2)) || 0));
const RETRY_DELAY_MS = Math.max(0, Math.min(5000, Number(arg('retry-delay-ms', 250)) || 0));

async function mapConcurrent(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function consume() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consume));
  return results;
}

function buildFilter(now = new Date()) {
  const filter = { 'source.url': { $exists: true, $nin: ['', null] } };
  if (ONLY_UNVERIFIED) {
    const staleBefore = RECHECK_DAYS > 0 ? new Date(now.getTime() - RECHECK_DAYS * 86400000) : null;
    filter.$or = [
      { verification: { $exists: false } },
      { 'verification.status': { $exists: false } },
      { 'verification.status': 'unknown' },
      ...(staleBefore ? [{ 'verification.checkedAt': { $lt: staleBefore } }] : [])
    ];
  }
  return filter;
}

async function getPopulationSummary() {
  const base = { 'source.url': { $exists: true, $nin: ['', null] } };
  const [total, live, closed, unknown, unverified] = await Promise.all([
    Job.countDocuments(base),
    Job.countDocuments({ ...base, 'verification.status': 'live' }),
    Job.countDocuments({ ...base, 'verification.status': 'closed' }),
    Job.countDocuments({ ...base, 'verification.status': 'unknown' }),
    Job.countDocuments({ ...base, $or: [
      { verification: { $exists: false } },
      { 'verification.status': { $exists: false } }
    ] })
  ]);
  return { total, live, closed, unknown, unverified };
}

async function main() {
  await connectMongo();
  const startedAt = new Date();
  console.log(`MongoDB connected: ${mongoose.connection.name}`);

  const before = await getPopulationSummary();
  console.log('=== VERIFICATION POPULATION BEFORE ===');
  console.log(JSON.stringify(before, null, 2));
  console.log(`Source verification: batch=${BATCH_SIZE}, concurrency=${CONCURRENCY}, limit=${LIMIT || 'all'}, onlyUnverified=${ONLY_UNVERIFIED}, recheckDays=${RECHECK_DAYS}, maxRetries=${MAX_RETRIES}, retryDelayMs=${RETRY_DELAY_MS}`);

  const summary = {
    startedAt: startedAt.toISOString(),
    populationBefore: before,
    selected: 0,
    processed: 0,
    live: 0,
    closed: 0,
    unknown: 0,
    missingUrl: 0,
    failed: 0,
    retriesUsed: 0
  };

  let lastId = null;
  while (true) {
    const remaining = LIMIT ? Math.min(BATCH_SIZE, LIMIT - summary.selected) : BATCH_SIZE;
    if (remaining <= 0) break;

    const filter = buildFilter(startedAt);
    if (lastId) filter._id = { $gt: lastId };
    const jobs = await Job.find(filter).sort({ _id: 1 }).limit(remaining).lean();
    if (!jobs.length) break;
    summary.selected += jobs.length;

    const results = await mapConcurrent(jobs, async job => {
      try {
        return await verifyJobSource(job, { timeoutMs: TIMEOUT_MS, maxRetries: MAX_RETRIES, retryDelayMs: RETRY_DELAY_MS });
      } catch (error) {
        return { status: 'unknown', evidenceType: 'verifier_error', evidence: error.message, checkedAt: new Date().toISOString(), sourceUrl: job.source?.url || '', attempts: MAX_RETRIES + 1 };
      }
    }, CONCURRENCY);

    const operations = [];
    jobs.forEach((job, index) => {
      const result = results[index];
      if (!result) { summary.failed += 1; return; }
      summary[result.status] = (summary[result.status] || 0) + 1;
      if (result.evidenceType === 'missing_url') summary.missingUrl += 1;
      summary.retriesUsed += Math.max(0, (result.attempts || 1) - 1);

      const set = {
        'verification.status': result.status,
        'verification.checkedAt': result.checkedAt,
        'verification.sourceUrl': result.sourceUrl || job.source?.url || '',
        'verification.finalUrl': result.finalUrl || '',
        'verification.httpStatus': result.httpStatus ?? null,
        'verification.evidenceType': result.evidenceType || '',
        'verification.evidence': result.evidence || '',
        'verification.attempts': result.attempts || 1
      };
      if (result.status === 'live') set['status.isLive'] = true;
      if (result.status === 'closed') set['status.isLive'] = false;
      if (result.status === 'unknown' && job.verification?.status === 'closed') set['status.isLive'] = false;

      operations.push({ updateOne: { filter: { _id: job._id }, update: { $set: set } } });
    });

    if (operations.length) await Job.bulkWrite(operations, { ordered: false });
    summary.processed += jobs.length;
    lastId = jobs[jobs.length - 1]._id;
    console.log(`[verify] selected=${summary.selected}${LIMIT ? `/${LIMIT}` : ''} processed=${summary.processed} live=${summary.live} closed=${summary.closed} unknown=${summary.unknown} retries=${summary.retriesUsed}`);
  }

  const after = await getPopulationSummary();
  summary.finishedAt = new Date().toISOString();
  summary.populationAfter = after;
  summary.populationInvariant = after.total === before.total;
  console.log('\n=== SOURCE-BACKED VERIFICATION SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('SOURCE VERIFICATION FAILED:', error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
