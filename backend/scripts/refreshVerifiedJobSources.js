import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';
import { discoverCompanyJobs } from '../services/companyDiscovery.js';

const registryPath = path.resolve(process.cwd(), 'config/job-source-registry.json');

function loadRegistry() {
  const raw = fs.readFileSync(registryPath, 'utf8');
  const registry = JSON.parse(raw);
  if (!Array.isArray(registry.sources)) {
    throw new Error('Invalid job-source registry: sources must be an array.');
  }
  return registry.sources.filter(source => source.status === 'verified');
}

async function run() {
  console.log('=== Verified Job Source Refresh ===');
  await connectMongo();
  console.log(`MongoDB connected: ${mongoose.connection.name}`);

  const sources = loadRegistry();
  if (!sources.length) throw new Error('No verified job sources configured.');

  const summary = {
    generatedAt: new Date().toISOString(),
    sourcesConfigured: sources.length,
    companiesProcessed: 0,
    successful: 0,
    failed: 0,
    jobsDiscovered: 0,
    jobsAdded: 0,
    jobsUpdated: 0,
    duplicatesRemoved: 0,
    rejected: 0
  };

  for (const source of sources) {
    summary.companiesProcessed += 1;
    console.log(`\nRefreshing: ${source.companyName} [${source.ats}]`);
    console.log(`Source: ${source.sourceUrl}`);

    try {
      const company = await Company.findOne({ companyId: String(source.companyId) }).lean();
      if (!company) throw new Error(`Golden company ${source.companyId} not found in MongoDB.`);

      const result = await discoverCompanyJobs(
        {
          ...company,
          companyId: String(source.companyId),
          companyName: source.companyName,
          careersUrl: source.sourceUrl,
          ats: source.ats,
          atsSlug: source.atsSlug || company.atsSlug,
          atsSite: source.atsSite || company.atsSite
        },
        { persist: true, now: new Date() }
      );

      if (result.status === 'error' || result.status === 'invalid' || result.status === 'unconfigured') {
        summary.failed += 1;
        summary.rejected += result.rejected?.length || 0;
        console.log(`Status: ${result.status}`);
        continue;
      }

      summary.successful += 1;
      summary.jobsDiscovered += result.jobs.length;
      summary.jobsAdded += result.added;
      summary.jobsUpdated += result.updated;
      summary.duplicatesRemoved += result.duplicatesRemoved;
      summary.rejected += result.rejected?.length || 0;

      console.log('Status: ok');
      console.log(`Jobs discovered: ${result.jobs.length}`);
      console.log(`Jobs added: ${result.added}`);
      console.log(`Jobs updated: ${result.updated}`);
      console.log(`Duplicates removed: ${result.duplicatesRemoved}`);
    } catch (error) {
      summary.failed += 1;
      console.error(`Status: failed - ${error.message}`);
    }
  }

  console.log('\n=== VERIFIED SOURCE REFRESH SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`MongoDB job count: ${await Job.countDocuments()}`);
}

run()
  .catch(error => {
    console.error('\nVERIFIED SOURCE REFRESH FAILED:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
