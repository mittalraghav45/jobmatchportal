import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { Job } from '../models/Job.js';

dotenv.config();

const RUNS = [
  { runId: 'golden-full-1', start: 1, end: 6000 },
  { runId: 'golden-full-2', start: 6001, end: 12000 },
  { runId: 'golden-full-3', start: 12001, end: 18000 },
  { runId: 'golden-full-4', start: 18001, end: 21516 }
];
const EXPECTED_MAX_ID = Number(process.env.GOLDEN_EXPECTED_COMPANIES || 21516);
const CONTROLLED_TEST_IDS = new Set(['1', '3', '8', '11', '12']);

function numericId(value) {
  const n = Number(String(value));
  return Number.isInteger(n) ? n : null;
}

function unique(values) {
  return [...new Set(values.map(String))];
}

async function checkpointStats(runId) {
  return mongoose.connection.db.collection('golden_discovery_checkpoints').aggregate([
    { $match: { runId } },
    { $group: {
      _id: '$status',
      count: { $sum: 1 },
      jobsDiscovered: { $sum: { $ifNull: ['$jobsDiscovered', 0] } },
      jobsAdded: { $sum: { $ifNull: ['$jobsAdded', 0] } },
      jobsUpdated: { $sum: { $ifNull: ['$jobsUpdated', 0] } },
      duplicatesRemoved: { $sum: { $ifNull: ['$duplicatesRemoved', 0] } },
      rejected: { $sum: { $ifNull: ['$rejected', 0] } }
    } }
  ]).toArray();
}

