import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { verifyJobLiveStatus } from '../services/jobLiveVerifier.js';

const CONCURRENCY = Math.max(1, Number(process.env.JOB_VERIFY_CONCURRENCY || 5));
const LIMIT = Math.max(0, Number(process.env.JOB_VERIFY_LIMIT || 0));

async function run() {
  await connectMongo();

  const query = { 'status.liveState': { $ne: 'closed' } };
  const cursor = Job.find(query)
    .select({ _id: 1, source: 1, dates: 1, status: 1, title: 1, companyName: 1, raw: 1 })
    .lean()
    .cursor();

  const jobs = [];
  for await (const job of cursor) {
    jobs.push(job);
    if (LIMIT && jobs.length >= LIMIT) break;
  }

  const summary = { checked: 0, live: 0, closed: 0, unknown: 0, withClosingDate: 0, errors: 0 };
  let next = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= jobs.length) return;
      const job = jobs[index];
      try {
        const result = await verifyJobLiveStatus(job);
        const update = {
          'status.liveState': result.state,
          'status.isLive': result.isLive,
          'status.verification.checkedAt': new Date(result.checkedAt),
          'status.verification.reason': result.reason || '',
          'status.verification.url': result.url || ''
        };
        if (result.closingAt && !job.dates?.closingAt) update['dates.closingAt'] = new Date(result.closingAt);

        await Job.updateOne({ _id: job._id }, { $set: update });
        summary.checked += 1;
        summary[result.state] += 1;
        if (result.closingAt) summary.withClosingDate += 1;
        console.log(`[${summary.checked}/${jobs.length}] ${job.companyName || 'Unknown'} — ${job.title} => ${result.state}${result.closingAt ? `; closes ${result.closingAt}` : ''}`);
      } catch (error) {
        summary.errors += 1;
        console.error(`Verification failed for ${job._id}: ${error.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(jobs.length, 1)) }, worker));
  console.log('\n=== LIVE VERIFICATION SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
}

run()
  .catch(error => {
    console.error('LIVE VERIFICATION FAILED:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
