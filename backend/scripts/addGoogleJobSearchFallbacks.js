import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { Job } from '../models/Job.js';

dotenv.config();

function buildGoogleJobsUrl(companyName, employerType = '') {
  const suffix = employerType === 'nhs'
    ? ' NHS UK jobs careers'
    : employerType === 'universities'
      ? ' university UK jobs careers'
      : employerType === 'councils'
        ? ' council UK jobs careers'
        : ' UK jobs careers';
  return `https://www.google.com/search?q=${encodeURIComponent(`"${companyName}"${suffix}`)}`;
}

await connectMongo();

const jobCounts = await Job.aggregate([
  { $match: { companyId: { $exists: true, $nin: ['', null] } } },
  { $group: { _id: '$companyId', count: { $sum: 1 } } }
]);
const counts = new Map(jobCounts.map(row => [String(row._id), row.count]));
const companies = await Company.find({ enabled: true }).select({ companyId: 1, companyName: 1, employerType: 1, metadata: 1 }).lean();

let candidates = 0;
let updated = 0;

for (const company of companies) {
  if ((counts.get(String(company.companyId)) || 0) > 0) continue;
  candidates += 1;
  const metadata = company.metadata && typeof company.metadata === 'object' ? { ...company.metadata } : {};
  const googleJobsSearchUrl = buildGoogleJobsUrl(company.companyName, company.employerType);
  metadata.discoveryFallback = {
    ...(metadata.discoveryFallback || {}),
    type: 'google_jobs_search',
    url: googleJobsSearchUrl,
    reason: 'no_discovered_jobs',
    generatedAt: new Date().toISOString()
  };
  await Company.updateOne({ _id: company._id }, { $set: { metadata } });
  updated += 1;
}

console.log('=== GOOGLE JOB SEARCH FALLBACK SUMMARY ===');
console.log(JSON.stringify({
  enabledCompanies: companies.length,
  companiesWithNoDiscoveredJobs: candidates,
  fallbackUrlsUpdated: updated,
  fallbackType: 'google_jobs_search'
}, null, 2));

await mongoose.disconnect();
