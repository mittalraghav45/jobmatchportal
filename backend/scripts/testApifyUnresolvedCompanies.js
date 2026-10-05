import 'dotenv/config';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { Job } from '../models/Job.js';
import { discoverWithApify } from '../services/apifyJobDiscovery.js';
import { upsertJobs } from '../repositories/jobRepository.js';

const limit = Math.max(1, Number(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || 10));
const persist = !process.argv.includes('--no-persist');

function unresolvedFilter() {
  return {
    enabled: true,
    $or: [
      { ats: { $in: ['', 'unknown', null] } },
      { 'metadata.resolutionStatus': { $in: ['pending', 'unresolved'] } },
      { 'metadata.sourceResolutionStatus': { $in: ['pending', 'unresolved'] } }
    ],
    $or: [
      { careersUrl: { $regex: /^https?:\\/\\//i } },
      { website: { $regex: /^https?:\\/\\//i } },
      { 'metadata.careersUrl': { $regex: /^https?:\\/\\//i } },
      { 'metadata.website': { $regex: /^https?:\\/\\//i } }
    ]
  };
}

async function main() {
  if (!process.env.APIFY_KEY && !process.env.APIFY_TOKEN) throw new Error('APIFY_KEY is not configured');

  await connectMongo();
  const companies = await Company.find(unresolvedFilter())
    .select('companyId companyName website careersUrl ats employerType metadata')
    .sort({ priority: -1, updatedAt: 1, companyId: 1 })
    .limit(limit)
    .lean();

  console.log(`=== APIFY UNRESOLVED-COMPANY TEST ===`);
  console.log(`Requested: ${limit}`);
  console.log(`Selected: ${companies.length}`);

  if (!companies.length) {
    throw new Error('No unresolved companies with a usable website/careers URL were found');
  }

  let successful = 0;
  let failed = 0;
  let discovered = 0;
  let ukJobs = 0;
  let persisted = 0;

  for (const company of companies) {
    const result = await discoverWithApify(company, {
      maxItems: Math.min(10, Number(process.env.APIFY_TEST_MAX_ITEMS || 10)),
      includeDescription: false,
      includeSkills: false
    });

    const uk = result.jobs.filter(job => ['England', 'Scotland', 'Wales', 'Northern Ireland', 'UK-wide'].includes(job.nation));
    const write = persist && uk.length ? await upsertJobs(uk) : { added: 0, updated: 0, rejected: [] };

    if (result.status === 'ok') successful += 1;
    else failed += 1;
    discovered += result.jobs.length;
    ukJobs += uk.length;
    persisted += (write.added || 0) + (write.updated || 0);

    console.log(JSON.stringify({
      companyId: company.companyId,
      companyName: company.companyName,
      careersUrl: result.careersUrl || null,
      status: result.status,
      discovered: result.jobs.length,
      ukJobs: uk.length,
      added: write.added || 0,
      updated: write.updated || 0,
      error: result.error || null
    }));
  }

  console.log(JSON.stringify({
    requested: limit,
    selected: companies.length,
    successful,
    failed,
    discovered,
    ukJobs,
    persisted,
    persistenceEnabled: persist
  }, null, 2));

  if (successful === 0 || discovered === 0) {
    throw new Error('Apify unresolved-company test produced no jobs');
  }

  await mongoose.connection.close();
}

main().catch(async error => {
  console.error(`APIFY UNRESOLVED-COMPANY TEST FAILED: ${error.message}`);
  try { await mongoose.connection.close(); } catch {}
  process.exit(1);
});
