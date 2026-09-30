import mongoose from 'mongoose';
import dotenv from 'dotenv';

import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { discoverCompanyJobs } from '../services/companyDiscovery.js';
import { resolveATSConfig } from '../ats/detector.js';
import { getCareerSourceOverride } from '../config/career-source-overrides.js';

dotenv.config();

const TARGET_COMPANIES = 50;
const CANDIDATE_LIMIT = 1000;
const DELAY_MS = 750;
const CONTROLLED_TEST_IDS = new Set(['1', '3', '8', '11', '12']);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function selectGoldenCompanies() {
  const cursor = Company.find({
    enabled: true,
    careersUrl: { $exists: true, $nin: ['', null] },
    companyId: { $nin: [...CONTROLLED_TEST_IDS] }
  })
    .select('companyId companyName companyNumber careersUrl ats enabled metadata')
    .sort({ companyId: 1 })
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

    selected.push({
      ...company,
      careersUrl: source.careersUrl,
      ats: resolved.ats || 'custom',
      atsSlug: resolved.slug || source.atsSlug || company.companyId,
      atsSite: resolved.site || null,
      atsDetectionSource: override?.source || resolved.source || 'inferred'
    });
  }

  return { selected, candidatesChecked };
}

async function main() {
  console.log('=== Golden Sponsor Job Discovery: Controlled 50-Company Batch ===');
  await connectMongo();
  console.log(`MongoDB connected: ${mongoose.connection.name}`);

  const { selected, candidatesChecked } = await selectGoldenCompanies();
  if (selected.length === 0) {
    throw new Error('No enabled golden sponsor companies with careers URLs could be found.');
  }

  console.log(`Checked ${candidatesChecked} candidates.`);
  console.log(`Selected ${selected.length} new golden companies.`);
  console.log(`Delay between companies: ${DELAY_MS}ms`);
  console.log('');

  const results = [];

  for (let index = 0; index < selected.length; index += 1) {
    const company = selected[index];
    console.log(`[${index + 1}/${selected.length}] ${company.companyName} [${company.ats}]`);
    console.log(`Careers: ${company.careersUrl}`);
    console.log(`ATS source: ${company.atsDetectionSource}`);

    try {
      const result = await discoverCompanyJobs(company, { persist: true, now: new Date() });
      results.push(result);

      console.log(`Status: ${result.status}`);
      console.log(`Jobs discovered: ${result.jobs.length}`);
      console.log(`Added: ${result.added} | Updated: ${result.updated} | Duplicates: ${result.duplicatesRemoved}`);
      if (result.rejected?.length) console.log(`Rejected: ${result.rejected.length}`);
    } catch (error) {
      results.push({ company, status: 'error', jobs: [], added: 0, updated: 0, duplicatesRemoved: 0, rejected: [{ reason: 'exception', message: error.message }] });
      console.log(`Status: error`);
      console.log(`Error: ${error.message}`);
    }

    console.log('---');
    if (index < selected.length - 1) await sleep(DELAY_MS);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    candidatesChecked,
    companiesTested: results.length,
    successful: results.filter(r => r.status === 'ok').length,
    failed: results.filter(r => r.status === 'error').length,
    unconfigured: results.filter(r => r.status === 'unconfigured').length,
    jobsDiscovered: results.reduce((sum, r) => sum + (r.jobs?.length || 0), 0),
    jobsAdded: results.reduce((sum, r) => sum + (r.added || 0), 0),
    jobsUpdated: results.reduce((sum, r) => sum + (r.updated || 0), 0),
    duplicatesRemoved: results.reduce((sum, r) => sum + (r.duplicatesRemoved || 0), 0),
    rejected: results.reduce((sum, r) => sum + (r.rejected?.length || 0), 0),
    companies: results.map(r => ({
      companyId: r.company?.companyId,
      companyName: r.company?.companyName,
      ats: r.company?.ats || null,
      careersUrl: r.company?.careersUrl || null,
      atsSource: r.company?.atsDetectionSource || null,
      status: r.status,
      jobs: r.jobs?.length || 0,
      added: r.added || 0,
      updated: r.updated || 0,
      duplicatesRemoved: r.duplicatesRemoved || 0,
      rejected: r.rejected?.length || 0
    }))
  };

  console.log('');
  console.log('=== CONTROLLED 50-COMPANY SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('');
  console.log('No companies outside this selected batch were processed.');

  await mongoose.disconnect();
  console.log('MongoDB connection closed.');
}

main().catch(async error => {
  console.error('JOB DISCOVERY 50 FAILED:', error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
