import dotenv from 'dotenv';
import mongoose from 'mongoose';
import axios from 'axios';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { ingestJobs } from '../services/jobIngestion.js';
import { upsertJobs } from '../repositories/jobRepository.js';
import { discoverCompanyJobsWithSerper } from '../services/serperJobDiscovery.js';
import { verifyJobSource } from '../services/jobSourceVerification.js';
import { extractJobPostingJsonLd, extractLinks, normaliseUrl, classifyDiscoveredUrl } from '../services/googleCareersCrawler.js';
import { shouldProcessSource, buildSourceIngestionState } from '../services/jobSourceIngestionState.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

dotenv.config();

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const LIMIT = Math.max(1, Number(arg('limit', process.env.SERPER_COMPANY_LIMIT || 10)) || 10);
const PER_QUERY = Math.max(1, Math.min(10, Number(arg('per-query', process.env.SERPER_RESULTS_PER_QUERY || 10)) || 10));
const START = Math.max(0, Number(arg('skip', 0)) || 0);
const DELAY_MS = Math.max(0, Number(arg('delay', process.env.SERPER_DELAY_MS || 250)) || 250);
const MAX_QUERIES_PER_COMPANY = Math.max(1, Number(arg('max-queries-per-company', process.env.SERPER_MAX_QUERIES_PER_COMPANY || 2)) || 2);
const MAX_QUERIES_PER_RUN = Math.max(1, Number(arg('max-queries', process.env.SERPER_MAX_QUERIES_PER_RUN || 100)) || 100);
const SOURCE_PAGES_PER_COMPANY = Math.max(1, Number(arg('source-pages', process.env.SERPER_SOURCE_PAGES_PER_COMPANY || 2)) || 2);
const SOURCE_PAGE_TIMEOUT_MS = Math.max(3000, Number(process.env.SERPER_SOURCE_PAGE_TIMEOUT_MS || 10000) || 10000);
const RETRY_AFTER_HOURS = Math.max(0, Number(arg('retry-after-hours', process.env.SERPER_SOURCE_RETRY_AFTER_HOURS || 24)) || 24);
const FORCE = process.argv.includes('--force');
const ATS_SITES = {
  greenhouse: 'boards.greenhouse.io',
  lever: 'jobs.lever.co',
  ashby: 'jobs.ashbyhq.com',
  workday: 'myworkdayjobs.com',
  workable: 'apply.workable.com',
  jobvite: 'jobs.jobvite.com',
  smartrecruiters: 'careers.smartrecruiters.com',
  recruitee: 'recruitee.com',
  personio: 'personio.com',
  bamboohr: 'bamboohr.com'
};

if (!process.env.SERPER_API_KEY) throw new Error('SERPER_API_KEY is required');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const registryPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/job-source-registry.json');
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const verifiedSources = (registry.sources || []).filter(source => source.status === 'verified' && source.companyId && source.sourceUrl);

await connectMongo();

const sourceCompanyIds = verifiedSources.slice(START, START + LIMIT).map(source => String(source.companyId));
const companies = await Company.find({
  enabled: true,
  companyId: { $in: sourceCompanyIds },
  companyName: { $exists: true, $nin: ['', null] }
}).lean();

const companyById = new Map(companies.map(company => [String(company.companyId), company]));
const orderedCompanies = verifiedSources
  .slice(START, START + LIMIT)
  .map(source => ({ source, company: companyById.get(String(source.companyId)) }))
  .filter(item => item.company);

const summary = {
  attempted: orderedCompanies.length,
  processed: 0,
  skippedRecentlyAttempted: 0,
  verifiedSourcesAvailable: verifiedSources.length,
  missingCompanies: verifiedSources.slice(START, START + LIMIT).filter(source => !companyById.has(String(source.companyId))).length,
  companiesWithResults: 0,
  queries: 0,
  discovered: 0,
  added: 0,
  updated: 0,
  duplicatesRemoved: 0,
  rejected: 0,
  failed: 0,
  sourcePagesFetched: 0,
  jobsFromSourcePages: 0,
  sourcePageFailures: 0,
  verifiedLive: 0,
  verifiedClosed: 0,
  verifiedUnknown: 0,
  verificationFailures: 0,
  maxQueriesPerCompany: MAX_QUERIES_PER_COMPANY,
  maxQueriesPerRun: MAX_QUERIES_PER_RUN,
  retryAfterHours: RETRY_AFTER_HOURS,
  force: FORCE,
  budgetExhausted: false
};

