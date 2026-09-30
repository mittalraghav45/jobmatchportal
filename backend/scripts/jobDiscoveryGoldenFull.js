import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { discoverCompanyJobs } from '../services/companyDiscovery.js';
import { resolveATSConfig } from '../ats/detector.js';
import { resolveCareerSource } from '../services/careerSourceResolver.js';

dotenv.config();

const DEFAULT_RUN_ID = process.env.GOLDEN_RUN_ID || 'golden-full-v1';
const DEFAULT_DELAY_MS = Number(process.env.GOLDEN_DELAY_MS || 750);
const DEFAULT_RESOLUTION_CONCURRENCY = Number(process.env.GOLDEN_RESOLUTION_CONCURRENCY || 5);
const DEFAULT_PROGRESS_EVERY = Number(process.env.GOLDEN_PROGRESS_EVERY || 100);
const CONTROLLED_TEST_IDS = new Set(['1', '3', '8', '11', '12']);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function arg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const value = process.argv.find(item => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

const RUN_ID = arg('run-id', DEFAULT_RUN_ID);
const LIMIT = toInt(arg('limit', ''), 0);
const DELAY_MS = toInt(arg('delay', DEFAULT_DELAY_MS), DEFAULT_DELAY_MS);
const RESOLUTION_CONCURRENCY = Math.max(1, toInt(arg('resolution-concurrency', DEFAULT_RESOLUTION_CONCURRENCY), DEFAULT_RESOLUTION_CONCURRENCY));
const PROGRESS_EVERY = Math.max(1, toInt(arg('progress-every', DEFAULT_PROGRESS_EVERY), DEFAULT_PROGRESS_EVERY));
const INCLUDE_CONTROLLED = arg('include-controlled', 'false') === 'true';
const RETRY_COMPLETED = arg('retry-completed', 'false') === 'true';

const checkpointSchema = new mongoose.Schema({
  runId: { type: String, required: true },
  companyId: { type: String, required: true },
  companyName: String,
  status: { type: String, required: true },
  sourceStatus: String,
  source: String,
  careersUrl: String,
  ats: String,
  atsSlug: String,
  jobsDiscovered: { type: Number, default: 0 },
  jobsAdded: { type: Number, default: 0 },
  jobsUpdated: { type: Number, default: 0 },
  duplicatesRemoved: { type: Number, default: 0 },
  rejected: { type: Number, default: 0 },
  error: String,
  processedAt: Date
}, { collection: 'golden_discovery_checkpoints', timestamps: true });

checkpointSchema.index({ runId: 1, companyId: 1 }, { unique: true });
const GoldenDiscoveryCheckpoint = mongoose.models.GoldenDiscoveryCheckpoint || mongoose.model('GoldenDiscoveryCheckpoint', checkpointSchema);

async function loadCompleted(runId) {
  if (RETRY_COMPLETED) return new Set();
  const rows = await GoldenDiscoveryCheckpoint.find({
    runId,
    status: { $in: ['completed', 'unresolved', 'invalid'] }
  }).select('companyId').lean();
  return new Set(rows.map(row => String(row.companyId)));
}

async function saveCheckpoint(data) {
  await GoldenDiscoveryCheckpoint.updateOne(
    { runId: RUN_ID, companyId: String(data.companyId) },
    { $set: { ...data, runId: RUN_ID, companyId: String(data.companyId), processedAt: new Date() } },
    { upsert: true }
  );
}

function emptyStats() {
  return {
    scanned: 0,
    skippedCheckpoint: 0,
    resolved: 0,
    unresolved: 0,
    invalid: 0,
    successful: 0,
    failed: 0,
    jobsDiscovered: 0,
    jobsAdded: 0,
    jobsUpdated: 0,
    duplicatesRemoved: 0,
    rejected: 0
  };
}

async function resolveBatch(companies) {
  const results = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < companies.length) {
      const index = cursor;
      cursor += 1;
      const company = companies[index];
      try {
        const source = await resolveCareerSource(company);
        results[index] = { company, source };
      } catch (error) {
        results[index] = {
          company,
          source: {
            status: 'unresolved',
            source: 'resolver-error',
            careersUrl: null,
            ats: null,
            atsSlug: null,
            reason: error.message
          }
        };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(RESOLUTION_CONCURRENCY, companies.length) }, worker));
  return results;
}

