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

function classifyApifyFailure(error) {
  const status = Number(error?.response?.status || 0);
  const message = String(error?.response?.data?.error?.message || error?.message || '').toLowerCase();
  const fatalPatterns = [
    'insufficient funds',
    'insufficient balance',
    'not enough funds',
    'quota exceeded',
    'usage limit',
    'credit limit',
    'memory limit',
    'exceed the memory limit',
    'actor limit',
    'max total charge',
    'maximum total charge',
    'payment required',
    'invalid token',
    'invalid api token',
    'authentication',
    'unauthorized',
    'forbidden'
  ];
  const fatal = status === 401 || status === 402 || status === 403 || fatalPatterns.some(pattern => message.includes(pattern));
  const retryable = status === 408 || status === 429 || status >= 500 || /timeout|timed out|econnreset|socket hang up|network/i.test(message);
  return { fatal, retryable, status, message };
}

async function runApifyRequest(input, options = {}) {
  const token = apifyToken();
  if (!token) throw new Error('APIFY_KEY (or APIFY_TOKEN) is not configured');

  const actorId = options.actorId || process.env.APIFY_ACTOR_ID || DEFAULT_APIFY_ACTOR_ID;
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
  return { actorId, items };
}

export { classifyApifyFailure };\n\n
export async function assertApifyCapacity(options = {}) {
  const token = apifyToken();
  if (!token) throw new Error('APIFY_KEY (or APIFY_TOKEN) is not configured');
  const timeoutMs = Math.max(10000, Number(options.timeoutMs || 30000));
  const response = await axios.get('https://api.apify.com/v2/users/me/limits', {
    timeout: timeoutMs,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });
  const data = response.data?.data;
  if (!data?.limits || !data?.current) throw new Error('Apify capacity check returned an incomplete response');
  const remainingUsd = Number(data.limits.maxMonthlyUsageUsd) - Number(data.current.monthlyUsageUsd);
  const minRemainingUsd = Math.max(0, Number(process.env.APIFY_MIN_REMAINING_USD || 0.50));
  if (!Number.isFinite(remainingUsd) || remainingUsd < minRemainingUsd) {
    throw new Error(`Apify monthly usage headroom too low: $\${Math.max(0, remainingUsd).toFixed(2)} remaining`);
  }
  if (Number(data.current.activeActorJobCount) >= Number(data.limits.maxConcurrentActorJobs)) {
    throw new Error('Apify concurrent Actor job limit is currently exhausted');
  }
  if (Number(data.current.actorMemoryGbytes) >= Number(data.limits.maxActorMemoryGbytes)) {
    throw new Error('Apify account Actor memory limit is currently exhausted');
  }
  return { remainingUsd, activeActorJobCount: data.current.activeActorJobCount, actorMemoryGbytes: data.current.actorMemoryGbytes };
}

export async function runApifyForCompanies(companies = [], options = {}) {
  if (!companies.length) return { actorId: options.actorId || DEFAULT_APIFY_ACTOR_ID, rawCount: 0, jobs: [], errors: [] };

  const jobs = [];
  const errors = [];
  let actorId = options.actorId || process.env.APIFY_ACTOR_ID || DEFAULT_APIFY_ACTOR_ID;
  let rawCount = 0;

  // The Actor's maxItems is a per-run cap. Running one company per Actor run
  // prevents results from one career site being attributed to another company
  // and makes individual scraper failures observable.
  for (const company of companies) {
    try {
      const input = buildApifyInput(company, options);
      const result = await runApifyRequest(input, options);
      actorId = result.actorId;
      rawCount += result.items.length;
      jobs.push(...result.items.map(item => normalizeApifyJob(item, company)).filter(Boolean));
    } catch (error) {
      const failure = classifyApifyFailure(error);
      errors.push({
        companyId: company.companyId,
        companyName: company.companyName,
        error: failure.message,
        status: failure.status,
        fatal: failure.fatal,
        retryable: failure.retryable
      });
      if (failure.fatal || failure.retryable) break;
    }
  }

  return { actorId, rawCount, jobs, errors };
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
