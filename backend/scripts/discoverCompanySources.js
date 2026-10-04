import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Company } from '../models/Company.js';
import { connectMongo, disconnectMongo } from '../db/mongoose.js';
import { discoverCompanySourceCandidates, prioritizeSourceReadyCompanies, selectBestSource, verifySourceReachability } from '../services/companySourceDiscovery.js';
import { discoverWithATS } from '../ats/registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const registryPath = path.join(__dirname, '../config/job-source-registry.json');

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find(arg => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function loadRegistry() {
  const raw = await fs.readFile(registryPath, 'utf8');
  return JSON.parse(raw);
}

function mergeSource(registry, source) {
  const sources = Array.isArray(registry.sources) ? registry.sources : [];
  const existingIndex = sources.findIndex(item => String(item.companyId) === String(source.companyId));
  if (existingIndex >= 0) sources[existingIndex] = { ...sources[existingIndex], ...source };
  else sources.push(source);
  registry.sources = sources;
}

async function verifyCandidate(candidate, company) {
  if (!candidate?.ats) return { ...candidate, status: 'candidate' };

  const reachability = await verifySourceReachability(candidate.sourceUrl);
  if (!reachability.ok) {
    return { ...candidate, status: 'candidate', verification: reachability };
  }

  try {
    const jobs = await discoverWithATS(candidate.ats, {
      slug: candidate.atsSlug || String(company.companyId),
      careersUrl: candidate.sourceUrl,
      companyName: company.companyName,
      companyId: company.companyId,
      site: candidate.atsSite
    });

    if (Array.isArray(jobs) && jobs.length > 0) {
      return {
        ...candidate,
        status: 'verified',
        verification: { ...reachability, jobsFound: jobs.length }
      };
    }

    return { ...candidate, status: 'candidate', verification: { ...reachability, jobsFound: 0 } };
  } catch (error) {
    return { ...candidate, status: 'candidate', verification: { ...reachability, jobsFound: 0, error: error.message } };
  }
}

async function main() {
  const limit = Math.max(1, Number(argValue('limit', 10)) || 10);
  const perQuery = Math.max(1, Number(argValue('per-query', 10)) || 10);
  const maxQueries = Math.max(1, Number(argValue('max-queries', 3)) || 3);
  const minScore = Math.max(0, Number(argValue('min-score', 50)) || 50);
  const verify = hasFlag('verify');

  await connectMongo();
  const registry = await loadRegistry();
  const registeredIds = new Set((registry.sources || []).map(source => String(source.companyId)));
  const companyFilter = { enabled: true, companyName: { $exists: true, $nin: ['', null] } };

  // Fetch a bounded source-ready pool first. This avoids spending Serper budget
  // on companies for which we have no domain signal at all. If the source-ready
  // pool is smaller than the requested limit, fill the remainder from the full
  // enabled population so discovery can still bootstrap new domains.
  const sourceReadyCompanies = await Company.find({
    ...companyFilter,
    $or: [
      { website: { $nin: ['', null] } },
      { careersUrl: { $nin: ['', null] } },
      { 'metadata.website': { $nin: ['', null] } },
      { 'metadata.careersUrl': { $nin: ['', null] } }
    ]
  })
    .sort({ priority: -1, companyId: 1 })
    .limit(limit * 2)
    .lean();

  const fallbackCompanies = await Company.find(companyFilter)
    .sort({ priority: -1, companyId: 1 })
    .limit(limit * 2)
    .lean();

  const companies = prioritizeSourceReadyCompanies(
    [...sourceReadyCompanies, ...fallbackCompanies],
    { limit, registeredIds }
  );

  const summary = {
    attempted: 0,
    candidates: 0,
    atsCandidates: 0,
    verified: 0,
    skippedRegistered: 0,
    failed: 0,
    queries: 0,
    sourceReadySelected: companies.filter(company => Boolean(company.website || company.careersUrl || company.metadata?.website || company.metadata?.careersUrl)).length,
    rejectionCounts: {}
  };

  for (const company of companies) {
    if (registeredIds.has(String(company.companyId))) {
      summary.skippedRegistered += 1;
      continue;
    }

    summary.attempted += 1;
    try {
      const result = await discoverCompanySourceCandidates({ company, perQuery, maxQueries });
      summary.queries += result.queries.length;
      const candidates = result.candidates.filter(candidate => candidate.score >= minScore);
      summary.candidates += candidates.length;
      summary.atsCandidates += candidates.filter(candidate => candidate.ats).length;

      const best = selectBestSource(candidates);
      if (!best) {
        summary.rejectionCounts.noCandidate = (summary.rejectionCounts.noCandidate || 0) + 1;
        console.log(JSON.stringify({ company: company.companyName, companyId: company.companyId, status: 'no-candidate', queries: result.queries }));
        continue;
      }

      const resolved = verify ? await verifyCandidate(best, company) : { ...best, status: 'candidate' };
      if (resolved.status === 'verified') {
        mergeSource(registry, {
          companyId: String(company.companyId),
          companyName: company.companyName,
          ats: resolved.ats,
          sourceUrl: resolved.sourceUrl,
          sourceType: resolved.sourceType,
          status: 'verified',
          notes: `Auto-discovered and verified; ${resolved.verification.jobsFound} jobs found.`
        });
        summary.verified += 1;
        await Company.updateOne({ companyId: String(company.companyId) }, {
          $set: { careersUrl: resolved.sourceUrl, ats: resolved.ats, 'metadata.sourceDiscovery': { status: 'verified', sourceUrl: resolved.sourceUrl, ats: resolved.ats } }
        });
      }

      console.log(JSON.stringify({
        company: company.companyName,
        companyId: company.companyId,
        sourceUrl: resolved.sourceUrl,
        ats: resolved.ats,
        score: resolved.score,
        status: resolved.status,
        verification: resolved.verification || null
      }));
    } catch (error) {
      summary.failed += 1;
      console.log(JSON.stringify({ company: company.companyName, companyId: company.companyId, status: 'error', error: error.message }));
    }
  }

  if (verify && summary.verified > 0) {
    await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  }

  console.log('=== COMPANY SOURCE DISCOVERY SUMMARY ===');
  console.log(JSON.stringify({ ...summary, registrySources: registry.sources?.length || 0, verificationEnabled: verify }, null, 2));
}

try {
  await main();
} finally {
  await disconnectMongo();
}
