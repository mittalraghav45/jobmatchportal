import axios from 'axios';
import { classifyJob } from '../utils/jobClassification.js';

export const DEFAULT_APIFY_ACTOR_ID = 'parseforge/career-site-jobs-scraper';

const TECH_TITLE_FILTER = Object.freeze([
  'software engineer', 'software developer', 'frontend', 'front end',
  'full stack', 'fullstack', 'web developer', 'javascript',
  'typescript', 'node', 'react', 'developer'
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
      return !['google.com', 'bing.com', 'search.com'].includes(host)
        && !host.endsWith('.google.com')
        && !host.endsWith('.bing.com')
        && !host.endsWith('.search.com');
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
  includeDescription = true,
  includeCompensation = false,
  includeSkills = false,
  searchTerms = TECH_TITLE_FILTER
} = {}) {
  const careerUrl = apifyCareerUrl(company);
  if (!careerUrl) throw new Error(`No careers URL or website available for ${company.companyName || company.companyId}`);
  const cap = Math.max(1, Number(maxItems) || 50);
  const terms = Array.from(new Set(searchTerms.map(term => String(term).trim()).filter(Boolean)));

  return {
    careerSiteUrls: [careerUrl],
    searchTerms: terms,
    maxItems: cap,
    includeDescription,
    includeCompensation,
    includeSkills
  };
}

export function buildApifyBatchInput(companies = [], {
  maxItems = Number(process.env.APIFY_MAX_ITEMS || 10),
  includeDescription = true,
  includeCompensation = false,
  includeSkills = false,
  searchTerms = TECH_TITLE_FILTER
} = {}) {
  const cap = Math.max(1, Number(maxItems) || 10);
  const terms = Array.from(new Set(searchTerms.map(term => String(term).trim()).filter(Boolean)));
  const careerSiteUrls = companies.map(apifyCareerUrl).filter(Boolean);
  if (!careerSiteUrls.length) throw new Error('No usable career URLs were supplied to Apify');

  return {
    careerSiteUrls,
    searchTerms: terms,
    maxItems: cap,
    includeDescription,
    includeCompensation,
    includeSkills
  };
}

export async function runApifyForCompanies(companies = [], options = {}) {
  const token = apifyToken();
  if (!token) throw new Error('APIFY_KEY (or APIFY_TOKEN) is not configured');

  const actorId = options.actorId || process.env.APIFY_ACTOR_ID || DEFAULT_APIFY_ACTOR_ID;
  const input = options.input || buildApifyBatchInput(companies, options);
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

  return {
    actorId,
    rawCount: items.length,
    jobs: items.map(item => {
      const companyId = item.companyId || item.company_id || '';
      const companyName = item.company || item.companyName || item.company_name || '';
      const company = companies.find(candidate => String(candidate.companyId) === String(companyId))
        || companies.find(candidate => String(candidate.companyName).trim().toLowerCase() === String(companyName).trim().toLowerCase())
        || companies[0];
      return normalizeApifyJob(item, company);
    }).filter(Boolean)
  };
}

export function normalizeApifyJob(item = {}, company = {}) {
  const title = String(item.title || item.jobTitle || '').trim();
  const applyUrl = firstUrl(item.applyUrl, item.apply_url, item.jobUrl, item.job_url, item.url);
  if (!title || !applyUrl || !company?.companyId) return null;

  const locationParts = [
    item.location,
    item.city,
    item.region,
    item.country
  ].map(value => String(value || '').trim()).filter(Boolean);
  const location = locationParts.length ? Array.from(new Set(locationParts)).join(', ') : '';
  const raw = { ...item, apifyActor: process.env.APIFY_ACTOR_ID || DEFAULT_APIFY_ACTOR_ID };

  const baseJob = {
    id: item.jobId || item.job_id || item.requisitionId || applyUrl,
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
      ats: String(item.ats || item.sourceType || 'apify').toLowerCase(),
      url: firstUrl(item.jobUrl, item.url, item.applyUrl) || applyUrl
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
  return runApifyForCompanies([company], options);
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
