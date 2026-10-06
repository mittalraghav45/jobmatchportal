import 'dotenv/config';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { runApifyForCompanies, apifyCareerUrl } from '../services/apifyJobDiscovery.js';
import { evaluateApifySource } from '../services/apifySourceQuality.js';
import { upsertJobs } from '../repositories/jobRepository.js';

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find(item => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const batch = Math.max(0, Number(arg('batch', 0)) || 0);
const limit = Math.max(1, Number(arg('limit', process.env.APIFY_FULL_BATCH_SIZE || 100)) || 100);
const companyIds = JSON.parse(arg('company-ids', '[]'));
const skip = batch * limit;
const requireJobs = String(process.env.APIFY_REQUIRE_JOBS || '').toLowerCase() === 'true';

function unresolvedFilter() {
  return {
    enabled: true,
    $and: [
      { $or: [
        { ats: { $in: ['', 'unknown', null] } },
        { 'metadata.resolutionStatus': { $in: ['pending', 'unresolved'] } },
        { 'metadata.sourceResolutionStatus': { $in: ['pending', 'unresolved'] } }
      ] },
      { $or: [
        { careersUrl: { $regex: /^https?:\/\//i } },
        { website: { $regex: /^https?:\/\//i } },
        { 'metadata.careersUrl': { $regex: /^https?:\/\//i } },
        { 'metadata.website': { $regex: /^https?:\/\//i } }
      ] },
      { 'metadata.apifyDiscovery.status': { $ne: 'complete' } }
    ]
  };
}

await connectMongo();
const query = companyIds.length
  ? { companyId: { $in: companyIds } }
  : unresolvedFilter();
const candidates = await Company.find(query)
  .select('companyId companyName website careersUrl ats employerType metadata')
  .sort({ companyId: 1 })
  .limit(limit)
  .lean();

const valid = [];
const rejected = [];
const suspicious = [];
for (const company of candidates) {
  const quality = evaluateApifySource(company);
  if (!quality.valid) {
    rejected.push({ companyId: company.companyId, companyName: company.companyName, ...quality });
    await Company.updateOne({ companyId: company.companyId }, { $set: {
      'metadata.apifySourceQuality': { status: 'invalid', reason: quality.reason, url: quality.url, host: quality.host, checkedAt: new Date() }
    }});
    continue;
  }
  if (quality.severity === 'suspicious') suspicious.push({ companyId: company.companyId, companyName: company.companyName, ...quality });
  valid.push(company);
}

console.log(JSON.stringify({ batch, skip, requested: candidates.length, valid: valid.length, rejected: rejected.length, suspicious: suspicious.length }));
if (!valid.length) {
  await mongoose.disconnect();
  process.exit(0);
}

const result = await runApifyForCompanies(valid, {
  maxItems: Math.min(10, Number(process.env.APIFY_TEST_MAX_ITEMS || 10))
});

let successful = 0;
let failed = 0;
let discovered = 0;
let added = 0;
let updated = 0;
let mismatched = 0;

for (const company of valid) {
  const companyJobs = result.jobs.filter(job => job.companyId === company.companyId);
  const companyError = result.errors.find(error => error.companyId === company.companyId);
  if (companyJobs.length) {
    successful += 1;
    discovered += companyJobs.length;
    const write = await upsertJobs(companyJobs);
    added += write.added || 0;
    updated += write.updated || 0;
    await Company.updateOne({ companyId: company.companyId }, { $set: {
      'metadata.apifySourceQuality': {
        status: suspicious.some(item => item.companyId === company.companyId) ? 'suspicious' : 'validated',
        url: apifyCareerUrl(company),
        checkedAt: new Date(),
        jobsDiscovered: companyJobs.length
      },
      'metadata.apifyDiscovery': { status: 'complete', discovered: companyJobs.length, completedAt: new Date() }
    }});

    for (const job of companyJobs) {
      if (job.companyId !== company.companyId || String(job.companyName).trim().toLowerCase() !== String(company.companyName).trim().toLowerCase()) mismatched += 1;
    }
  } else {
    failed += 1;
    await Company.updateOne({ companyId: company.companyId }, { $set: {
      'metadata.apifyDiscovery': { status: companyError ? 'error' : 'no_jobs', error: companyError?.error || null, completedAt: new Date() }
    }});
  }
}

const summary = { batch, skip, requested: candidates.length, valid: valid.length, rejected: rejected.length, suspicious: suspicious.length, successful, failed, discovered, added, updated, mismatched, errors: result.errors.length };
console.log(JSON.stringify(summary, null, 2));

if (mismatched > 0) throw new Error(`Company attribution gate failed: ${mismatched} mismatched jobs`);
if (result.errors.length > Math.ceil(valid.length * 0.25)) throw new Error(`Apify error rate too high: ${result.errors.length}/${valid.length}`);
if (requireJobs && discovered === 0) throw new Error('Apify pilot produced zero jobs; refusing to scale to the full corpus');
await mongoose.disconnect();
