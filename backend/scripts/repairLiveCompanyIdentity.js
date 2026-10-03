import 'dotenv/config';
import mongoose from 'mongoose';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) throw new Error('Missing MONGODB_URI/MONGO_URI');

const APPLY = process.argv.includes('--apply');
const ORPHANS = ['deliveroo', 'monzo', 'wise'];

// These are legal/company identities, not fuzzy aliases. The company-number
// check is the primary identity signal because the same legal company may have
// several duplicated company documents in the dataset.
const IDENTITY = {
  deliveroo: {
    companyNumbers: ['08167130'],
    exactNames: ['roofoods ltd t/a deliveroo', 'deliveroo'],
    sourceHosts: ['job-boards.greenhouse.io']
  },
  monzo: {
    companyNumbers: ['09446231'],
    exactNames: ['monzo bank limited', 'monzo'],
    sourceHosts: ['job-boards.greenhouse.io']
  },
  wise: {
    companyNumbers: ['07209813'],
    exactNames: ['wise payments limited', 'wise'],
    sourceHosts: ['wise.jobs']
  }
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

function companyIdNumber(value = '') {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function rankCompany(company, identity) {
  const number = String(company.companyNumber || '').replace(/\s+/g, '');
  const name = norm(company.companyName);
  let score = 0;
  const evidence = [];

  if (identity.companyNumbers.includes(number)) {
    score += 1000;
    evidence.push('companyNumber');
  }

  if (identity.exactNames.some(x => norm(x) === name)) {
    score += 500;
    evidence.push('exactCompanyName');
  }

  const careersHost = hostOf(company.careersUrl);
  const websiteHost = hostOf(company.website);
  for (const host of identity.sourceHosts) {
    if (careersHost === host || careersHost.endsWith(`.${host}`)) {
      score += 200;
      evidence.push(`careersHost:${host}`);
    }
    if (websiteHost === host || websiteHost.endsWith(`.${host}`)) {
      score += 150;
      evidence.push(`websiteHost:${host}`);
    }
  }

  return { company, score, evidence };
}

await mongoose.connect(MONGO_URI);

try {
  // Include disabled records for diagnosis. We only allow an APPLY mapping to
  // an enabled canonical company. This prevents an orphan from disappearing
  // into a disabled duplicate.
  const allCompanies = await Company.find({})
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

    const identity = IDENTITY[orphanId];
    const ranked = allCompanies
      .map(company => rankCompany(company, identity))
      .filter(x => x.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Duplicate company documents with the same legal identity are resolved
        // deterministically to the lowest numeric companyId.
        return companyIdNumber(a.company.companyId) - companyIdNumber(b.company.companyId);
      });

    const enabled = ranked.filter(x => x.company.enabled);
    const best = enabled[0];
    const tiedBest = enabled.filter(x => x.score === best?.score);
    const exactLegalMatch = Boolean(
      best &&
      identity.companyNumbers.includes(String(best.company.companyNumber || '').replace(/\s+/g, '')) &&
      best.company.enabled
    );

    if (!exactLegalMatch || tiedBest.length === 0) {
      errors.push({
        orphanId,
        liveJobCount: jobs.length,
        expectedCompanyNumbers: identity.companyNumbers,
        expectedNames: identity.exactNames,
        expectedSourceHosts: identity.sourceHosts,
        candidateCount: ranked.length,
        enabledCandidateCount: enabled.length,
        candidates: ranked.slice(0, 10).map(x => ({
          score: x.score,
          evidence: x.evidence,
          ...x.company
        }))
      });
      continue;
    }

    mappings.push({
      orphanId,
      canonicalCompany: best.company,
      score: best.score,
      evidence: best.evidence,
      liveJobCount: jobs.length,
      duplicateCanonicalCount: tiedBest.length
    });
  }

  const summary = {
    dryRun: !APPLY,
    mappings,
    errors,
    totalJobsToRepair: mappings.reduce((sum, x) => sum + x.liveJobCount, 0),
    updated: 0
  };

  // Never partially apply a repair. Every orphan must have a deterministic
  // canonical identity before any write occurs.
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
