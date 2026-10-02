import dotenv from 'dotenv';
import mongoose from 'mongoose';
import axios from 'axios';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { Job } from '../models/Job.js';
import { buildGoogleSearchUrl, extractJobPostingJsonLd, extractLinks, chooseCrawlTargets, classifyDiscoveredUrl, normaliseUrl, isCrawlableTarget, classifyGooglePage } from '../services/googleCareersCrawler.js';

dotenv.config();

const limit = Math.max(1, Number(process.env.GOOGLE_CAREER_CRAWL_LIMIT || process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || 100));
const pagesPerCompany = Math.max(1, Number(process.env.GOOGLE_CAREER_PAGES_PER_COMPANY || 8));
const timeoutMs = Math.max(3000, Number(process.env.GOOGLE_CAREER_TIMEOUT_MS || 8000));
const userAgent = process.env.CRAWLER_USER_AGENT || 'SponsorTrackerCareerDiscovery/1.0 (+public-job-discovery)';

async function fetchHtml(url) {
  const response = await axios.get(url, {
    timeout: timeoutMs,
    maxRedirects: 4,
    responseType: 'text',
    headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-GB,en;q=0.9'
    },
    validateStatus: status => status >= 200 && status < 400
  });
  return { html: String(response.data || ''), finalUrl: response.request?.res?.responseUrl || url, status: response.status };
}

function prepareGoogleSearchUrl(value, companyName, employerType) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'google.com') {
      url.searchParams.set('gbv', '1');
      return url.toString();
    }
  } catch { /* fall back to generated query */ }
  return buildGoogleSearchUrl(companyName, employerType);
}

