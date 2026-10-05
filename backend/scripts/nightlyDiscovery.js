import 'dotenv/config';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { discoverCompanyJobs } from '../services/companyDiscovery.js';

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find(item => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const limit = Math.max(1, Number(arg('limit', process.env.DISCOVERY_LIMIT || 500)) || 500);
const start = Math.max(0, Number(arg('skip', process.env.DISCOVERY_SKIP || 0)) || 0);
const delayMs = Math.max(0, Number(process.env.DISCOVERY_DELAY_MS || 100));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

await connectMongo();

const companies = await Company.find({ enabled: true })
  .select('companyId companyName companyNumber website careersUrl ats enabled metadata')
  .sort({ companyId: 1 })
  .skip(start)
  .limit(limit)
  .lean();

const summary = {
  requested: companies.length,
  successful: 0,
  failed: 0,
  unconfigured: 0,
  invalid: 0,
  discovered: 0,
  added: 0,
  updated: 0,
  duplicatesRemoved: 0,
  rejected: 0
};

for (const company of companies) {
  const result = await discoverCompanyJobs(company, {
    persist: true,
    now: new Date()
  });

  if (result.status === 'ok') summary.successful += 1;
  else if (result.status === 'error') summary.failed += 1;
  else if (result.status === 'unconfigured') summary.unconfigured += 1;
  else if (result.status === 'invalid') summary.invalid += 1;

  summary.discovered += result.jobs?.length || 0;
  summary.added += result.added || 0;
  summary.updated += result.updated || 0;
  summary.duplicatesRemoved += result.duplicatesRemoved || 0;
  summary.rejected += result.rejected?.length || 0;

  console.log(JSON.stringify({
    companyId: company.companyId,
    companyName: company.companyName,
    ats: result.company?.ats || null,
    status: result.status,
    discovered: result.jobs?.length || 0,
    added: result.added || 0,
    updated: result.updated || 0,
    duplicatesRemoved: result.duplicatesRemoved || 0,
    rejected: result.rejected?.length || 0
  }));

  if (delayMs) await sleep(delayMs);
}

console.log('=== UNIFIED NIGHTLY DISCOVERY SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));

await import('mongoose').then(({ default: mongoose }) => mongoose.disconnect());
