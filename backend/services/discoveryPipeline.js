import { extractATSContext } from '../ats/detect.js';
import { discoverWithATS } from '../ats/registry.js';
import { ingestJobs } from './jobIngestion.js';
import { upsertJobs } from '../repositories/jobRepository.js';
import { Company } from '../models/Company.js';
import { connectMongo } from '../db/mongoose.js';

export async function discoverCompany(company, { persist = false, existing = new Map() } = {}) {
  const context = extractATSContext(company);
  if (!context.enabled) return { company: context, status: 'disabled', jobs: [], counts: emptyCounts() };
  if (context.ats === 'unknown') {
    return { company: context, status: 'unconfigured', jobs: [], counts: emptyCounts(), reason: context.atsDetectionReason };
  }

  const rawJobs = await discoverWithATS(context.ats, {
    slug: context.atsSlug || context.slug,
    companyName: context.name,
    careersUrl: context.careersUrl,
    companyId: context.companyId || context.slug
  });
  const ingested = ingestJobs(rawJobs.map(job => ({ ...job, companyId: context.companyId || context.slug })), { existing });
  let persisted = { saved: 0, rejected: [] };
  if (persist && ingested.jobs.length) {
    await connectMongo();
    persisted = await upsertJobs(ingested.jobs);
  }

  return {
    company: context,
    status: 'ok',
    jobs: ingested.jobs,
    counts: { ...ingested, persisted: persisted.saved, persistenceRejected: persisted.rejected.length }
  };
}

export async function discoverCompanies(companies = [], options = {}) {
  const results = [];
  for (const company of companies) {
    try {
      results.push(await discoverCompany(company, options));
    } catch (error) {
      results.push({ company, status: 'error', jobs: [], counts: emptyCounts(), error: error.message });
    }
  }
  return summariseDiscovery(results);
}

export async function discoverAndPersistCompanies(companies = [], options = {}) {
  return discoverCompanies(companies, { ...options, persist: true });
}

function emptyCounts() {
  return { jobs: 0, added: 0, updated: 0, duplicatesRemoved: 0, rejected: [], persisted: 0, persistenceRejected: 0 };
}

function summariseDiscovery(results) {
  return {
    results,
    summary: {
      companies: results.length,
      successful: results.filter(r => r.status === 'ok').length,
      unconfigured: results.filter(r => r.status === 'unconfigured').length,
      disabled: results.filter(r => r.status === 'disabled').length,
      errors: results.filter(r => r.status === 'error').length,
      jobs: results.reduce((sum, r) => sum + (r.jobs?.length || 0), 0),
      added: results.reduce((sum, r) => sum + (r.counts?.added || 0), 0),
      updated: results.reduce((sum, r) => sum + (r.counts?.updated || 0), 0)
    }
  };
}
