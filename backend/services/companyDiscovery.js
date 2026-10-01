import { getEnabledCompanies } from '../config/companies.js';
import { discoverWithATS } from '../ats/registry.js';
import { isSupportedATS, resolveATSConfig } from '../ats/detector.js';
import { connectMongo } from '../db/mongoose.js';
import { upsertJobs } from '../repositories/jobRepository.js';
import { ingestJobs } from './jobIngestion.js';
import { classifyJob } from '../utils/jobClassification.js';

export function detectATS(careersUrl = '') {
  return resolveATSConfig({ careersUrl }).ats;
}

export function normaliseCompanyConfig(company = {}) {
  const companyId = String(company.company_id || company.companyId || '').trim().toLowerCase();
  const companyName = String(company.company_name || company.companyName || '').trim();
  const careersUrl = String(company.careers_url || company.careersUrl || '').trim();
  const configuredATS = String(company.ats || '').trim().toLowerCase();
  const configuredSlug = String(company.ats_slug || company.atsSlug || company.slug || '').trim();
  const explicitATS = isSupportedATS(configuredATS) ? configuredATS : '';
  const resolved = resolveATSConfig({ ats: explicitATS, atsSlug: configuredSlug, careersUrl });
  const detectedATS = resolved.ats;
  const hasUsableCareersUrl = Boolean(careersUrl) && !/^https?:\/\/(?:www\.)?(?:google\.|bing\.|search\.)/i.test(careersUrl);
  const ats = detectedATS || (explicitATS && isSupportedATS(explicitATS) ? explicitATS : (hasUsableCareersUrl ? 'custom' : null));
  const slug = resolved.slug || configuredSlug || companyId;

  return {
    ...company,
    companyId,
    companyName,
    careersUrl,
    ats,
    slug,
    atsSource: resolved.source === 'unresolved' && ats === 'custom' ? 'careers-url-fallback' : resolved.source,
    atsError: ats ? null : (resolved.error || null),
    atsSite: resolved.site || null
  };
}

export async function discoverCompanyJobs(company, { existing = new Map(), now, persist = false } = {}) {
  const config = normaliseCompanyConfig(company);
  if (!config.companyId || !config.companyName) return { company: config, status: 'invalid', jobs: [], added: 0, updated: 0, duplicatesRemoved: 0, rejected: [{ reason: 'missing_company_id_or_name' }] };
  if (config.atsError) return { company: config, status: 'invalid', jobs: [], added: 0, updated: 0, duplicatesRemoved: 0, rejected: [{ reason: 'unsupported_ats', message: config.atsError }] };
  if (!config.ats) return { company: config, status: 'unconfigured', jobs: [], added: 0, updated: 0, duplicatesRemoved: 0, rejected: [{ reason: 'ats_not_configured' }] };
  if (!config.slug && config.ats !== 'nhs' && config.ats !== 'custom') return { company: config, status: 'unconfigured', jobs: [], added: 0, updated: 0, duplicatesRemoved: 0, rejected: [{ reason: 'ats_slug_not_configured' }] };

  try {
    const rawJobs = await discoverWithATS(config.ats, { slug: config.slug, careersUrl: config.careersUrl, companyName: config.companyName, companyId: config.companyId, site: config.atsSite });
    const tagged = rawJobs.map(job => ({ ...job, companyId: config.companyId, companyName: config.companyName, ats: config.ats }));
    const classified = tagged.map(job => ({ ...job, ...classifyJob({ job, company: config, raw: job }) }));
    const result = ingestJobs(classified, { existing, now });
    if (!persist || result.jobs.length === 0) return { company: config, status: 'ok', ...result };
    const persisted = await upsertJobs(result.jobs, { now });
    return { company: config, status: 'ok', ...result, added: persisted.added, updated: persisted.updated, rejected: [...result.rejected, ...persisted.rejected] };
  } catch (error) {
    return { company: config, status: 'error', jobs: [], added: 0, updated: 0, duplicatesRemoved: 0, rejected: [{ reason: 'discovery_or_persistence_failed', message: error.message }] };
  }
}

export async function discoverEnabledCompanies({ filePath, existing = new Map(), now, persist = false } = {}) {
  if (persist) await connectMongo();
  const companies = getEnabledCompanies(filePath).map(normaliseCompanyConfig);
  const results = [];
  const jobs = [];
  for (const company of companies) {
    const result = await discoverCompanyJobs(company, { existing, now, persist });
    results.push(result);
    jobs.push(...result.jobs);
  }
  return {
    companies: results,
    jobs,
    summary: {
      companies: companies.length,
      successful: results.filter(result => result.status === 'ok').length,
      unconfigured: results.filter(result => result.status === 'unconfigured').length,
      invalid: results.filter(result => result.status === 'invalid').length,
      failed: results.filter(result => result.status === 'error').length,
      jobs: jobs.length,
      added: results.reduce((sum, result) => sum + result.added, 0),
      updated: results.reduce((sum, result) => sum + result.updated, 0)
    }
  };
}