function companyHost(company) {
  try { return new URL(company.website || company.careersUrl).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function makeFingerprint(companyId, job) {
  const identity = job.url || `${job.title}|${job.location}`;
  return Buffer.from(`${companyId}|${identity}`.toLowerCase().trim()).toString('base64url');
}

function addTarget(queue, seen, target, companyHostName) {
  if (!target?.url || !isCrawlableTarget(target, companyHostName)) return;
  const url = normaliseUrl(target.url);
  if (!url || seen.has(url)) return;
  seen.add(url);
  queue.push({ ...target, url });
}

async function processCompany(company) {
  const host = companyHost(company);
  const searchUrl = prepareGoogleSearchUrl(company.metadata?.discoveryFallback?.url || buildGoogleSearchUrl(company.companyName, company.employerType), company.companyName, company.employerType);
  const queue = [];
  const seen = new Set();
  let pages = 0;
  let jobs = 0;
  let googleSearch = false;
  let failedPages = 0;
  let googleLinks = 0;
  let candidateTargets = 0;
  let blockedReason = null;
  const discovered = [];

  try {
    const google = await fetchHtml(searchUrl);
    googleSearch = true;
    const googlePageType = classifyGooglePage(google.html);
    if (googlePageType === 'blocked' || googlePageType === 'consent') blockedReason = googlePageType;
    const links = extractLinks(google.html, google.finalUrl || searchUrl, host);
    googleLinks = links.length;
    const targets = chooseCrawlTargets(links, pagesPerCompany);
    candidateTargets = targets.length;
    for (const target of targets) addTarget(queue, seen, target, host);
  } catch (error) {
    return { status: 'google_failed', pages: 0, jobs: 0, failedPages: 1, googleSearch: false, googleLinks: 0, candidateTargets: 0, blockedReason: null, error: error.code || error.message };
  }

  if (company.careersUrl) addTarget(queue, seen, { url: company.careersUrl, kind: 'careers', text: 'company careers page' }, host);

  while (queue.length && pages < pagesPerCompany) {
    const target = queue.shift();
    try {
      const page = await fetchHtml(target.url);
      pages += 1;
      const finalKind = classifyDiscoveredUrl(page.finalUrl, host);
      const structuredJobs = extractJobPostingJsonLd(page.html);

      for (const posting of structuredJobs) {
        const url = normaliseUrl(posting.url || page.finalUrl, page.finalUrl);
        if (!url || !posting.title) continue;
        const sourceAts = classifyDiscoveredUrl(url, host);
        discovered.push({
          title: String(posting.title).trim(),
          url,
          description: String(posting.description || ''),
          location: typeof posting.jobLocation === 'object' ? JSON.stringify(posting.jobLocation) : String(posting.jobLocation || ''),
          datePosted: posting.datePosted || null,
          validThrough: posting.validThrough || null,
          sourceAts,
          sourcePage: page.finalUrl,
          pageKind: finalKind
        });
      }

      const links = extractLinks(page.html, page.finalUrl, host);
      for (const link of chooseCrawlTargets(links, pagesPerCompany)) {
        if (['job', 'ats_job'].includes(link.kind)) {
          discovered.push({ title: link.text || 'Job opening', url: link.url, description: '', location: '', datePosted: null, validThrough: null, sourceAts: link.kind === 'ats_job' ? new URL(link.url).hostname : 'unknown', sourcePage: page.finalUrl, pageKind: link.kind });
        }
        if (['careers', 'ats_board'].includes(link.kind) && queue.length + pages < pagesPerCompany) addTarget(queue, seen, link, host);
      }
    } catch {
      failedPages += 1;
    }
  }

  const uniqueJobs = [...new Map(discovered.map(job => [normaliseUrl(job.url), job])).values()];
  for (const job of uniqueJobs) {
    const fingerprint = makeFingerprint(company.companyId, job);
    try {
      await Job.updateOne(
        { fingerprint },
        { $setOnInsert: {
          fingerprint,
          schemaVersion: 'v1',
          externalId: job.url,
          companyId: company.companyId,
          companyName: company.companyName,
          title: job.title,
          description: job.description,
          location: job.location,
          nation: 'UK-wide',
          employerType: company.employerType,
          source: { ats: job.sourceAts, url: job.url },
          dates: { postedAt: job.datePosted ? new Date(job.datePosted) : null, closingAt: job.validThrough ? new Date(job.validThrough) : null },
          status: { isLive: false },
          verification: { status: 'unknown', sourceUrl: job.url, evidenceType: 'discovered_from_google_career_crawl' },
          raw: { discovery: 'google_career_fallback', sourcePage: job.sourcePage, pageKind: job.pageKind }
        }, $set: { 'dates.lastSeenAt': new Date() } },
        { upsert: true }
      );
      jobs += 1;
    } catch { /* malformed/duplicate records remain outside this crawl result */ }
  }

  return { status: 'ok', pages, jobs, failedPages, googleSearch, googleLinks, candidateTargets, targetsVisited: pages, candidates: uniqueJobs.length, blockedReason };
}

await connectMongo();
const companies = await Company.find({ enabled: true, 'metadata.discoveryFallback.type': 'google_jobs_search' }).sort({ priority: -1, companyName: 1 }).limit(limit).lean();
const summary = { attempted: companies.length, succeeded: 0, failed: 0, pages: 0, failedPages: 0, jobsDiscovered: 0, companiesWithJobs: 0, googleSearches: 0, companiesWithGoogleLinks: 0, companiesWithCandidateTargets: 0, blockedGooglePages: 0 };

for (const company of companies) {
  const result = await processCompany(company);
  console.log(JSON.stringify({ company: company.companyName, ...result }));
  if (result.status === 'ok') {
    summary.succeeded += 1;
    summary.pages += result.pages;
    summary.failedPages += result.failedPages;
    summary.jobsDiscovered += result.jobs;
    summary.googleSearches += result.googleSearch ? 1 : 0;
    if (result.googleLinks) summary.companiesWithGoogleLinks += 1;
    if (result.candidateTargets) summary.companiesWithCandidateTargets += 1;
    if (result.blockedReason) summary.blockedGooglePages += 1;
    if (result.jobs) summary.companiesWithJobs += 1;
  } else summary.failed += 1;
}

console.log('=== GOOGLE CAREER CRAWL SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));
await mongoose.disconnect();
