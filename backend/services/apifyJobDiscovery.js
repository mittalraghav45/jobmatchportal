import axios from 'axios';
import { classifyJob } from '../utils/jobClassification.js';

export const DEFAULT_APIFY_ACTOR_ID = 'apify/playwright-scraper';

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

const APIFY_PAGE_FUNCTION = `async function pageFunction(context) {
  const { page, request } = context;
  const userData = request.userData || {};
  const terms = ['software engineer', 'software developer', 'frontend', 'front end', 'full stack', 'fullstack', 'web developer', 'javascript', 'typescript', 'node', 'react', 'developer'];

  if (userData.type !== 'job') {
    const links = await page.locator('a[href]').evaluateAll((anchors, keywords) => {
      const baseHost = window.location.hostname;
      const found = [];
      for (const anchor of anchors) {
        const text = String(anchor.innerText || anchor.textContent || '').trim();
        const href = anchor.href;
        if (!href || !href.startsWith('http') || text.length < 4) continue;
        try {
          if (new URL(href).hostname !== baseHost) continue;
        } catch {
          continue;
        }
        const signal = (text + ' ' + href).toLowerCase();
        const looksLikeJob = keywords.some(keyword => signal.includes(keyword))
          || signal.includes('/job')
          || signal.includes('/vacan')
          || signal.includes('/career')
          || signal.includes('/position')
          || signal.includes('/opportun');
        if (looksLikeJob) found.push({ url: href, text });
      }
      return Array.from(new Map(found.map(item => [item.url, item])).values()).slice(0, 12);
    }, terms);

    for (const link of links) {
      await context.enqueueRequest({
        url: link.url,
        userData: { ...userData, type: 'job' }
      });
    }

    return { rowType: 'source', url: request.url, companyId: userData.companyId, companyName: userData.companyName, jobCandidates: links.length };
  }

  const payload = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    const candidates = [];

    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent || '');
        const values = Array.isArray(parsed) ? parsed : [parsed];
        for (const value of values) {
          if (!value || typeof value !== 'object') continue;
          if (value['@type'] === 'JobPosting') candidates.push(value);
          if (Array.isArray(value['@graph'])) {
            for (const graphValue of value['@graph']) {
              if (graphValue && graphValue['@type'] === 'JobPosting') candidates.push(graphValue);
            }
          }
        }
      } catch {}
    }

    const jobPosting = candidates[0] || {};
    const locations = Array.isArray(jobPosting.jobLocation)
      ? jobPosting.jobLocation.map(item => {
          const address = item && item.address ? item.address : {};
          return address.addressLocality || address.addressRegion || address.addressCountry || '';
        }).filter(Boolean).join(', ')
      : '';

    const descriptionNode = document.querySelector('[class*="job-description" i], [id*="job-description" i], article, main');
    return {
      title: jobPosting.title || (document.querySelector('h1') && document.querySelector('h1').innerText) || document.title || '',
      description: String(jobPosting.description || (descriptionNode && descriptionNode.innerText) || '').trim(),
      location: jobPosting.jobLocationType === 'TELECOMMUTE'
        ? 'Remote'
        : locations || String((document.querySelector('[class*="location" i], [data-location]') || {}).innerText || '').trim(),
      employmentType: jobPosting.employmentType || '',
      postedAt: jobPosting.datePosted || null,
      closingAt: jobPosting.validThrough || null,
      externalId: jobPosting.identifier && typeof jobPosting.identifier === 'object'
        ? jobPosting.identifier.value
        : jobPosting.identifier || '',
      companyName: jobPosting.hiringOrganization && jobPosting.hiringOrganization.name
        ? jobPosting.hiringOrganization.name
        : '',
      applyUrl: (document.querySelector('a[href*="apply" i], a[href*="application" i]') || {}).href || window.location.href
    };
  });

  const title = String(payload.title || '').trim();
  if (!title) return { rowType: 'ignored', url: request.url };

  const lowerTitle = title.toLowerCase();
  if (!terms.some(term => lowerTitle.includes(term))) {
    return { rowType: 'ignored', url: request.url, title };
  }

  return {
    rowType: 'job',
    url: request.url,
    applyUrl: payload.applyUrl || request.url,
    externalId: payload.externalId || request.url,
    title,
    description: payload.description || '',
    location: payload.location || '',
    employmentType: payload.employmentType || '',
    postedAt: payload.postedAt || null,
    closingAt: payload.closingAt || null,
    companyId: userData.companyId || '',
    companyName: userData.companyName || payload.companyName || ''
  };
}`;

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
  includeDescription = true
} = {}) {
  const careerUrl = apifyCareerUrl(company);
  if (!careerUrl) throw new Error(`No careers URL or website available for ${company.companyName || company.companyId}`);
  const cap = Math.max(1, Number(maxItems) || 50);

  return {
    startUrls: [{
      url: careerUrl,
      userData: {
        companyId: company.companyId,
        companyName: company.companyName,
        type: 'source'
      }
    }],
    linkSelector: '',
    respectRobotsTxtFile: true,
    pageFunction: APIFY_PAGE_FUNCTION,
    proxyConfiguration: { useApifyProxy: true },
    maxPagesPerCrawl: cap + 1,
    maxResultsPerCrawl: cap + 1,
    maxCrawlingDepth: 1,
    maxConcurrency: 1,
    maxRequestRetries: 2,
    pageLoadTimeoutSecs: 45,
    pageFunctionTimeoutSecs: 30,
    waitUntil: 'networkidle',
    closeCookieModals: true,
    maxScrollHeightPixels: 8000
  };
}

export function buildApifyBatchInput(companies = [], {
  maxItems = Number(process.env.APIFY_MAX_ITEMS || 50)
} = {}) {
  const cap = Math.max(1, Number(maxItems) || 50);
  const startUrls = companies.map(company => {
    const url = apifyCareerUrl(company);
    if (!url) return null;
    return {
      url,
      userData: {
        companyId: company.companyId,
        companyName: company.companyName,
        type: 'source'
      }
    };
  }).filter(Boolean);

  return {
    startUrls,
    linkSelector: '',
    respectRobotsTxtFile: true,
    pageFunction: APIFY_PAGE_FUNCTION,
    proxyConfiguration: { useApifyProxy: true },
    maxPagesPerCrawl: Math.max(startUrls.length, startUrls.length * (cap + 1)),
    maxResultsPerCrawl: Math.max(startUrls.length, startUrls.length * (cap + 1)),
    maxCrawlingDepth: 1,
    maxConcurrency: Math.min(3, Math.max(1, startUrls.length)),
    maxRequestRetries: 2,
    pageLoadTimeoutSecs: 45,
    pageFunctionTimeoutSecs: 30,
    waitUntil: 'networkidle',
    closeCookieModals: true,
    maxScrollHeightPixels: 8000
  };
}

export async function runApifyForCompanies(companies = [], options = {}) {
  const token = apifyToken();
  if (!token) throw new Error('APIFY_KEY (or APIFY_TOKEN) is not configured');
  const actorId = options.actorId || process.env.APIFY_ACTOR_ID || DEFAULT_APIFY_ACTOR_ID;
  const input = options.input || buildApifyBatchInput(companies, options);
  if (!input.startUrls?.length) throw new Error('No usable career URLs were supplied to Apify');

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
      const company = companies.find(candidate => candidate.companyId === item.companyId)
        || companies.find(candidate => candidate.companyName === item.companyName)
        || companies[0];
      return normalizeApifyJob(item, company);
    }).filter(Boolean)
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
