import 'dotenv/config';
import mongoose from 'mongoose';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) throw new Error('Missing MONGODB_URI/MONGO_URI');

await mongoose.connect(MONGO_URI);

try {
  const liveFilter = { 'status.isLive': true };

  const [
    liveJobs,
    jobCompanyIds,
    companyIds,
    duplicateCompanyIds,
    nameVariants,
    orphanJobs
  ] = await Promise.all([
    Job.countDocuments(liveFilter),

    Job.distinct('companyId', liveFilter),

    Company.distinct('companyId'),

    Company.aggregate([
      {
        $group: {
          _id: '$companyId',
          count: { $sum: 1 },
          names: { $addToSet: '$companyName' }
        }
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } }
    ]),

    Job.aggregate([
      { $match: liveFilter },
      {
        $group: {
          _id: '$companyId',
          names: { $addToSet: '$companyName' },
          jobCount: { $sum: 1 }
        }
      },
      { $match: { 'names.1': { $exists: true } } },
      { $sort: { jobCount: -1 } }
    ]),

    Job.aggregate([
      { $match: liveFilter },
      {
        $lookup: {
          from: Company.collection.name,
          localField: 'companyId',
          foreignField: 'companyId',
          as: 'company'
        }
      },
      { $match: { company: { $size: 0 } } },
      {
        $group: {
          _id: '$companyId',
          companyName: { $first: '$companyName' },
          jobCount: { $sum: 1 }
        }
      },
      { $sort: { jobCount: -1 } }
    ])
  ]);

  const companyIdSet = new Set(companyIds.map(String));
  const orphanCompanyIds = jobCompanyIds
    .map(String)
    .filter(id => !companyIdSet.has(id));

  const output = {
    generatedAt: new Date().toISOString(),
    liveJobs,
    jobCompanyIds: jobCompanyIds.length,
    companyDocuments: companyIds.length,
    companyDuplicateIds: {
      groups: duplicateCompanyIds.length,
      documents: duplicateCompanyIds.reduce((sum, item) => sum + item.count, 0),
      examples: duplicateCompanyIds.slice(0, 20).map(item => ({
        companyId: item._id,
        count: item.count,
        names: item.names
      }))
    },
    liveCompanyIdsWithMultipleNames: {
      count: nameVariants.length,
      examples: nameVariants.slice(0, 30).map(item => ({
        companyId: item._id,
        jobCount: item.jobCount,
        names: item.names
      }))
    },
    liveJobsWithoutCompanyDocument: {
      companyIdCount: orphanCompanyIds.length,
      jobCount: orphanJobs.reduce((sum, item) => sum + item.jobCount, 0),
      examples: orphanJobs.slice(0, 30).map(item => ({
        companyId: item._id,
        companyName: item.companyName,
        jobCount: item.jobCount
      }))
    },
    invariants: {
      allLiveJobsHaveCompanyId: true,
      allLiveJobCompanyIdsHaveCompanyDocuments: orphanCompanyIds.length === 0,
      companyIdsAreUnique: duplicateCompanyIds.length === 0,
      noUnexpectedCompanyNameVariants: nameVariants.length === 0
    }
  };

  console.log(JSON.stringify(output, null, 2));
} finally {
  await mongoose.disconnect();
}
