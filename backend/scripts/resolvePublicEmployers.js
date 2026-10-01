import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { resolveCareerSource } from '../services/careerSourceResolver.js';

dotenv.config();

const RUN_ID = process.env.PUBLIC_EMPLOYER_RUN_ID || 'public-employer-resolution-v1';
const BATCH_SIZE = Math.max(1, Number(process.env.PUBLIC_EMPLOYER_BATCH_SIZE || 25));
const CONCURRENCY = Math.max(1, Number(process.env.PUBLIC_EMPLOYER_CONCURRENCY || 3));
const DELAY_MS = Math.max(0, Number(process.env.PUBLIC_EMPLOYER_DELAY_MS || 300));
const LIMIT = Math.max(0, Number(process.env.PUBLIC_EMPLOYER_LIMIT || 0));
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

async function main() {
  console.log('=== Public Employer Resolution ===');
  console.log(`Run ID: ${RUN_ID}`);
  console.log(`Types: ${TYPES.join(', ')}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Concurrency: ${CONCURRENCY}`);

  await connectMongo();
  console.log(`MongoDB connected: ${mongoose.connection.name}`);

  const completed = new Set(
    (await Checkpoint.find({ runId: RUN_ID, status: { $in: ['resolved', 'unresolved'] } }).select('companyId').lean())
      .map(row => String(row.companyId))
  );
  console.log(`Existing checkpoints: ${completed.size}`);

  const stats = {
    scanned: 0,
    skippedCheckpoint: 0,
    resolved: 0,
    unresolved: 0,
    websiteResolved: 0,
    careersResolved: 0,
    atsResolved: 0,
    failed: 0,
    byType: { nhs: 0, councils: 0, universities: 0 }
  };

  let lastCompanyId = '';
  let stop = false;

  while (!stop) {
    const query = {
      enabled: true,
      employerType: { $in: TYPES }
    };
    if (lastCompanyId) query.companyId = { $gt: lastCompanyId };

    const companies = await Company.find(query)
      .select('companyId companyName employerType website careersUrl ats metadata sponsorship')
      .sort({ companyId: 1 })
      .limit(BATCH_SIZE)
      .lean();

    if (!companies.length) break;

    let cursor = 0;
    const results = [];
    const worker = async () => {
      while (cursor < companies.length) {
        const index = cursor++;
        const company = companies[index];
        const companyId = String(company.companyId);

        if (completed.has(companyId)) {
          results[index] = { company, skipped: true };
          continue;
        }

        try {
          const source = await resolveCareerSource(company);
          results[index] = { company, source };
        } catch (error) {
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

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, companies.length) }, worker));

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
                source: source.source || '',
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
            source: source.source || '',
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
