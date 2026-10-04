import 'dotenv/config';
import mongoose from 'mongoose';
import Job from '../models/Job.js';
import MatchResult from '../models/MatchResult.js';
import { matchJobToCandidate } from '../services/candidateMatching.js';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value ?? true];
}));

const limit = Math.max(1, Number(args.limit ?? 100));
const batchSize = Math.max(1, Number(args['batch-size'] ?? 50));
const profileId = args['profile-id'] || process.env.MATCH_PROFILE_ID;

if (!profileId) {
  console.error('Missing --profile-id or MATCH_PROFILE_ID');
  process.exit(1);
}

const profile = {
  _id: profileId,
  yearsExperience: Number(process.env.MATCH_YEARS_EXPERIENCE ?? 2.5),
  skills: (process.env.MATCH_SKILLS ?? 'JavaScript,TypeScript,React,Node.js,HTML,CSS,Redux,REST APIs,AWS').split(',').map((x) => x.trim()).filter(Boolean),
  targetTitles: (process.env.MATCH_TARGET_TITLES ?? 'Software Engineer,Frontend Developer,Full Stack Developer,Frontend Software Engineer').split(',').map((x) => x.trim()).filter(Boolean),
  locations: ['United Kingdom'],
  employmentTypes: ['full-time'],
  excludedSkills: (process.env.MATCH_EXCLUDED_SKILLS ?? 'Java,.NET,Python,React Native').split(',').map((x) => x.trim()).filter(Boolean),
  workAuthorisation: { sponsorshipRequired: true }
};

await mongoose.connect(process.env.MONGODB_URI);
const query = { _id: { $exists: true } };
const total = await Job.countDocuments(query);
const jobs = await Job.find(query).sort({ _id: 1 }).limit(limit).lean();
let processed = 0;
const counts = { strong: 0, possible: 0, weak: 0 };

for (let i = 0; i < jobs.length; i += batchSize) {
  const batch = jobs.slice(i, i + batchSize);
  const ops = batch.map((job) => {
    const result = matchJobToCandidate(job, profile);
    counts[result.applicationFit] = (counts[result.applicationFit] ?? 0) + 1;
    return {
      updateOne: {
        filter: { profileId, jobId: job._id },
        update: { $set: { profileId, jobId: job._id, ...result, matcherVersion: 'v1', calculatedAt: new Date() } },
        upsert: true
      }
    };
  });
  await MatchResult.bulkWrite(ops, { ordered: false });
  processed += batch.length;
  console.log(`[match] processed=${processed}/${jobs.length}`);
}

console.log(JSON.stringify({ totalJobs: total, selected: jobs.length, processed, counts }, null, 2));
await mongoose.disconnect();