async function main() {
  await connectMongo();
  const db = mongoose.connection.db;

  console.log('=== GOLDEN FULL DATASET RECONCILIATION ===');
  console.log(`Expected company ID range: 1-${EXPECTED_MAX_ID}`);

  const [totalCompanies, enabledCompanies, disabledCompanies] = await Promise.all([
    Company.countDocuments({}),
    Company.countDocuments({ enabled: true }),
    Company.countDocuments({ enabled: false })
  ]);

  const enabledRows = await Company.find({ enabled: true })
    .select('companyId companyName enabled')
    .sort({ companyId: 1 })
    .lean();

  const enabledIds = unique(enabledRows.map(row => row.companyId));
  const enabledNumericIds = new Set(enabledIds.map(numericId).filter(n => n !== null));
  const expectedEnabledIds = [];
  for (let id = 1; id <= EXPECTED_MAX_ID; id += 1) {
    const key = String(id);
    if (!CONTROLLED_TEST_IDS.has(key)) expectedEnabledIds.push(key);
  }

  const missingEnabledIds = expectedEnabledIds.filter(id => !enabledIds.includes(id));
  const nonNumericEnabledIds = enabledIds.filter(id => numericId(id) === null);
  const duplicateCompanyIds = await db.collection('companies').aggregate([
    { $group: { _id: '$companyId', count: { $sum: 1 }, names: { $addToSet: '$companyName' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();

  const runReports = [];
  const unionCheckpointIds = new Set();
  const perRunIds = new Map();

  for (const run of RUNS) {
    const stats = await checkpointStats(run.runId);
    const ids = await db.collection('golden_discovery_checkpoints')
      .find({ runId: run.runId }, { projection: { companyId: 1 } })
      .toArray();
    const idSet = new Set(ids.map(row => String(row.companyId)));
    perRunIds.set(run.runId, idSet);
    ids.forEach(row => unionCheckpointIds.add(String(row.companyId)));
    runReports.push({
      ...run,
      checkpointCount: ids.length,
      statusBreakdown: stats
    });
  }

  const missingFromAllRuns = expectedEnabledIds.filter(id => !unionCheckpointIds.has(id));
  const unexpectedCheckpointIds = [...unionCheckpointIds].filter(id => !enabledIds.includes(id));

  const duplicateCheckpointRows = await db.collection('golden_discovery_checkpoints').aggregate([
    { $match: { runId: { $in: RUNS.map(run => run.runId) } } },
    { $group: { _id: '$companyId', count: { $sum: 1 }, runs: { $addToSet: '$runId' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();

  const [jobTotal, jobLive, jobClosed, jobUnknown, jobUnverified, jobWithApplyUrl, jobWithCompany, jobWithTitle, jobWithSourceUrl] = await Promise.all([
    Job.countDocuments({}),
    Job.countDocuments({ 'status.isLive': true }),
    Job.countDocuments({ 'status.isLive': false }),
    Job.countDocuments({ 'verification.status': 'unknown' }),
    Job.countDocuments({ 'verification.status': { $exists: false } }),
    Job.countDocuments({ applyUrl: { $type: 'string', $ne: '' } }),
    Job.countDocuments({ companyId: { $type: 'string', $ne: '' } }),
    Job.countDocuments({ title: { $type: 'string', $ne: '' } }),
    Job.countDocuments({ 'source.url': { $type: 'string', $ne: '' } })
  ]);

  const liveUrlDuplicates = await Job.aggregate([
    { $match: { 'status.isLive': true, applyUrl: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$applyUrl', count: { $sum: 1 }, jobs: { $push: { id: '$_id', title: '$title', companyId: '$companyId', companyName: '$companyName' } } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);

  const liveByVerification = await Job.aggregate([
    { $match: { 'status.isLive': true } },
    { $group: { _id: '$verification.status', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  const liveByAts = await Job.aggregate([
    { $match: { 'status.isLive': true } },
    { $group: { _id: '$source.ats', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    expected: {
      companyIds: EXPECTED_MAX_ID,
      controlledExcluded: [...CONTROLLED_TEST_IDS].map(Number).sort((a, b) => a - b),
      expectedEnabledScannable: expectedEnabledIds.length
    },
    companies: {
      total: totalCompanies,
      enabled: enabledCompanies,
      disabled: disabledCompanies,
      enabledIdCount: enabledIds.length,
      nonNumericEnabledIds,
      missingFromExpectedEnabled: missingEnabledIds,
      duplicateCompanyIds: duplicateCompanyIds.map(row => ({ companyId: row._id, count: row.count, names: row.names })),
      enabledNumericMin: Math.min(...enabledNumericIds),
      enabledNumericMax: Math.max(...enabledNumericIds)
    },
    discoveryRuns: runReports,
    checkpointReconciliation: {
      uniqueCheckpointCompaniesAcrossRuns: unionCheckpointIds.size,
      expectedScannableCompanies: expectedEnabledIds.length,
      missingFromAllFourRuns: missingFromAllRuns,
      unexpectedCheckpointCompanyIds: unexpectedCheckpointIds,
      duplicateCheckpointCompanyIds: duplicateCheckpointRows.map(row => ({ companyId: row._id, count: row.count, runs: row.runs }))
    },
    jobs: {
      total: jobTotal,
      live: jobLive,
      closed: jobClosed,
      unknownStatus: jobUnknown,
      unverifiedFieldMissing: jobUnverified,
      withApplyUrl: jobWithApplyUrl,
      withCompany: jobWithCompany,
      withTitle: jobWithTitle,
      withSourceUrl: jobWithSourceUrl,
      liveByVerification,
      liveByAts,
      liveDuplicateApplyUrlGroups: liveUrlDuplicates
    },
    invariants: {
      allExpectedRangesRepresented: missingFromAllRuns.length === 0,
      noDuplicateCompanyIds: duplicateCompanyIds.length === 0,
      noDuplicateCheckpointCompanyIds: duplicateCheckpointRows.length === 0,
      liveJobsHaveApplyUrl: jobLive === Job.countDocuments({ 'status.isLive': true, $or: [{ applyUrl: { $exists: false } }, { applyUrl: '' }, { applyUrl: null }] }),
      liveJobsHaveCompany: jobLive === jobWithCompany,
      liveJobsHaveTitle: jobLive === jobWithTitle,
      noLiveApplyUrlDuplicates: liveUrlDuplicates.length === 0
    }
  };

  // Correct the apply/company/title invariants using live-only counts.
  const [liveWithoutApplyUrl, liveWithoutCompany, liveWithoutTitle, liveWithSourceUrl] = await Promise.all([
    Job.countDocuments({ 'status.isLive': true, $or: [{ applyUrl: { $exists: false } }, { applyUrl: '' }, { applyUrl: null }] }),
    Job.countDocuments({ 'status.isLive': true, $or: [{ companyId: { $exists: false } }, { companyId: '' }, { companyId: null }] }),
    Job.countDocuments({ 'status.isLive': true, $or: [{ title: { $exists: false } }, { title: '' }, { title: null }] }),
    Job.countDocuments({ 'status.isLive': true, 'source.url': { $type: 'string', $ne: '' } })
  ]);
  report.jobs.liveWithoutApplyUrl = liveWithoutApplyUrl;
  report.jobs.liveWithoutCompany = liveWithoutCompany;
  report.jobs.liveWithoutTitle = liveWithoutTitle;
  report.jobs.liveWithSourceUrl = liveWithSourceUrl;
  report.invariants.liveJobsHaveApplyUrl = liveWithoutApplyUrl === 0;
  report.invariants.liveJobsHaveCompany = liveWithoutCompany === 0;
  report.invariants.liveJobsHaveTitle = liveWithoutTitle === 0;

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('GOLDEN DATASET AUDIT FAILED:', error);
  try { await mongoose.disconnect(); } catch {}
  process.exitCode = 1;
});
