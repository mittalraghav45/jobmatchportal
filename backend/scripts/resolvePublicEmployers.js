import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { resolveCareerSource } from '../services/careerSourceResolver.js';

dotenv.config();

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find(value => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function numericArgOrEnv(name, envName, fallback = 0) {
  const cli = argValue(name, null);
  const raw = cli !== null ? cli : process.env[envName];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const RUN_ID = argValue('run-id', process.env.PUBLIC_EMPLOYER_RUN_ID || 'public-employer-resolution-v1');
const START = Math.max(1, numericArgOrEnv('start', 'PUBLIC_EMPLOYER_START', 1));
const END = Math.max(START, numericArgOrEnv('end', 'PUBLIC_EMPLOYER_END', 0));
const BATCH_SIZE = Math.max(1, numericArgOrEnv('batch-size', 'PUBLIC_EMPLOYER_BATCH_SIZE', 25));
const CONCURRENCY = Math.max(1, numericArgOrEnv('concurrency', 'PUBLIC_EMPLOYER_CONCURRENCY', 3));
const DELAY_MS = Math.max(0, numericArgOrEnv('delay-ms', 'PUBLIC_EMPLOYER_DELAY_MS', 300));
const CLI_LIMIT = argValue('limit', null);
const LIMIT = CLI_LIMIT === null ? 0 : Math.max(0, Number(CLI_LIMIT) || 0);
const TYPES = ['nhs', 'councils', 'universities'];

const checkpointSchema = new mongoose.Schema({
  runId: { type: String, required: true },
  companyId: { type: String, required: true },
  companyName: String,
  employerType: String,
  status: { type: String, required: true },
  website: String,
  careersUrl: String,
  ats: String,
  atsSlug: String,
  source: String,
  reason: String,
  processedAt: Date
}, { collection: 'public_employer_resolution_checkpoints', timestamps: true });
checkpointSchema.index({ runId: 1, companyId: 1 }, { unique: true });

const Checkpoint = mongoose.models.PublicEmployerResolutionCheckpoint ||
  mongoose.model('PublicEmployerResolutionCheckpoint', checkpointSchema);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function increment(map, key) {
  const normalised = String(key || 'unknown').trim() || 'unknown';
  map[normalised] = (map[normalised] || 0) + 1;
}

async function main() {
  console.log('=== Public Employer Resolution ===');
  console.log(`Run ID: ${RUN_ID}`);
  console.log(`Types: ${TYPES.join(', ')}`);
  console.log(`Start: ${START}`);
  console.log(`End: ${END || 'dataset end'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Limit: ${LIMIT || 'none'}`);
  console.log('ATS diagnostics: enabled');

  await connectMongo();
  console.log(`MongoDB connected: ${mongoose.connection.name}`);

  const completed = new Set(
    (await Checkpoint.find({ runId: RUN_ID, status: { $in: ['resolved', 'unresolved'] } }).select('companyId').lean())
      .map(row => String(row.companyId))
  );
  console.log(`Existing checkpoints for this run: ${completed.size}`);

  const stats = {
    scanned: 0,
    skippedCheckpoint: 0,
    resolved: 0,
    unresolved: 0,
    websiteResolved: 0,
    careersResolved: 0,
    atsResolved: 0,
    failed: 0,
    byType: { nhs: 0, councils: 0, universities: 0 },
    diagnostics: {
      bySource: {},
      byAts: {},
      unresolvedReason: {},
      resolvedWithoutAts: 0
    }
  };

  let lastCompanyId = '';
  let stop = false;
  let datasetIndex = 0;

  while (!stop) {
    const query = { enabled: true, employerType: { $in: TYPES } };
    if (lastCompanyId) query.companyId = { $gt: lastCompanyId };

    const companies = await Company.find(query)
      .select('companyId companyName employerType website careersUrl ats metadata sponsorship')
      .sort({ companyId: 1 })
      .limit(BATCH_SIZE)
      .lean();

    if (!companies.length) break;

    const selectedCompanies = [];
    for (const company of companies) {
      datasetIndex += 1;
      if (datasetIndex < START) continue;
      if (END && datasetIndex > END) {
        stop = true;
        break;
      }
      selectedCompanies.push(company);
    }

    if (!selectedCompanies.length) {
      lastCompanyId = String(companies[companies.length - 1].companyId);
      if (END && datasetIndex >= END) break;
      continue;
    }

    let cursor = 0;
    const results = [];
    const worker = async () => {
      while (cursor < selectedCompanies.length) {
        const index = cursor++;
        const company = selectedCompanies[index];
        const companyId = String(company.companyId);

        if (completed.has(companyId)) {
          results[index] = { company, skipped: true };
          continue;
        }

        try {
          const source = await resolveCareerSource(company);
          results[index] = { company, source };
        } catch (error) {
          stats.failed += 1;
          results[index] = {
            company,
            source: {
              status: 'unresolved',
              website: null,
              careersUrl: null,
              ats: null,
              atsSlug: null,
              source: 'resolver-error',
              reason: error.message
            }
          };
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, selectedCompanies.length) }, worker));

    for (const item of results) {
      const company = item.company;
      const companyId = String(company.companyId);
      lastCompanyId = companyId;

      if (item.skipped) {
        stats.skippedCheckpoint += 1;
        continue;
      }

      stats.scanned += 1;
      stats.byType[company.employerType] += 1;
      const source = item.source;
      const isResolved = source.status === 'resolved';
      const website = source.website || company.website || '';
      const careersUrl = source.careersUrl || company.careersUrl || '';
      const ats = source.ats || company.ats || 'unknown';
      const atsSlug = source.atsSlug || company.metadata?.atsSlug || '';
      const resolutionSource = source.source || 'unknown';

      increment(stats.diagnostics.bySource, resolutionSource);
      if (ats && ats !== 'unknown') increment(stats.diagnostics.byAts, ats);
      if (isResolved && (!ats || ats === 'unknown')) stats.diagnostics.resolvedWithoutAts += 1;
      if (!isResolved) increment(stats.diagnostics.unresolvedReason, source.reason || 'unknown');

      await Company.updateOne(
        { companyId },
        {
          $set: {
            website,
            careersUrl,
            ats: ats || 'unknown',
            metadata: {
              ...(company.metadata || {}),
              publicEmployerResolution: {
                runId: RUN_ID,
                status: isResolved ? 'resolved' : 'unresolved',
                source: resolutionSource,
                reason: source.reason || '',
                website,
                careersUrl,
                ats: ats || 'unknown',
                atsSlug,
                resolvedAt: new Date().toISOString()
              }
            }
          }
        }
      );

      await Checkpoint.updateOne(
        { runId: RUN_ID, companyId },
        {
          $set: {
            runId: RUN_ID,
            companyId,
            companyName: company.companyName,
            employerType: company.employerType,
            status: isResolved ? 'resolved' : 'unresolved',
            website: website || null,
            careersUrl: careersUrl || null,
            ats: ats || null,
            atsSlug: atsSlug || null,
            source: resolutionSource,
            reason: source.reason || null,
            processedAt: new Date()
          }
        },
        { upsert: true }
      );

      if (isResolved) {
        stats.resolved += 1;
        if (website) stats.websiteResolved += 1;
        if (careersUrl) stats.careersResolved += 1;
        if (ats && ats !== 'unknown') stats.atsResolved += 1;
      } else {
        stats.unresolved += 1;
      }

      if (DELAY_MS) await sleep(DELAY_MS);

      if (stats.scanned % 25 === 0) {
        console.log(`[progress] scanned=${stats.scanned} resolved=${stats.resolved} unresolved=${stats.unresolved} websites=${stats.websiteResolved} careers=${stats.careersResolved} ats=${stats.atsResolved}`);
      }

      if (LIMIT && stats.scanned >= LIMIT) {
        stop = true;
        break;
      }
    }
  }

  console.log('');
  console.log('=== PUBLIC EMPLOYER RESOLUTION SUMMARY ===');
  console.log(JSON.stringify({
    runId: RUN_ID,
    ...stats,
    checkpointCollection: 'public_employer_resolution_checkpoints'
  }, null, 2));

  await mongoose.disconnect();
  console.log('MongoDB connection closed.');
}

main().catch(async error => {
  console.error('PUBLIC EMPLOYER RESOLUTION FAILED:', error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
