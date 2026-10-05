import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectMongo, disconnectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';

dotenv.config();

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const value = args.find(arg => arg.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3) : fallback;
};
const intervalMs = Number(getArg('interval', 30000));
const once = args.includes('--once');
const runIds = args.filter(arg => arg.startsWith('--run-id=')).map(arg => arg.slice(9));
const RUN_COLLECTION = 'golden_discovery_runs';
const CHECKPOINT_COLLECTION = 'golden_discovery_checkpoints';

function stamp() {
  return new Date().toISOString();
}

async function snapshot() {
  const db = mongoose.connection.db;
  const [serverStatus, dbStats, jobs, companies, runs, checkpoints, verification] = await Promise.all([
    db.command({ serverStatus: 1 }),
    db.command({ dbStats: 1 }),
    Promise.all([
      Job.countDocuments({}),
      Job.countDocuments({ 'status.isLive': true }),
      Job.countDocuments({ 'verification.status': 'live' }),
      Job.countDocuments({ 'verification.status': 'closed' }),
      Job.countDocuments({ 'verification.status': 'unknown' }),
      Job.countDocuments({ applyUrl: { $type: 'string', $ne: '' } })
    ]),
    Promise.all([
      Company.countDocuments({}),
      Company.countDocuments({ companyId: { $exists: true, $ne: '' } })
    ]),
    db.collection(RUN_COLLECTION).find(runIds.length ? { runId: { $in: runIds } } : {}).sort({ updatedAt: -1 }).limit(10).toArray(),
    db.collection(CHECKPOINT_COLLECTION).find(runIds.length ? { runId: { $in: runIds } } : {}).toArray(),
    Job.aggregate([
      { $match: { 'verification.status': 'live', applyUrl: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$applyUrl', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $group: { _id: null, groups: { $sum: 1 }, duplicateDocuments: { $sum: '$count' }, largestGroup: { $max: '$count' } } }
    ]).allowDiskUse(true)
  ]);

  const mem = process.memoryUsage();
  const [totalJobs, liveJobs, liveVerified, closedVerified, unknownVerified, jobsWithUrl] = jobs;
  const [totalCompanies, identifiedCompanies] = companies;
  const duplicate = verification[0] || { groups: 0, duplicateDocuments: 0, largestGroup: 0 };
  const checkpointByRun = {};
  for (const checkpoint of checkpoints) checkpointByRun[checkpoint.runId] = (checkpointByRun[checkpoint.runId] || 0) + 1;

  return {
    timestamp: stamp(),
    mongo: {
      connected: mongoose.connection.readyState === 1,
      database: mongoose.connection.name,
      host: serverStatus.host,
      connections: serverStatus.connections ? {
        current: serverStatus.connections.current,
        available: serverStatus.connections.available,
        totalCreated: serverStatus.connections.totalCreated
      } : null,
      opcounters: serverStatus.opcounters,
      memoryMB: serverStatus.mem ? { resident: serverStatus.mem.resident, virtual: serverStatus.mem.virtual } : null,
      dbSizeMB: Math.round((dbStats.dataSize || 0) / 1024 / 1024),
      storageSizeMB: Math.round((dbStats.storageSize || 0) / 1024 / 1024)
    },
    jobs: { total: totalJobs, liveStatus: liveJobs, verifiedLive: liveVerified, verifiedClosed: closedVerified, verifiedUnknown: unknownVerified, withApplyUrl: jobsWithUrl },
    companies: { total: totalCompanies, identified: identifiedCompanies },
    duplicates: duplicate,
    discoveryRuns: runs.map(run => ({ runId: run.runId, status: run.status, scanned: run.scanned, resolved: run.resolved, unresolved: run.unresolved, successful: run.successful, failed: run.failed, jobsDiscovered: run.jobsDiscovered, jobsAdded: run.jobsAdded, jobsUpdated: run.jobsUpdated, rejected: run.rejected, updatedAt: run.updatedAt })),
    checkpoints: checkpointByRun,
    monitorProcess: { rssMB: Math.round(mem.rss / 1024 / 1024), heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024) }
  };
}

async function main() {
  await connectMongo();
  do {
    try {
      console.clear();
      console.log('=== JobMatchPortal Golden Discovery Health Monitor ===');
      console.log(JSON.stringify(await snapshot(), null, 2));
      if (!once) console.log(`\nNext check in ${Math.round(intervalMs / 1000)}s. Press Ctrl+C to stop.`);
    } catch (error) {
      console.error(`[${stamp()}] MONITOR ERROR:`, error.message);
    }
    if (!once) await new Promise(resolve => setTimeout(resolve, intervalMs));
  } while (!once);
  await disconnectMongo();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
