import dotenv from 'dotenv';
import mongoose from 'mongoose';
import axios from 'axios';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { ingestJobs } from '../services/jobIngestion.js';
import { upsertJobs } from '../repositories/jobRepository.js';
import { discoverCompanyJobsWithSerper } from '../services/serperJobDiscovery.js';
import { extractJobPostingJsonLd, extractLinks, normaliseUrl, classifyDiscoveredUrl } from '../services/googleCareersCrawler.js';

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

if (!process.env.SERPER_API_KEY) {
  throw new Error('SERPER_API_KEY is required');
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

await connectMongo();

const companies = await Company.find({
  enabled: true,
  companyName: { $exists: true, $nin: ['', null] }
})
  .sort({ priority: -1, companyName: 1 })
  .skip(START)
  .limit(LIMIT)
  .lean();

const summary = {
  attempted: companies.length,
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
  maxQueriesPerCompany: MAX_QUERIES_PER_COMPANY,
  maxQueriesPerRun: MAX_QUERIES_PER_RUN,
  budgetExhausted: false
};

for (const company of companies) {
  const remainingBudget = MAX_QUERIES_PER_RUN - summary.queries;
  if (remainingBudget <= 0) {
    summary.budgetExhausted = true;
    break;
  }

  try {
    const discovery = await discoverCompanyJobsWithSerper({
      companyId: company.companyId,
      companyName: company.companyName,
      careersUrl: company.careersUrl || '',
      sites: ATS_SITES[company.ats] ? [ATS_SITES[company.ats]] : [],
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
        const structured = extractJobPostingJsonLd(html);
        for (const posting of structured) {
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
            source: { ats: classifyDiscoveredUrl(url, new URL(finalUrl).hostname.replace(/^www\\./, '')), url },
            applyUrl: url,
            raw: { discovery: 'serper_source_page', sourcePage: finalUrl }
          });
        }

        const links = extractLinks(html, finalUrl, new URL(finalUrl).hostname.replace(/^www\\./, ''));
        for (const link of links.filter(item => ['job', 'ats_job'].includes(item.kind))) {
          sourceJobs.push({
            companyId: company.companyId,
            companyName: company.companyName,
            title: link.text || 'Job opening',
            description: '',
            location: 'UK',
            externalId: link.url,
            source: { ats: classifyDiscoveredUrl(link.url, new URL(finalUrl).hostname.replace(/^www\\./, '')), url: link.url },
            applyUrl: link.url,
            raw: { discovery: 'serper_source_page', sourcePage: finalUrl, pageKind: link.kind }
          });
        }
      } catch {
        summary.sourcePageFailures += 1;
      }
    }

    summary.jobsFromSourcePages += sourceJobs.length;
    const ingested = ingestJobs([...discovery.results, ...sourceJobs], { now: new Date().toISOString() });
    const persisted = await upsertJobs(ingested.jobs, { now: new Date() });

    summary.discovered += ingested.jobs.length;
    summary.added += persisted.added;
    summary.updated += persisted.updated;
    summary.duplicatesRemoved += ingested.duplicatesRemoved;
    summary.rejected += ingested.rejected.length + persisted.rejected.length;
    if (ingested.jobs.length) summary.companiesWithResults += 1;

    console.log(JSON.stringify({
      company: company.companyName,
      companyId: company.companyId,
      queries: discovery.queries.length,
      sourcePages: discovery.sourcePages?.length || 0,
      discovered: ingested.jobs.length,
      added: persisted.added,
      updated: persisted.updated,
      duplicatesRemoved: ingested.duplicatesRemoved,
      rejected: ingested.rejected.length + persisted.rejected.length
    }));
  } catch (error) {
    summary.failed += 1;
    console.error(JSON.stringify({
      company: company.companyName,
      companyId: company.companyId,
      error: error.message
    }));
  }

  if (DELAY_MS) await sleep(DELAY_MS);
}

console.log('=== SERPER JOB DISCOVERY SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));

await mongoose.disconnect();
