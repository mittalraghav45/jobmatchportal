import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { discoverCompanyJobs } from '../services/companyDiscovery.js';

const RUN_COLLECTION = 'job_discovery_runs';
const RUN_ID = process.env.DISCOVERY_RUN_ID || `discovery-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const CONCURRENCY = Math.max(1, Number(process.env.DISCOVERY_CONCURRENCY || 3));
const DELAY_MS = Math.max(0, Number(process.env.DISCOVERY_DELAY_MS || 500));
const LIMIT = Math.max(0, Number(process.env.DISCOVERY_LIMIT || 0));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function emptySummary() {
  return {
    companiesScanned: 0,
    successful: 0,
    failed: 0,
    invalid: 0,
    unconfigured: 0,
    jobsDiscovered: 0,
    jobsAdded: 0,
    jobsUpdated: 0,
    duplicatesRemoved: 0,
    rejected: 0
  };
}

async function saveRun(patch) {
  await mongoose.connection.db.collection(RUN_COLLECTION).updateOne(
    { runId: RUN_ID },
    {
      $set: { runId: RUN_ID, updatedAt: new Date(), ...patch },
      $setOnInsert: { startedAt: new Date() }
    },
    { upsert: true }
  );
}

async function processCompany(company, summary) {
  try {
    const result = await discoverCompanyJobs(company, { persist: true, now: new Date() });
    summary.companiesScanned += 1;
    summary.jobsDiscovered += result.jobs?.length || 0;
    summary.jobsAdded += result.added || 0;
    summary.jobsUpdated += result.updated || 0;
    summary.duplicatesRemoved += result.duplicatesRemoved || 0;
    summary.rejected += result.rejected?.length || 0;

    if (result.status === 'ok') summary.successful += 1;
    else if (result.status === 'invalid') summary.invalid += 1;
    else if (result.status === 'unconfigured') summary.unconfigured += 1;
    else summary.failed += 1;

    return { companyId: company.companyId, companyName: company.companyName, status: result.status };
  } catch (error) {
    summary.companiesScanned += 1;
    summary.failed += 1;
    return { companyId: company.companyId, companyName: company.companyName, status: 'error', error: error.message };
  }
}

async function main() {
  console.log('=== Automated UK Job Discovery ===');
  console.log(`Run ID: ${RUN_ID}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Delay: ${DELAY_MS}ms`);
  if (LIMIT) console.log(`Limit: ${LIMIT} companies`);

  await connectMongo();
  const summary = emptySummary();
  await saveRun({ status: 'running', phase: 'loading', summary, startedAt: new Date() });

  const companies = await Company.find({ enabled: true })
    .select('companyId companyName companyNumber website careersUrl ats enabled metadata')
    .sort({ companyId: 1 })
    .limit(LIMIT || 0)
    .lean();

  console.log(`Enabled companies: ${companies.length}`);
  await saveRun({ phase: 'discovering', totalCompanies: companies.length, summary });

  const results = new Array(companies.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= companies.length) return;
      const company = companies[index];
      await saveRun({ currentCompanyId: company.companyId, currentCompanyName: company.companyName, heartbeatAt: new Date(), summary });
      results[index] = await processCompany(company, summary);
      if (DELAY_MS) await sleep(DELAY_MS);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, companies.length) }, worker));

  const completed = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    ...summary
  };

  await saveRun({
    status: 'completed',
    phase: 'complete',
    currentCompanyId: null,
    currentCompanyName: null,
    completedAt: new Date(),
    heartbeatAt: new Date(),
    summary: completed
  });

  console.log(JSON.stringify(completed, null, 2));
  console.log(`Run status collection: ${RUN_COLLECTION}`);
  console.log('Discovery complete. Live-state verification remains a separate evidence pass.');

  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('AUTOMATED DISCOVERY FAILED:', error.message);
  try {
    if (mongoose.connection.readyState === 1) {
      await saveRun({ status: 'failed', phase: 'error', error: error.message, failedAt: new Date(), heartbeatAt: new Date() });
    }
  } catch {}
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
