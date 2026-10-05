import 'dotenv/config';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { apifyCareerUrl, runApifyForCompanies } from '../services/apifyJobDiscovery.js';
import { upsertJobs } from '../repositories/jobRepository.js';

const limit = Math.max(1, Number(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || 10));
const persist = !process.argv.includes('--no-persist');

function unresolvedFilter() {
  return {
    enabled: true,
    $and: [
      {
        $or: [
          { ats: { $in: ['', 'unknown', null] } },
          { 'metadata.resolutionStatus': { $in: ['pending', 'unresolved'] } },
          { 'metadata.sourceResolutionStatus': { $in: ['pending', 'unresolved'] } }
        ]
      },
      {
        $or: [
          { careersUrl: { $regex: /^https?:\/\//i } },
          { website: { $regex: /^https?:\/\//i } },
          { 'metadata.careersUrl': { $regex: /^https?:\/\//i } },
          { 'metadata.website': { $regex: /^https?:\/\//i } }
        ]
      }
    ]
  };
}

async function main() {
  if (!process.env.APIFY_KEY && !process.env.APIFY_TOKEN) throw new Error('APIFY_KEY is not configured');

  await connectMongo();
  const candidates = await Company.find(unresolvedFilter())
    .select('companyId companyName website careersUrl ats employerType metadata')
    .sort({ updatedAt: 1, companyId: 1 })
    .limit(Math.max(limit * 10, 50))
    .lean();

  const usableCandidates = candidates.filter(company => Boolean(apifyCareerUrl(company)));
  const seenNames = new Set();
  const companies = usableCandidates
    .sort((a, b) => {
      const aPrivate = a.employerType === 'private' ? 0 : 1;
      const bPrivate = b.employerType === 'private' ? 0 : 1;
      return aPrivate - bPrivate || String(a.companyName).localeCompare(String(b.companyName));
    })
    .filter(company => {
      const key = String(company.companyName || company.companyId).trim().toLowerCase();
      if (!key || seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    })
    .slice(0, limit);

  console.log(`=== APIFY UNRESOLVED-COMPANY TEST ===`);
  console.log(`Requested: ${limit}`);
  console.log(`Candidate pool: ${candidates.length}`);
  console.log(`Selected distinct companies: ${companies.length}`);

  if (!companies.length) {
    throw new Error('No unresolved companies with a usable website/careers URL were found');
  }

  let successful = 0;
  let failed = 0;
  let discovered = 0;
  let ukJobs = 0;
  let persisted = 0;

  let batch;
  try {
    batch = await runApifyForCompanies(companies, {
      maxItems: Math.min(10, Number(process.env.APIFY_TEST_MAX_ITEMS || 10))
    });
  } catch (error) {
    throw new Error(`Apify batch failed: ${error.response?.data?.error?.message || error.message}`);
  }

  for (const company of companies) {
    const companyJobs = batch.jobs.filter(job => job.companyId === company.companyId);
    const uk = companyJobs.filter(job => ['England', 'Scotland', 'Wales', 'Northern Ireland', 'UK-wide'].includes(job.nation));
    const write = persist && uk.length ? await upsertJobs(uk) : { added: 0, updated: 0, rejected: [] };

    if (companyJobs.length) successful += 1;
    else failed += 1;
    discovered += companyJobs.length;
    ukJobs += uk.length;
    persisted += (write.added || 0) + (write.updated || 0);

    console.log(JSON.stringify({
      companyId: company.companyId,
      companyName: company.companyName,
      careersUrl: apifyCareerUrl(company),
      status: companyJobs.length ? 'jobs_found' : 'no_matching_jobs',
      discovered: companyJobs.length,
      ukJobs: uk.length,
      added: write.added || 0,
      updated: write.updated || 0
    }));
  }

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
