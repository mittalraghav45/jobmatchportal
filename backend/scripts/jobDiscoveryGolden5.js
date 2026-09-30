import mongoose from 'mongoose';
import dotenv from 'dotenv';

import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { discoverCompanyJobs } from '../services/companyDiscovery.js';
import { resolveATSConfig } from '../ats/detector.js';

dotenv.config();

const TARGET_COMPANIES = 5;

async function selectGoldenCompanies() {
  const cursor = Company.find({
    enabled: true,
    careersUrl: { $exists: true, $nin: ['', null] }
  })
    .select('companyId companyName companyNumber careersUrl ats enabled metadata')
    .lean()
    .cursor();

  const selected = [];

  for await (const company of cursor) {
    const resolved = resolveATSConfig({
      careersUrl: company.careersUrl
    });

    if (!resolved.ats) continue;

    selected.push({
      ...company,
      ats: resolved.ats,
      atsSlug: resolved.slug,
      atsSite: resolved.site
    });

    if (selected.length >= TARGET_COMPANIES) break;
  }

  return selected;
}

async function main() {
  console.log('=== Golden Sponsor Job Discovery: Controlled 5-Company Test ===');

  await connectMongo();
  console.log(`MongoDB connected: ${mongoose.connection.name}`);

  const companies = await selectGoldenCompanies();

  if (companies.length === 0) {
    throw new Error('No golden sponsor companies with a supported ATS could be found.');
  }

  console.log(`Selected ${companies.length} golden companies.`);
  console.log('');

  const results = [];

  for (const company of companies) {
    console.log(`Testing: ${company.companyName} [${company.ats}]`);
    console.log(`Careers: ${company.careersUrl}`);

    const result = await discoverCompanyJobs(company, {
      persist: true,
      now: new Date()
    });

    results.push(result);

    console.log(`Status: ${result.status}`);
    console.log(`Jobs discovered: ${result.jobs.length}`);
    console.log(`Jobs added: ${result.added}`);
    console.log(`Jobs updated: ${result.updated}`);
    console.log(`Duplicates removed: ${result.duplicatesRemoved}`);

    if (result.rejected?.length) {
      console.log(`Rejected: ${result.rejected.length}`);
    }

    console.log('---');
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    companiesTested: results.length,
    successful: results.filter(r => r.status === 'ok').length,
    failed: results.filter(r => r.status === 'error').length,
    jobsDiscovered: results.reduce((sum, r) => sum + r.jobs.length, 0),
    jobsAdded: results.reduce((sum, r) => sum + r.added, 0),
    jobsUpdated: results.reduce((sum, r) => sum + r.updated, 0),
    duplicatesRemoved: results.reduce((sum, r) => sum + r.duplicatesRemoved, 0),
    companies: results.map(r => ({
      companyId: r.company.companyId,
      companyName: r.company.companyName,
      ats: r.company.ats || null,
      careersUrl: r.company.careersUrl,
      status: r.status,
      jobs: r.jobs.length,
      added: r.added,
      updated: r.updated,
      rejected: r.rejected?.length || 0
    }))
  };

  console.log('');
  console.log('=== CONTROLLED TEST SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('');
  console.log('No other sponsor companies were scraped.');
  console.log('');

  await mongoose.disconnect();
  console.log('MongoDB connection closed.');
}

main().catch(async error => {
  console.error('JOB DISCOVERY TEST FAILED:', error.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
