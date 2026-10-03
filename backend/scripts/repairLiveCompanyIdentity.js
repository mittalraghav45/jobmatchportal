import 'dotenv/config';
import mongoose from 'mongoose';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) throw new Error('Missing MONGODB_URI/MONGO_URI');

const APPLY = process.argv.includes('--apply');

// Deliberately conservative legal-name patterns. In particular, do NOT use
// /^wise/ because that incorrectly matches unrelated companies such as
// "Wise Computer Ltd".
const COMPANY_RULES = {
  deliveroo: {
    name: /^deliveroo(?:\s+(?:limited|ltd|plc|holdings|uk|group))?$/i,
    url: /deliveroo(?:\.co\.uk|\.com)?/i
  },
  monzo: {
    name: /^monzo(?:\s+(?:bank|bank limited|limited|ltd|plc|uk|group))?$/i,
    url: /(?:^|[./])monzo(?:\.com|\.co\.uk)?/i
  },
  wise: {
    name: /^wise(?:\s+(?:payments|payments limited|limited|ltd|plc|uk|group))?$/i,
    url: /(?:^|[./])wise(?:\.com|\.co\.uk)?/i
  }
};

const ORPHAN_IDS = Object.keys(COMPANY_RULES);

function candidateScore(company, rule) {
  const name = String(company.companyName || '');
  const website = String(company.website || '');
  const careersUrl = String(company.careersUrl || '');
  let score = 0;

  if (rule.name.test(name)) score += 100;
  if (rule.url.test(website)) score += 50;
  if (rule.url.test(careersUrl)) score += 50;
  if (company.enabled) score += 1;

  return score;
}

await mongoose.connect(MONGO_URI);

try {
  const mappings = [];
  const errors = [];

  for (const orphanId of ORPHAN_IDS) {
    const rule = COMPANY_RULES[orphanId];
    const jobs = await Job.find({
      'status.isLive': true,
      companyId: orphanId
    }).select('_id companyId companyName title applyUrl source.url').lean();

    if (!jobs.length) continue;

    // Search broadly enough to find the real legal/company record, but score
    // candidates conservatively before allowing an update.
    const candidates = await Company.find({
      $or: [
        { companyName: { $regex: orphanId, $options: 'i' } },
        { website: { $regex: orphanId, $options: 'i' } },
        { careersUrl: { $regex: orphanId, $options: 'i' } }
      ]
    }).select('companyId companyName companyNumber website careersUrl ats enabled').lean();

    const ranked = candidates
      .map(company => ({ ...company, matchScore: candidateScore(company, rule) }))
      .filter(company => company.matchScore > 1)
      .sort((a, b) => b.matchScore - a.matchScore);

    const topScore = ranked[0]?.matchScore ?? 0;
    const topCandidates = ranked.filter(candidate => candidate.matchScore === topScore);

    // Require a unique, strongly matching canonical record. Never guess.
    if (topCandidates.length !== 1 || topScore < 101) {
      errors.push({
        orphanId,
        liveJobCount: jobs.length,
        candidateCount: ranked.length,
        topScore,
        candidates: ranked.slice(0, 20)
      });
      continue;
    }

    mappings.push({
      orphanId,
      canonicalCompany: topCandidates[0],
      liveJobCount: jobs.length
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
