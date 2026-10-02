import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';
import { Application } from '../models/Application.js';

const dryRun = !process.argv.includes('--apply');
const resolveCompanyConflicts = process.argv.includes('--resolve-company-conflicts');

function scoreJob(job) {
  let value = 0;
  if (job.verification?.status === 'live') value += 100;
  if (job.verification?.finalUrl === job.applyUrl && job.applyUrl) value += 30;
  if (job.source?.url === job.applyUrl && job.applyUrl) value += 20;
  if (job.externalId) value += 10;
  if (job.companyId) value += 5;
  if (job.title) value += 5;
  if (job.description) value += 2;
  if (job.location) value += 2;
  if (job.dates?.lastSeenAt) value += Math.min(10, Math.floor(new Date(job.dates.lastSeenAt).getTime() / 1e12));
  return value;
}

function scoreCompany(company, job) {
  if (!company) return -1;

  let value = 0;
  if (company.enabled !== false) value += 100;
  if (company.sponsorship === 'verified') value += 40;
  if (company.priority === 'high') value += 20;
  else if (company.priority === 'medium') value += 10;
  if (company.ats && company.ats !== 'unknown') value += 10;
  if (company.website) value += 3;
  if (company.careersUrl) value += 3;
  if (job.companyName && company.companyName &&
      job.companyName.trim().toLowerCase() === company.companyName.trim().toLowerCase()) value += 25;

  return value;
}

function chooseCompany(companies, jobs) {
  const jobByCompany = new Map(jobs.map(job => [job.companyId, job]));
  return [...companies]
    .map(company => ({ company, score: scoreCompany(company, jobByCompany.get(company.companyId)) }))
    .sort((a, b) => b.score - a.score || String(a.company.companyId).localeCompare(String(b.company.companyId)))[0] || null;
}

function chooseSurvivor(jobs, canonicalCompanyId = null) {
  return [...jobs].sort((a, b) => {
    const canonicalDiff = Number(b.companyId === canonicalCompanyId) - Number(a.companyId === canonicalCompanyId);
    if (canonicalDiff) return canonicalDiff;

    const scoreDiff = scoreJob(b) - scoreJob(a);
    if (scoreDiff) return scoreDiff;
    return String(b._id).localeCompare(String(a._id));
  })[0];
}

await connectMongo();

const groups = await Job.aggregate([
  {
    $match: {
      'verification.status': 'live',
      applyUrl: { $type: 'string', $ne: '' }
    }
  },
  {
    $group: {
      _id: '$applyUrl',
      count: { $sum: 1 },
      ids: { $push: '$_id' }
    }
  },
  { $match: { count: { $gt: 1 } } },
  { $sort: { count: -1, _id: 1 } }
]);

let scannedGroups = 0;
let duplicateDocuments = 0;
let excessDuplicates = 0;
let deleted = 0;
let companyConflictGroups = 0;
let conflictDocuments = 0;
let resolvedCompanyConflictGroups = 0;
let unresolvedCompanyConflictGroups = 0;
let skipped = 0;
let applicationReferencesUpdated = 0;
const conflictExamples = [];

for (const group of groups) {
  scannedGroups += 1;
  duplicateDocuments += group.count;
  excessDuplicates += group.count - 1;

  const jobs = await Job.find({ _id: { $in: group.ids } }).lean();
  const companyIds = [...new Set(jobs.map(job => job.companyId || '').filter(Boolean))];
  const conflict = companyIds.length > 1;

  let canonicalCompanyId = null;
  let companyResolution = null;

  if (conflict) {
    companyConflictGroups += 1;
    conflictDocuments += group.count - 1;

    const companies = await Company.find({ companyId: { $in: companyIds } }).lean();
    companyResolution = chooseCompany(companies, jobs);

    if (companyResolution) {
      canonicalCompanyId = companyResolution.company.companyId;
      resolvedCompanyConflictGroups += 1;
    } else {
      unresolvedCompanyConflictGroups += 1;
    }

    if (conflictExamples.length < 20) {
      conflictExamples.push({
        applyUrl: group._id,
        count: group.count,
        companies: companyIds,
        titles: [...new Set(jobs.map(job => job.title).filter(Boolean))],
        canonicalCompanyId,
        canonicalCompanyName: companyResolution?.company?.companyName || null,
        canonicalCompanyScore: companyResolution?.score ?? null
      });
    }

    // Company identity affects matching and sponsorship semantics. Only resolve
    // cross-company duplicates when the company dataset gives us a deterministic
    // canonical company. Never guess when none of the IDs exists in Company.
    if (!resolveCompanyConflicts || !canonicalCompanyId) {
      skipped += group.count - 1;
      continue;
    }
  }

  const survivor = chooseSurvivor(jobs, canonicalCompanyId);
  const losers = jobs.filter(job => String(job._id) !== String(survivor._id));
  const loserIds = losers.map(job => String(job._id));

  if (!dryRun) {
    const applicationResult = await Application.updateMany(
      { 'job.id': { $in: loserIds } },
      {
        $set: {
          'job.id': String(survivor._id),
          'job.title': survivor.title,
          'job.company': survivor.companyName,
          'job.companyId': survivor.companyId,
          'job.url': survivor.applyUrl
        }
      }
    );
    applicationReferencesUpdated += applicationResult.modifiedCount || 0;

    await Job.deleteMany({ _id: { $in: loserIds } });
    deleted += losers.length;
  }
}

console.log(JSON.stringify({
  dryRun,
  resolveCompanyConflicts,
  scannedGroups,
  duplicateDocuments,
  excessDuplicates,
  deleted,
  companyConflictGroups,
  conflictDocuments,
  resolvedCompanyConflictGroups,
  unresolvedCompanyConflictGroups,
  skipped,
  applicationReferencesUpdated,
  conflictExamples
}, null, 2));

await mongoose.disconnect();
