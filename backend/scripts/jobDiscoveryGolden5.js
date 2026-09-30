import mongoose from 'mongoose';
import dotenv from 'dotenv';

import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { discoverCompanyJobs } from '../services/companyDiscovery.js';
import { resolveATSConfig } from '../ats/detector.js';
import { getCareerSourceOverride } from '../config/career-source-overrides.js';

dotenv.config();

const TARGET_COMPANIES = 5;
const CANDIDATE_LIMIT = 100;

async function selectGoldenCompanies() {
  const cursor = Company.find({
    enabled: true,
    careersUrl: { $exists: true, $nin: ['', null] }
  })
    .select('companyId companyName companyNumber careersUrl ats enabled metadata')
    .lean()
    .cursor();

  const selected = [];
  let candidatesChecked = 0;

  for await (const company of cursor) {
    candidatesChecked += 1;
    if (candidatesChecked > CANDIDATE_LIMIT || selected.length >= TARGET_COMPANIES) break;

    const override = getCareerSourceOverride(company);
    const source = override || company;

    const resolved = resolveATSConfig({
      ats: source.ats,
      atsSlug: source.atsSlug || source.metadata?.atsSlug,
      careersUrl: source.careersUrl
    });

    const ats = resolved.ats || 'custom';
    const slug = resolved.slug || source.atsSlug || company.companyId;

    selected.push({
      ...company,
      careersUrl: source.careersUrl,
      ats,
      atsSlug: slug,
      atsSite: resolved.site || null,
      atsDetectionSource: override?.source || resolved.source
    });
  }

  return { selected, candidatesChecked };
}

async function main() {
  console.log('=== Golden Sponsor Job Discovery: Controlled 5-Company Test ===');

  await connectMongo();
  console.log(`MongoDB connected: ${mongoose.connection.name}`);

  const { selected, candidatesChecked } = await selectGoldenCompanies();

  if (selected.length === 0) {
    throw new Error('No enabled golden sponsor companies with careers URLs could be found.');
  }

  console.log(`Checked up to ${candidatesChecked} golden companies.`);
  console.log(`Selected ${selected.length} golden companies.`);
  console.log('');

  const results = [];

  for (const company of selected) {
    console.log(`Testing: ${company.companyName} [${company.ats}]`);
    console.log(`Careers: ${company.careersUrl}`);
    console.log(`ATS detection source: ${company.atsDetectionSource}`);

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
      result.rejected.slice(0, 5).forEach(item => {
        console.log(`  - ${item.reason}${item.message ? `: ${item.message}` : ''}`);
      });
    }

    console.log('---');
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    candidatesChecked,
    companiesTested: results.length,
    successful: results.filter(r => r.status === 'ok').length,
    failed: results.filter(r => r.status === 'error').length,
    unconfigured: results.filter(r => r.status === 'unconfigured').length,
    jobsDiscovered: results.reduce((sum, r) => sum + r.jobs.length, 0),
    jobsAdded: results.reduce((sum, r) => sum + r.added, 0),
    jobsUpdated: results.reduce((sum, r) => sum + r.updated, 0),
    duplicatesRemoved: results.reduce((sum, r) => sum + r.duplicatesRemoved, 0),
    companies: results.map(r => ({
      companyId: r.company.companyId,
      companyName: r.company.companyName,
      ats: r.company.ats || null,
      careersUrl: r.company.careersUrl,
      atsSource: r.company.atsDetectionSource || r.company.atsSource || null,
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
  console.log('Only the selected controlled companies were processed.');
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
