import 'dotenv/config';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';

async function main() {
  await connectMongo();

  const checks = {
    totalJobs: await Job.countDocuments(),
    liveJobs: await Job.countDocuments({ 'status.isLive': true }),
    closedJobs: await Job.countDocuments({ 'status.isLive': false }),
    jobsWithSourceUrl: await Job.countDocuments({ 'source.url': { $ne: '' } }),
    jobsWithKnownAts: await Job.countDocuments({ 'source.ats': { $ne: 'unknown' } }),
    jobsWithClosingDate: await Job.countDocuments({ 'dates.closingAt': { $ne: null } }),
    jobsWithPostedDate: await Job.countDocuments({ 'dates.postedAt': { $ne: null } }),
  };

  console.log('=== JOB DATASET QUALITY CHECK ===');
  console.table(checks);
  console.log(`Total jobs: ${checks.totalJobs}`);
  console.log(`Live: ${checks.liveJobs}`);
  console.log(`Closed: ${checks.closedJobs}`);
  console.log(`Source URL: ${checks.jobsWithSourceUrl}`);
  console.log(`Known ATS: ${checks.jobsWithKnownAts}`);
  console.log(`Closing date: ${checks.jobsWithClosingDate}`);
  console.log(`Posted date: ${checks.jobsWithPostedDate}`);
}

main()
  .catch((error) => {
    console.error('JOB DATASET QUALITY CHECK FAILED:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
