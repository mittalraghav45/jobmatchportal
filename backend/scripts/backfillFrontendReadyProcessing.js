import 'dotenv/config';
import mongoose from 'mongoose';
import { Job } from '../models/Job.js';
import { ukJobMongoFilter } from '../utils/ukJobLocation.js';
import { techJobMongoFilter } from '../utils/techJobRole.js';

function and(...filters) {
  return { $and: filters };
}

const missingProcessing = {
  $or: [
    { 'processing.status': { $exists: false } },
    { 'processing.status': null },
    { 'processing.status': '' }
  ]
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  const filter = and(
    ukJobMongoFilter(),
    techJobMongoFilter(),
    { 'status.isLive': true },
    { 'verification.status': 'live' },
    { applyUrl: { $type: 'string', $ne: '' } },
    missingProcessing
  );

  const before = await Job.countDocuments(filter);

  if (before === 0) {
    console.log(JSON.stringify({ matchedBeforeUpdate: 0, modified: 0, message: 'No missing processing records to repair.' }, null, 2));
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  const result = await Job.updateMany(filter, {
    $set: {
      'processing.status': 'complete',
      'processing.completedAt': now,
      'processing.error': ''
    }
  });

  const remaining = await Job.countDocuments(filter);
  const frontendReady = await Job.countDocuments(and(
    ukJobMongoFilter(),
    techJobMongoFilter(),
    { 'status.isLive': true },
    { 'verification.status': 'live' },
    { applyUrl: { $type: 'string', $ne: '' } },
    { 'processing.status': { $in: ['complete', 'pending'] } }
  ));

  console.log(JSON.stringify({
    matchedBeforeUpdate: before,
    modified: result.modifiedCount,
    remainingMissing: remaining,
    frontendReadyAfter: frontendReady
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async error => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
