import axios from 'axios';
import { classifyJob } from '../utils/jobClassification.js';

export const DEFAULT_APIFY_ACTOR_ID = 'conserving_celerytop/live-career-page-jobs-api';

const TECH_TITLE_FILTER = Object.freeze([
  'software engineer',
  'software developer',
  'frontend',
  'front end',
  'full stack',
  'fullstack',
  'web developer',
  'javascript',
  'typescript',
  'node',
  'react',
  'developer'
]);

function apifyToken() {
  return String(process.env.APIFY_KEY || process.env.APIFY_TOKEN || '').trim();
}

function actorPath(actorId) {
  return String(actorId || DEFAULT_APIFY_ACTOR_ID).trim().replace('/', '~');
}

function firstUrl(...values) {
  return values.map(value => String(value || '').trim()).find(value => {
    if (!(value.startsWith('http://') || value.startsWith('https://'))) return false;
    try {
      const host = new URL(value).hostname.toLowerCase();
      return !/^(?:www\\.)?(?:google|bing|search)\\./i.test(host);
    } catch {
      return false;
    }
  }) || '';
}

export function isApifyConfigured() {
  return Boolean(apifyToken());
}

export function apifyCareerUrl(company = {}) {
  return firstUrl(
    company.careersUrl,
    company.careers_url,
    company.website,
    company.metadata?.careersUrl,
    company.metadata?.website
  );
}

export function buildApifyInput(company, {
  maxItems = Number(process.env.APIFY_MAX_ITEMS || 50),
  includeDescription = true
} = {}) {
  const careerUrl = apifyCareerUrl(company);
  if (!careerUrl) throw new Error(`No careers URL or website available for ${company.companyName || company.companyId}`);

  return {
    companies: [careerUrl],
    outputMode: 'jobs',
    titleIncludes: [...TECH_TITLE_FILTER],
    titleExcludes: ['intern', 'graduate'],
    includeDescription,
    maxJobsPerCompany: Math.max(1, Number(maxItems) || 50)
  };
}

export function normalizeApifyJob(item, company) {
  if (item.rowType === 'company' || item.rowType === 'status' || item.companyStatus || item.status) return null;
  const applyUrl = firstUrl(item.applyUrl, item.apply_url, item.jobUrl, item.job_url, item.url);
  const title = String(item.title || item.jobTitle || '').trim();
  if (!title || !applyUrl) return null;

  const location = String(item.location || item.locations?.join(', ') || item.city || item.region || item.country || '').trim();
  const raw = { ...item, apifyActor: process.env.APIFY_ACTOR_ID || DEFAULT_APIFY_ACTOR_ID };
  const baseJob = {
    id: item.jobId || item.job_id || applyUrl,
    externalId: item.jobId || item.job_id || item.requisitionId || applyUrl,
    companyId: company.companyId,
    companyName: company.companyName,
    title,
    description: String(item.description || item.descriptionText || item.descriptionSnippet || '').trim(),
    location,
    employmentType: item.employmentType || item.employment_type || '',
    department: item.department || item.team || '',
    applyUrl,
    source: {
      ats: String(item.ats || 'apify').toLowerCase(),
      url: applyUrl
    },
    dates: {
      postedAt: item.datePosted || item.postedAt || item.posted_date || null,
      closingAt: item.applicationDeadline || item.closingAt || null
    },
    raw
  };

  return {
    ...baseJob,
    ...classifyJob({ job: baseJob, company, raw })
  };
}

export async function runApifyForCompany(company, options = {}) {
  const token = apifyToken();
  if (!token) throw new Error('APIFY_KEY (or APIFY_TOKEN) is not configured');

  const actorId = options.actorId || process.env.APIFY_ACTOR_ID || DEFAULT_APIFY_ACTOR_ID;
  const input = options.input || buildApifyInput(company, options);
  const timeoutMs = Math.max(30000, Number(options.timeoutMs || process.env.APIFY_TIMEOUT_MS || 300000));

  const url = `https://api.apify.com/v2/actors/${actorPath(actorId)}/run-sync-get-dataset-items`;
  const response = await axios.post(url, input, {
    timeout: timeoutMs,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    params: {
      format: 'json',
      clean: 1,
      maxTotalChargeUsd: Number(process.env.APIFY_MAX_TOTAL_CHARGE_USD || 2)
    }
  });

  const items = Array.isArray(response.data) ? response.data : response.data?.items;
  if (!Array.isArray(items)) throw new Error('Apify returned no dataset array');

  const jobs = items.map(item => normalizeApifyJob(item, company)).filter(Boolean);
  return {
    actorId,
    careersUrl: apifyCareerUrl(company),
    rawCount: items.length,
    jobs
  };
}

export async function discoverWithApify(company, options = {}) {
  if (!isApifyConfigured()) return { status: 'unconfigured', jobs: [], rawCount: 0 };

  try {
    const result = await runApifyForCompany(company, options);
    return { status: 'ok', ...result };
  } catch (error) {
    return {
      status: 'error',
      jobs: [],
      rawCount: 0,
      error: error.response?.data?.error?.message || error.message
    };
  }
}
