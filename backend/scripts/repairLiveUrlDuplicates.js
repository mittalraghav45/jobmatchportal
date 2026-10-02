import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { Application } from '../models/Application.js';

const dryRun = !process.argv.includes('--apply');
const resolveCompanyConflicts = process.argv.includes('--resolve-company-conflicts');

function score(job) {
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

function chooseSurvivor(jobs) {
  return [...jobs].sort((a, b) => {
    const scoreDiff = score(b) - score(a);
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
let skipped = 0;
let applicationReferencesUpdated = 0;
const conflictExamples = [];

for (const group of groups) {
  scannedGroups += 1;
  duplicateDocuments += group.count;
  excessDuplicates += group.count - 1;

  const jobs = await Job.find({ _id: { $in: group.ids } }).lean();
  const companies = new Set(jobs.map(job => job.companyId || '').filter(Boolean));
  const conflict = companies.size > 1;

  if (conflict) {
    companyConflictGroups += 1;
    conflictDocuments += group.count - 1;
    if (conflictExamples.length < 20) {
      conflictExamples.push({
        applyUrl: group._id,
        count: group.count,
        companies: [...companies],
        titles: [...new Set(jobs.map(job => job.title).filter(Boolean))]
      });
    }

    // Company identity is part of the application's matching semantics. Never
    // delete a live duplicate across different company IDs unless the operator
    // explicitly opts into that destructive migration.
    if (!resolveCompanyConflicts) {
      skipped += group.count - 1;
      continue;
    }
  }

  const survivor = chooseSurvivor(jobs);
  const losers = jobs.filter(job => String(job._id) !== String(survivor._id));
  const loserIds = losers.map(job => String(job._id));

  if (!dryRun) {
    // Applications store the job ID as a string, so move references before
    // removing the duplicate job documents.
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
  skipped,
  applicationReferencesUpdated,
  conflictExamples
}, null, 2));

await mongoose.disconnect();