async function processCompany(company, source) {
  if (source.status !== 'resolved') {
    await saveCheckpoint({
      companyId: company.companyId,
      companyName: company.companyName,
      status: 'unresolved',
      sourceStatus: source.status,
      source: source.source,
      error: source.reason || null
    });
    return { status: 'unresolved', companyId: company.companyId, jobs: 0, added: 0, updated: 0, duplicatesRemoved: 0, rejected: 0 };
  }

  const resolved = resolveATSConfig({
    ats: source.ats || company.ats,
    atsSlug: source.atsSlug || company.metadata?.atsSlug,
    careersUrl: source.careersUrl
  });

  const prepared = {
    ...company,
    careersUrl: source.careersUrl,
    ats: resolved.ats || 'custom',
    atsSlug: resolved.slug || source.atsSlug || company.companyId,
    atsSite: resolved.site || null,
    atsDetectionSource: source.source
  };

  if (resolved.error || !resolved.ats) {
    await saveCheckpoint({
      companyId: company.companyId,
      companyName: company.companyName,
      status: 'invalid',
      sourceStatus: source.status,
      source: source.source,
      careersUrl: source.careersUrl,
      ats: resolved.ats || null,
      atsSlug: resolved.slug || source.atsSlug || null,
      error: resolved.error || 'ATS could not be resolved'
    });
    return { status: 'invalid', companyId: company.companyId, jobs: 0, added: 0, updated: 0, duplicatesRemoved: 0, rejected: 0 };
  }

  const result = await discoverCompanyJobs(prepared, { persist: true, now: new Date() });
  const status = result.status === 'ok' ? 'completed' : result.status === 'error' ? 'failed' : 'invalid';

  await saveCheckpoint({
    companyId: company.companyId,
    companyName: company.companyName,
    status,
    sourceStatus: source.status,
    source: source.source,
    careersUrl: source.careersUrl,
    ats: prepared.ats,
    atsSlug: prepared.atsSlug,
    jobsDiscovered: result.jobs?.length || 0,
    jobsAdded: result.added || 0,
    jobsUpdated: result.updated || 0,
    duplicatesRemoved: result.duplicatesRemoved || 0,
    rejected: result.rejected?.length || 0,
    error: status === 'failed' ? (result.rejected?.[0]?.message || 'Discovery failed') : null
  });

  return {
    status,
    companyId: company.companyId,
    jobs: result.jobs?.length || 0,
    added: result.added || 0,
    updated: result.updated || 0,
    duplicatesRemoved: result.duplicatesRemoved || 0,
    rejected: result.rejected?.length || 0
  };
}

async function main() {
  console.log('=== Golden Sponsor Job Discovery: FULL DATASET ===');
  console.log(`Run ID: ${RUN_ID}`);
  console.log('Mode: checkpointed/resumable');
  console.log(`Resolution concurrency: ${RESOLUTION_CONCURRENCY}`);
  console.log(`Delay between job-source discoveries: ${DELAY_MS}ms`);
  if (LIMIT) console.log(`TEST LIMIT: ${LIMIT} companies`);

  await connectMongo();
  console.log(`MongoDB connected: ${mongoose.connection.name}`);

  const completed = await loadCompleted(RUN_ID);
  console.log(`Existing checkpoints for this run: ${completed.size}`);

  const query = { enabled: true };
  if (!INCLUDE_CONTROLLED) query.companyId = { $nin: [...CONTROLLED_TEST_IDS] };

  const cursor = Company.find(query)
    .select('companyId companyName companyNumber website careersUrl ats enabled metadata')
    .sort({ companyId: 1 })
    .lean()
    .cursor();

  const stats = emptyStats();
  let batch = [];
  let stop = false;

  const flush = async () => {
    if (!batch.length || stop) return;
    const work = batch;
    batch = [];
    const resolved = await resolveBatch(work);

    for (const item of resolved) {
      if (stop) break;
      const companyId = String(item.company.companyId);
      stats.scanned += 1;

      if (completed.has(companyId)) {
        stats.skippedCheckpoint += 1;
        continue;
      }

      if (item.source.status === 'resolved') stats.resolved += 1;
      else stats.unresolved += 1;

      try {
        const result = await processCompany(item.company, item.source);
        if (result.status === 'completed') stats.successful += 1;
        if (result.status === 'failed') stats.failed += 1;
        if (result.status === 'invalid') stats.invalid += 1;
        stats.jobsDiscovered += result.jobs;
        stats.jobsAdded += result.added;
        stats.jobsUpdated += result.updated;
        stats.duplicatesRemoved += result.duplicatesRemoved;
        stats.rejected += result.rejected;
      } catch (error) {
        stats.failed += 1;
        await saveCheckpoint({
          companyId,
          companyName: item.company.companyName,
          status: 'failed',
          sourceStatus: item.source.status,
          source: item.source.source,
          careersUrl: item.source.careersUrl || null,
          error: error.message
        });
      }

      if (stats.scanned % PROGRESS_EVERY === 0) {
        console.log(`[progress] scanned=${stats.scanned} resolved=${stats.resolved} unresolved=${stats.unresolved} successful=${stats.successful} failed=${stats.failed} jobsAdded=${stats.jobsAdded} jobsUpdated=${stats.jobsUpdated}`);
      }

      if (DELAY_MS) await sleep(DELAY_MS);

      if (LIMIT && stats.scanned >= LIMIT) {
        stop = true;
        break;
      }
    }
  };

  for await (const company of cursor) {
    if (LIMIT && stats.scanned + batch.length >= LIMIT) break;
    if (completed.has(String(company.companyId))) {
      stats.scanned += 1;
      stats.skippedCheckpoint += 1;
      continue;
    }
    batch.push(company);
    if (batch.length >= RESOLUTION_CONCURRENCY) await flush();
  }
  await flush();

  const summary = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    limitedTest: Boolean(LIMIT),
    scanned: stats.scanned,
    skippedCheckpoint: stats.skippedCheckpoint,
    resolved: stats.resolved,
    unresolved: stats.unresolved,
    invalid: stats.invalid,
    successful: stats.successful,
    failed: stats.failed,
    jobsDiscovered: stats.jobsDiscovered,
    jobsAdded: stats.jobsAdded,
    jobsUpdated: stats.jobsUpdated,
    duplicatesRemoved: stats.duplicatesRemoved,
    rejected: stats.rejected
  };

  console.log('');
  console.log('=== FULL DATASET SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('');
  console.log('Checkpoint collection: golden_discovery_checkpoints');
  console.log('Resume with the same run ID.');

  await mongoose.disconnect();
  console.log('MongoDB connection closed.');
}

main().catch(async error => {
  console.error('FULL GOLDEN DISCOVERY FAILED:', error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