for (const { source, company } of orderedCompanies) {
  if (!FORCE && !shouldProcessSource(company.metadata?.jobSourceIngestion, { retryAfterHours: RETRY_AFTER_HOURS })) {
    summary.skippedRecentlyAttempted += 1;
    continue;
  }

  const remainingBudget = MAX_QUERIES_PER_RUN - summary.queries;
  if (remainingBudget <= 0) {
    summary.budgetExhausted = true;
    break;
  }

  summary.processed += 1;
  const startedAt = new Date();

  try {
    const sourceUrl = source.sourceUrl;
    const ats = source.ats || company.ats;
    const discovery = await discoverCompanyJobsWithSerper({
      companyId: company.companyId,
      companyName: company.companyName,
      careersUrl: sourceUrl,
      sites: ATS_SITES[ats] ? [ATS_SITES[ats]] : [],
      maxQueriesPerCompany: Math.min(MAX_QUERIES_PER_COMPANY, remainingBudget),
      perQuery: PER_QUERY
    });

    summary.queries += discovery.queries.length;
    const sourceJobs = [];
    for (const sourcePage of (discovery.sourcePages || []).slice(0, SOURCE_PAGES_PER_COMPANY)) {
      try {
        const response = await axios.get(sourcePage.url, {
          timeout: SOURCE_PAGE_TIMEOUT_MS,
          maxRedirects: 5,
          responseType: 'text',
          headers: {
            'User-Agent': 'JobMatchPortal/1.0 (+source-backed-job-discovery)',
            Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'
          },
          validateStatus: status => status >= 200 && status < 400
        });
        summary.sourcePagesFetched += 1;
        const html = String(response.data || '');
        const finalUrl = response.request?.res?.responseUrl || sourcePage.url;
        const finalHost = new URL(finalUrl).hostname.replace(/^www\./, '');
        for (const posting of extractJobPostingJsonLd(html)) {
          const url = normaliseUrl(posting.url || finalUrl, finalUrl);
          if (!url || !posting.title) continue;
          sourceJobs.push({
            companyId: company.companyId,
            companyName: company.companyName,
            title: String(posting.title).trim(),
            description: String(posting.description || ''),
            location: typeof posting.jobLocation === 'object' ? JSON.stringify(posting.jobLocation) : String(posting.jobLocation || ''),
            postedAt: posting.datePosted || null,
            closingAt: posting.validThrough || null,
            externalId: url,
            source: { ats: classifyDiscoveredUrl(url, finalHost), url },
            applyUrl: url,
            raw: { discovery: 'serper_source_page', sourcePage: finalUrl }
          });
        }

        for (const link of extractLinks(html, finalUrl, finalHost).filter(item => ['job', 'ats_job'].includes(item.kind))) {
          sourceJobs.push({
            companyId: company.companyId,
            companyName: company.companyName,
            title: link.text || 'Job opening',
            description: '',
            location: 'UK',
            externalId: link.url,
            source: { ats: classifyDiscoveredUrl(link.url, finalHost), url: link.url },
            applyUrl: link.url,
            raw: { discovery: 'serper_source_page', sourcePage: finalUrl, pageKind: link.kind }
          });
        }
      } catch {
        summary.sourcePageFailures += 1;
      }
    }

    summary.jobsFromSourcePages += sourceJobs.length;
    const candidates = [...discovery.results, ...sourceJobs];
    const verifiedCandidates = [];

    for (const candidate of candidates) {
      const verification = await verifyJobSource(candidate, {
        timeoutMs: SOURCE_PAGE_TIMEOUT_MS,
        maxRetries: 1,
        retryDelayMs: 250
      });
      candidate.verification = verification;
      candidate.isLive = verification.status !== 'closed';

      if (verification.status === 'live') summary.verifiedLive += 1;
      else if (verification.status === 'closed') summary.verifiedClosed += 1;
      else summary.verifiedUnknown += 1;

      if (verification.evidenceType === 'request_error') summary.verificationFailures += 1;
      verifiedCandidates.push(candidate);
    }

    const ingested = ingestJobs(verifiedCandidates, { now: startedAt.toISOString() });
    const persisted = await upsertJobs(ingested.jobs, { now: startedAt });

    summary.discovered += ingested.jobs.length;
    summary.added += persisted.added;
    summary.updated += persisted.updated;
    summary.duplicatesRemoved += ingested.duplicatesRemoved;
    summary.rejected += ingested.rejected.length + persisted.rejected.length;
    if (ingested.jobs.length) summary.companiesWithResults += 1;

    const state = buildSourceIngestionState({
      previous: company.metadata?.jobSourceIngestion || {},
      now: new Date(),
      status: 'success',
      queries: discovery.queries.length,
      discovered: ingested.jobs.length,
      added: persisted.added,
      updated: persisted.updated,
      duplicatesRemoved: ingested.duplicatesRemoved,
      rejected: ingested.rejected.length + persisted.rejected.length,
      sourcePagesFetched: (discovery.sourcePages || []).length,
      sourcePageFailures: summary.sourcePageFailures
    });
    await Company.updateOne({ companyId: String(company.companyId) }, { $set: { 'metadata.jobSourceIngestion': state } });

    console.log(JSON.stringify({
      company: company.companyName,
      companyId: company.companyId,
      sourceUrl,
      sourceStatus: source.status,
      ats,
      queries: discovery.queries.length,
      serperDirectResults: discovery.results?.length || 0,
      sourcePages: discovery.sourcePages?.length || 0,
      discovered: ingested.jobs.length,
      verifiedLive: verifiedCandidates.filter(job => job.verification?.status === 'live').length,
      verifiedClosed: verifiedCandidates.filter(job => job.verification?.status === 'closed').length,
      verifiedUnknown: verifiedCandidates.filter(job => job.verification?.status === 'unknown').length,
      added: persisted.added,
      updated: persisted.updated,
      duplicatesRemoved: ingested.duplicatesRemoved,
      rejected: ingested.rejected.length + persisted.rejected.length
    }));
  } catch (error) {
    summary.failed += 1;
    const state = buildSourceIngestionState({
      previous: company.metadata?.jobSourceIngestion || {},
      now: new Date(),
      status: 'failed',
      error: error.message
    });
    await Company.updateOne({ companyId: String(company.companyId) }, { $set: { 'metadata.jobSourceIngestion': state } }).catch(() => {});
    console.error(JSON.stringify({ company: company.companyName, companyId: company.companyId, sourceUrl: source.sourceUrl, error: error.message }));
  }

  if (DELAY_MS) await sleep(DELAY_MS);
}

console.log('=== SERPER JOB DISCOVERY SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));
await mongoose.disconnect();
