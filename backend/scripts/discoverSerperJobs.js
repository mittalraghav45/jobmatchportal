import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { ingestJobs } from '../services/jobIngestion.js';
import { upsertJobs } from '../repositories/jobRepository.js';
import { discoverCompanyJobsWithSerper } from '../services/serperJobDiscovery.js';

dotenv.config();

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const LIMIT = Math.max(1, Number(arg('limit', process.env.SERPER_COMPANY_LIMIT || 10)) || 10);
const PER_QUERY = Math.max(1, Math.min(10, Number(arg('per-query', process.env.SERPER_RESULTS_PER_QUERY || 10)) || 10));
const START = Math.max(0, Number(arg('skip', 0)) || 0);
const DELAY_MS = Math.max(0, Number(arg('delay', process.env.SERPER_DELAY_MS || 250)) || 250);
const ATS_SITES = {
  greenhouse: 'boards.greenhouse.io',
  lever: 'jobs.lever.co',
  ashby: 'jobs.ashbyhq.com',
  workday: 'myworkdayjobs.com',
  workable: 'apply.workable.com',
  jobvite: 'jobs.jobvite.com',
  smartrecruiters: 'careers.smartrecruiters.com',
  recruitee: 'recruitee.com',
  personio: 'personio.com',
  bamboohr: 'bamboohr.com'
};

if (!process.env.SERPER_API_KEY) {
  throw new Error('SERPER_API_KEY is required');
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

await connectMongo();

const companies = await Company.find({
  enabled: true,
  companyName: { $exists: true, $nin: ['', null] }
})
  .sort({ priority: -1, companyName: 1 })
  .skip(START)
  .limit(LIMIT)
  .lean();

const summary = {
  attempted: companies.length,
  companiesWithResults: 0,
  queries: 0,
  discovered: 0,
  added: 0,
  updated: 0,
  duplicatesRemoved: 0,
  rejected: 0,
  failed: 0
};

for (const company of companies) {
  try {
    const discovery = await discoverCompanyJobsWithSerper({
      companyId: company.companyId,
      companyName: company.companyName,
      careersUrl: company.careersUrl || '',
      sites: ATS_SITES[company.ats] ? [ATS_SITES[company.ats]] : [],
      perQuery: PER_QUERY
    });

    summary.queries += discovery.queries.length;
    const ingested = ingestJobs(discovery.results, { now: new Date().toISOString() });
    const persisted = await upsertJobs(ingested.jobs, { now: new Date() });

    summary.discovered += ingested.jobs.length;
    summary.added += persisted.added;
    summary.updated += persisted.updated;
    summary.duplicatesRemoved += ingested.duplicatesRemoved;
    summary.rejected += ingested.rejected.length + persisted.rejected.length;
    if (ingested.jobs.length) summary.companiesWithResults += 1;

    console.log(JSON.stringify({
      company: company.companyName,
      companyId: company.companyId,
      queries: discovery.queries.length,
      discovered: ingested.jobs.length,
      added: persisted.added,
      updated: persisted.updated,
      duplicatesRemoved: ingested.duplicatesRemoved,
      rejected: ingested.rejected.length + persisted.rejected.length
    }));
  } catch (error) {
    summary.failed += 1;
    console.error(JSON.stringify({
      company: company.companyName,
      companyId: company.companyId,
      error: error.message
    }));
  }

  if (DELAY_MS) await sleep(DELAY_MS);
}

console.log('=== SERPER JOB DISCOVERY SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));

await mongoose.disconnect();
