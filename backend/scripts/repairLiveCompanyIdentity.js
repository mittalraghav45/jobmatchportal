import 'dotenv/config';
import mongoose from 'mongoose';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) throw new Error('Missing MONGODB_URI/MONGO_URI');

const APPLY = process.argv.includes('--apply');
const ORPHANS = ['deliveroo', 'monzo', 'wise'];

// Legal identities. Company number is the authoritative identity signal.
const IDENTITY = {
  deliveroo: {
    companyNumbers: ['08167130'],
    exactNames: ['roofoods ltd t/a deliveroo', 'deliveroo'],
    canonicalName: 'Roofoods Ltd t/a Deliveroo',
    sourceHosts: ['job-boards.greenhouse.io'],
    careersUrl: 'https://job-boards.greenhouse.io/deliveroo',
    website: 'https://deliveroo.co.uk/'
  },
  monzo: {
    companyNumbers: ['09446231'],
    exactNames: ['monzo bank limited', 'monzo'],
    canonicalName: 'Monzo Bank Limited',
    sourceHosts: ['job-boards.greenhouse.io'],
    careersUrl: 'https://job-boards.greenhouse.io/monzo',
    website: 'https://monzo.com/'
  },
  wise: {
    companyNumbers: ['07209813'],
    exactNames: ['wise payments limited', 'wise'],
    canonicalName: 'Wise Payments Limited',
    sourceHosts: ['wise.jobs'],
    careersUrl: 'https://wise.jobs/',
    website: 'https://wise.com/'
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

function nextCompanyId(companies, reserved = new Set()) {
  const max = companies.reduce((m, company) => Math.max(m, companyIdNumber(company.companyId)), 0);
  let candidate = Math.max(max + 1, 1);
  while (reserved.has(String(candidate))) candidate += 1;
  return String(candidate);
}

await mongoose.connect(MONGO_URI);

try {
  const allCompanies = await Company.find({})
    .select('companyId companyName companyNumber website careersUrl ats enabled')
    .lean();

  const mappings = [];
  const errors = [];
  const plannedCreates = [];
  const reservedIds = new Set(allCompanies.map(x => String(x.companyId)));

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
        return companyIdNumber(a.company.companyId) - companyIdNumber(b.company.companyId);
      });

    const enabled = ranked.filter(x => x.company.enabled);
    const best = enabled[0];
    const exactLegalMatches = enabled.filter(x =>
      identity.companyNumbers.includes(String(x.company.companyNumber || '').replace(/\s+/g, ''))
    );

    if (exactLegalMatches.length > 0) {
      const canonical = exactLegalMatches
        .sort((a, b) => companyIdNumber(a.company.companyId) - companyIdNumber(b.company.companyId))[0];

      mappings.push({
        orphanId,
        canonicalCompany: canonical.company,
        score: canonical.score,
        evidence: canonical.evidence,
        liveJobCount: jobs.length,
        duplicateCanonicalCount: exactLegalMatches.length
      });
      continue;
    }

    // The company document itself is missing from the golden company dataset.
    // Do not guess from a fuzzy name. Plan a canonical company record from the
    // legal identity, with a deterministic generated numeric companyId.
    const companyId = nextCompanyId([...allCompanies, ...plannedCreates], reservedIds);
    reservedIds.add(companyId);

    const plannedCompany = {
      companyId,
      companyName: identity.canonicalName,
      companyNumber: identity.companyNumbers[0],
      website: identity.website,
      careersUrl: identity.careersUrl,
      ats: identity.sourceHosts[0].includes('greenhouse') ? 'greenhouse' : 'unknown',
      enabled: true
    };

    plannedCreates.push({
      orphanId,
      company: plannedCompany,
      liveJobCount: jobs.length,
      reason: 'canonical company record missing'
    });

    mappings.push({
      orphanId,
      canonicalCompany: plannedCompany,
      score: 1500,
      evidence: ['companyNumber', 'canonicalLegalIdentity'],
      liveJobCount: jobs.length,
      duplicateCanonicalCount: 0,
      createCanonicalCompany: true
    });
  }

  const summary = {
    dryRun: !APPLY,
    mappings,
    plannedCreates,
    errors,
    totalJobsToRepair: mappings.reduce((sum, x) => sum + x.liveJobCount, 0),
    companiesCreated: 0,
    updated: 0
  };

  // Never partially apply. The script must resolve all live orphan groups
  // before touching either Company or Job documents.
  if (errors.length) {
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = 2;
  } else if (APPLY) {
    // Re-read canonical records immediately before writing so the operation is
    // safe if another process inserted one after the dry run.
    for (const mapping of mappings) {
      let canonical = await Company.findOne({
        companyNumber: mapping.canonicalCompany.companyNumber,
        enabled: true
      }).sort({ companyId: 1 });

      if (!canonical) {
        canonical = await Company.create({
          ...mapping.canonicalCompany,
          metadata: {
            identityRepair: true,
            repairedFromOrphanId: mapping.orphanId,
            repairedAt: new Date().toISOString()
          }
        });
        summary.companiesCreated += 1;
      }

      const result = await Job.updateMany(
        { 'status.isLive': true, companyId: mapping.orphanId },
        {
          $set: {
            companyId: String(canonical.companyId),
            companyName: canonical.companyName
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
