import dotenv from 'dotenv';
import mongoose from 'mongoose';
import axios from 'axios';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { Job } from '../models/Job.js';
import { buildGoogleSearchUrl, extractJobPostingJsonLd, extractLinks, chooseCrawlTargets, classifyDiscoveredUrl, normaliseUrl } from '../services/googleCareersCrawler.js';

dotenv.config();

const limit = Math.max(1, Number(process.env.GOOGLE_CAREER_CRAWL_LIMIT || process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || 100));
const pagesPerCompany = Math.max(1, Number(process.env.GOOGLE_CAREER_PAGES_PER_COMPANY || 3));
const timeoutMs = Math.max(3000, Number(process.env.GOOGLE_CAREER_TIMEOUT_MS || 8000));
const userAgent = process.env.CRAWLER_USER_AGENT || 'SponsorTrackerCareerDiscovery/1.0 (+public-job-discovery)';

async function fetchHtml(url) {
  const response = await axios.get(url, { timeout: timeoutMs, maxRedirects: 4, responseType: 'text', headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' }, validateStatus: s => s >= 200 && s < 400 });
  return { html: String(response.data || ''), finalUrl: response.request?.res?.responseUrl || url, status: response.status };
}

function companyHost(company) {
  try { return new URL(company.website || company.careersUrl).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function makeFingerprint(companyId, job) {
  const text = `${companyId}|${job.title || ''}|${job.url || ''}`.toLowerCase().trim();
  return Buffer.from(text).toString('base64url');
}

async function processCompany(company) {
  const host = companyHost(company);
  let searchUrl = company.metadata?.discoveryFallback?.url || buildGoogleSearchUrl(company.companyName, company.employerType);
  let google;
  try { google = await fetchHtml(searchUrl); } catch (error) { return { status: 'google_failed', pages: 0, jobs: 0, error: error.code || error.message }; }

  const searchLinks = extractLinks(google.html, google.finalUrl || searchUrl, host);
  const targets = chooseCrawlTargets(searchLinks, pagesPerCompany);
  if (company.careersUrl) targets.unshift({ url: normaliseUrl(company.careersUrl), kind: 'careers', text: 'company careers page' });
  const uniqueTargets = [...new Map(targets.filter(x => x.url).map(x => [x.url, x])).values()].slice(0, pagesPerCompany);

  let pages = 0;
  let jobs = 0;
  const discovered = [];
  for (const target of uniqueTargets) {
    try {
      const page = await fetchHtml(target.url);
      pages += 1;
      const structuredJobs = extractJobPostingJsonLd(page.html);
      for (const posting of structuredJobs) {
        const url = normaliseUrl(posting.url || page.finalUrl, page.finalUrl);
        if (!url || !posting.title) continue;
        discovered.push({ title: String(posting.title).trim(), url, description: String(posting.description || ''), location: typeof posting.jobLocation === 'object' ? JSON.stringify(posting.jobLocation) : String(posting.jobLocation || ''), datePosted: posting.datePosted || null, validThrough: posting.validThrough || null, sourceAts: classifyDiscoveredUrl(url, host) });
      }
      if (!structuredJobs.length) {
        for (const link of extractLinks(page.html, page.finalUrl, host).filter(x => ['job', 'ats_job'].includes(x.kind)).slice(0, 10)) discovered.push({ title: link.text || 'Job opening', url: link.url, description: '', location: '', datePosted: null, validThrough: null, sourceAts: link.kind === 'ats_job' ? new URL(link.url).hostname : 'unknown' });
      }
    } catch { /* per-page failure is isolated */ }
  }

  for (const job of discovered) {
    const fingerprint = makeFingerprint(company.companyId, job);
    try {
      await Job.updateOne({ fingerprint }, { $setOnInsert: {
        fingerprint, schemaVersion: 'v1', externalId: job.url, companyId: company.companyId, companyName: company.companyName,
        title: job.title, description: job.description, location: job.location, nation: 'UK-wide', employerType: company.employerType,
        source: { ats: job.sourceAts, url: job.url }, dates: { postedAt: job.datePosted ? new Date(job.datePosted) : null, closingAt: job.validThrough ? new Date(job.validThrough) : null },
        status: { isLive: true }, verification: { status: 'unknown', sourceUrl: job.url, evidenceType: 'discovered_from_google_career_crawl' }, raw: { discovery: 'google_career_fallback' }
      }, $set: { 'dates.lastSeenAt': new Date() } }, { upsert: true });
      jobs += 1;
    } catch { /* duplicate/race or malformed posting; leave it for normal verification */ }
  }
  return { status: 'ok', pages, jobs };
}

await connectMongo();
const companies = await Company.find({ enabled: true, 'metadata.discoveryFallback.type': 'google_jobs_search' }).sort({ priority: -1, companyName: 1 }).limit(limit).lean();
const summary = { attempted: companies.length, succeeded: 0, failed: 0, pages: 0, jobsDiscovered: 0, companiesWithJobs: 0 };
for (const company of companies) {
  const result = await processCompany(company);
  if (result.status === 'ok') { summary.succeeded += 1; summary.pages += result.pages; summary.jobsDiscovered += result.jobs; if (result.jobs) summary.companiesWithJobs += 1; }
  else summary.failed += 1;
  console.log(JSON.stringify({ company: company.companyName, ...result }));
}
console.log('=== GOOGLE CAREER CRAWL SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));
await mongoose.disconnect();
