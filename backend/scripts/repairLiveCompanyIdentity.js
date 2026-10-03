import 'dotenv/config';
import mongoose from 'mongoose';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) throw new Error('Missing MONGODB_URI/MONGO_URI');

const APPLY = process.argv.includes('--apply');
const ORPHANS = ['deliveroo', 'monzo', 'wise'];

const ALIASES = {
  deliveroo: ['deliveroo'],
  monzo: ['monzo'],
  wise: ['wise']
};

function norm(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hostOf(value = '') {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function domainMatches(host, value) {
  const candidate = hostOf(value);
  return Boolean(
    host &&
      candidate &&
      (candidate === host || candidate.endsWith(`.${host}`) || host.endsWith(`.${candidate}`))
  );
}

function nameMatchScore(companyName, orphan) {
  const name = norm(companyName);
  let score = 0;

  for (const alias of ALIASES[orphan]) {
    const a = norm(alias);
    if (!a) continue;
    if (name === a) score = Math.max(score, 100);
    else if (name.startsWith(`${a} `)) score = Math.max(score, 80);
    else if (name.includes(` ${a} `) || name.endsWith(` ${a}`)) score = Math.max(score, 50);
  }

  return score;
}

function hostMatchScore(company, hosts) {
  let score = 0;
  const matchedHosts = [];

  for (const host of hosts) {
    if (domainMatches(host, company.careersUrl)) {
      score = Math.max(score, 90);
      matchedHosts.push({ host, field: 'careersUrl' });
    }
    if (domainMatches(host, company.website)) {
      score = Math.max(score, 70);
      matchedHosts.push({ host, field: 'website' });
    }
  }

  return { score, matchedHosts };
}

function scoreCompany(company, orphan, hosts) {
  const nameScore = nameMatchScore(company.companyName, orphan);
  const hostEvidence = hostMatchScore(company, hosts);

  // Do not score every enabled company. An enabled flag is not identity evidence.
  if (nameScore === 0 && hostEvidence.score === 0) return null;

  // Strong identity = matching company name + matching source/careers domain.
  // Domain-only matches are allowed, but name-only matches are deliberately weaker.
  const combined = nameScore + hostEvidence.score;

  return {
    company,
    score: combined,
    nameScore,
    hostScore: hostEvidence.score,
    matchedHosts: hostEvidence.matchedHosts
  };
}

await mongoose.connect(MONGO_URI);

try {
  const allCompanies = await Company.find({ enabled: true })
    .select('companyId companyName companyNumber website careersUrl ats enabled')
    .lean();

  const mappings = [];
  const errors = [];

  for (const orphanId of ORPHANS) {
    const jobs = await Job.find({
      'status.isLive': true,
      companyId: orphanId
    })
      .select('_id companyId companyName title applyUrl sourceUrl')
      .lean();

    if (!jobs.length) continue;

    const hosts = [
      ...new Set(
        jobs
          .flatMap(job => [hostOf(job.sourceUrl), hostOf(job.applyUrl)])
          .filter(Boolean)
      )
    ];

    const ranked = allCompanies
      .map(company => scoreCompany(company, orphanId, hosts))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const secondScore = ranked[1]?.score ?? 0;

    // Require actual identity evidence. A name-only fuzzy match is never enough
    // when a competing canonical company exists.
    const uniqueStrongMatch = Boolean(
      best &&
        best.score >= 100 &&
        best.score >= secondScore + 20 &&
        (best.nameScore >= 50 || best.hostScore >= 70)
    );

    if (!uniqueStrongMatch) {
      errors.push({
        orphanId,
        liveJobCount: jobs.length,
        hosts,
        candidateCount: ranked.length,
        topScore: best?.score ?? 0,
        candidates: ranked.slice(0, 10).map(x => ({
          score: x.score,
          nameScore: x.nameScore,
          hostScore: x.hostScore,
          matchedHosts: x.matchedHosts,
          ...x.company
        }))
      });
      continue;
    }

    mappings.push({
      orphanId,
      canonicalCompany: best.company,
      score: best.score,
      nameScore: best.nameScore,
      hostScore: best.hostScore,
      matchedHosts: best.matchedHosts,
      liveJobCount: jobs.length,
      hosts
    });
  }

  const summary = {
    dryRun: !APPLY,
    mappings,
    errors,
    totalJobsToRepair: mappings.reduce((sum, x) => sum + x.liveJobCount, 0),
    updated: 0
  };

  if (errors.length) {
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = 2;
  } else if (APPLY) {
    for (const mapping of mappings) {
      const result = await Job.updateMany(
        { 'status.isLive': true, companyId: mapping.orphanId },
        {
          $set: {
            companyId: String(mapping.canonicalCompany.companyId),
            companyName: mapping.canonicalCompany.companyName
          }
        }
      );
      summary.updated += result.modifiedCount;
    }
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(JSON.stringify(summary, null, 2));
  }
} finally {
  await mongoose.disconnect();
}
