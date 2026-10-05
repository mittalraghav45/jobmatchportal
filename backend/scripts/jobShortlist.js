import 'dotenv/config';
import { connectMongo } from '../db/mongoose.js';
import Job from '../models/Job.js';

const limit = Math.min(Number(process.env.SHORTLIST_LIMIT || 50), 100);
const profile = {
  languages: ['javascript', 'typescript'],
  frameworks: ['react', 'node.js', 'nodejs', 'redux'],
  excluded: ['java', '.net', 'python', 'react native'],
};

function text(job) {
  return [job.title, job.description, job.companyName, job.location].filter(Boolean).join(' ').toLowerCase();
}

function score(job) {
  const t = text(job);
  let s = 0;
  if (/\bjavascript\b/.test(t)) s += 20;
  if (/\btypescript\b/.test(t)) s += 20;
  if (/\breact\b/.test(t)) s += 20;
  if (/\b(node\.js|nodejs)\b/.test(t)) s += 15;
  if (/\bredux\b/.test(t)) s += 5;
  if (/software engineer|software developer|frontend|full[- ]stack|web developer/.test(t)) s += 15;
  if (/junior|graduate|associate|mid[- ]level|engineer ii|developer ii/.test(t)) s += 5;
  if (profile.excluded.some(x => t.includes(x))) s -= 100;
  return s;
}

await connectMongo();

const jobs = await Job.find({
  $or: [
    { sourceKind: { $in: ['greenhouse', 'lever', 'ashby', 'public_sector', 'custom'] } },
    { source: { $in: ['greenhouse', 'lever', 'ashby', 'public_sector', 'custom'] } },
  ],
}).lean();

const ranked = jobs
  .map(job => ({ ...job, matchScore: score(job) }))
  .filter(job => job.matchScore >= 50)
  .sort((a, b) => b.matchScore - a.matchScore || String(b.postedAt || '').localeCompare(String(a.postedAt || '')))
  .slice(0, limit);

console.log(JSON.stringify({
  totalCandidates: jobs.length,
  shortlisted: ranked.length,
  jobs: ranked.map(j => ({
    id: j._id?.toString(),
    title: j.title,
    companyName: j.companyName,
    location: j.location,
    workMode: j.workMode ?? null,
    employmentType: j.employmentType ?? null,
    postedAt: j.postedAt ?? null,
    applyUrl: j.applyUrl,
    source: j.source ?? j.sourceKind ?? null,
    matchScore: j.matchScore,
  })),
}, null, 2));

process.exit(0);
