import axios from 'axios';
import { getCareerSourceOverride } from '../config/career-source-overrides.js';
import { resolveATSConfig } from '../ats/detector.js';

const SEARCH_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'bing.com',
  'www.bing.com',
  'yahoo.com',
  'search.yahoo.com',
  'duckduckgo.com',
  'www.duckduckgo.com'
]);

const BLOCKED_RESULT_HOSTS = new Set([
  'linkedin.com',
  'www.linkedin.com',
  'indeed.com',
  'www.indeed.com',
  'glassdoor.com',
  'www.glassdoor.com',
  'facebook.com',
  'www.facebook.com',
  'instagram.com',
  'www.instagram.com',
  'youtube.com',
  'www.youtube.com',
  'companieshouse.gov.uk',
  'find-and-update.company-information.service.gov.uk'
]);

const COMMON_CAREER_PATHS = [
  '/careers',
  '/jobs',
  '/careers/search',
  '/work-with-us',
  '/join-us',
  '/join-our-team'
];

function firstNonEmpty(...values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

function hostOf(url = '') {
  try {
    return new URL(String(url).trim()).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isSearchEngine(url = '') {
  const host = hostOf(url);
  return SEARCH_HOSTS.has(host) || host.endsWith('.google.com') || host.endsWith('.bing.com');
}

function isBlockedResult(url = '') {
  const host = hostOf(url);
  return isSearchEngine(url) || BLOCKED_RESULT_HOSTS.has(host) || [...BLOCKED_RESULT_HOSTS].some(item => host.endsWith(`.${item}`));
}

export function isUsableCareerUrl(url = '') {
  try {
    const parsed = new URL(String(url).trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return !isSearchEngine(url);
  } catch {
    return false;
  }
}

function normaliseUrl(url = '') {
  try {
    const parsed = new URL(String(url).trim());
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function candidateDomains(companyName = '') {
  const suffixes = new Set(['limited', 'ltd', 'plc', 'llp', 'uk', 'group', 'holdings', 'company', 'co', 'the']);
  const words = String(companyName).toLowerCase().match(/[a-z0-9]+/g) || [];
  const filtered = words.filter(word => !suffixes.has(word));
  if (!filtered.length) return [];

  const compact = filtered.join('');
  const hyphenated = filtered.join('-');
  return [...new Set([
    `${compact}.co.uk`,
    `${hyphenated}.co.uk`,
    `${compact}.com`,
    `${hyphenated}.com`,
    `${compact}.uk`,
    `${hyphenated}.uk`
  ])];
}

async function probe(url) {
  try {
    const response = await axios.get(url, {
      timeout: 7000,
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 400,
      headers: { 'User-Agent': 'SponsorTracker/1.0 career-source-resolver' }
    });

    const finalUrl = response.request?.res?.responseUrl || response.config?.url || url;
    return isUsableCareerUrl(finalUrl) ? normaliseUrl(finalUrl) : null;
  } catch {
    return null;
  }
}

function extractSearchLinks(html = '') {
  const links = [];
  const regex = /href=["']([^"']+)["']/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    let href = match[1].replace(/&amp;/g, '&');

    try {
      if (href.startsWith('/url?')) {
        href = new URL(`https://www.google.com${href}`).searchParams.get('q') || '';
      }
    } catch {
      href = '';
    }

    if (!/^https?:\/\//i.test(href)) continue;
    const normalised = normaliseUrl(href);
    if (!normalised || isBlockedResult(normalised)) continue;
    if (!links.includes(normalised)) links.push(normalised);
  }

  return links;
}

async function searchForCompanyWebsite(companyName) {
  if (!companyName?.trim()) return null;

  const query = encodeURIComponent(`"${companyName}" UK company website careers`);
  const searchUrls = [
    `https://www.google.com/search?q=${query}`,
    `https://www.bing.com/search?q=${query}`
  ];

  for (const searchUrl of searchUrls) {
    try {
      const response = await axios.get(searchUrl, {
        timeout: 7000,
        maxRedirects: 3,
        validateStatus: status => status >= 200 && status < 400,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36'
        }
      });

      const links = extractSearchLinks(response.data);
      if (links.length) return links[0];
    } catch {
      // Try the next search engine. Search discovery is only a fallback.
    }
  }

  return null;
}

async function discoverWebsite(company) {
  const existingWebsite = firstNonEmpty(
    company.website,
    company.websiteUrl,
    company.website_url,
    company.metadata?.website,
    company.metadata?.websiteUrl,
    company.metadata?.website_url
  );

  if (isUsableCareerUrl(existingWebsite)) return normaliseUrl(existingWebsite);

  for (const domain of candidateDomains(company.companyName)) {
    const resolved = await probe(`https://${domain}/`);
    if (resolved) return resolved;
  }

  return searchForCompanyWebsite(company.companyName);
}

function looksLikeCareerLink(url = '') {
  const value = String(url).toLowerCase();
  return /career|jobs|join-us|joinourteam|work-with-us|vacanc|opportunit/.test(value);
}

async function discoverCareerLinkFromHomepage(website) {
  try {
    const response = await axios.get(website, {
      timeout: 7000,
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 400,
      headers: { 'User-Agent': 'SponsorTracker/1.0 career-source-resolver' }
    });

    const html = String(response.data || '');
    const links = extractSearchLinks(html);

    for (const link of links) {
      if (looksLikeCareerLink(link)) return link;
    }
  } catch {
    return null;
  }

  return null;
}

export async function resolveCareerSource(company = {}) {
  const metadata = company.metadata && typeof company.metadata === 'object'
    ? company.metadata
    : {};

  // 1. Explicit curated source always wins.
  const override = getCareerSourceOverride(company);
  if (override && isUsableCareerUrl(override.careersUrl)) {
    return {
      careersUrl: override.careersUrl,
      ats: override.ats,
      atsSlug: override.atsSlug,
      source: 'curated',
      status: 'resolved'
    };
  }

  const careersUrl = firstNonEmpty(
    company.careersUrl,
    company.careers_url,
    metadata.careersUrl,
    metadata.careers_url
  );

  const configuredATS = firstNonEmpty(
    company.ats,
    company.atsName,
    metadata.ats,
    metadata.atsName
  ).toLowerCase();

  const configuredSlug = firstNonEmpty(
    company.atsSlug,
    company.ats_slug,
    company.slug,
    metadata.atsSlug,
    metadata.ats_slug,
    metadata.slug
  );

  // 2. Never treat a search-engine URL as a careers source.
  if (isUsableCareerUrl(careersUrl)) {
    return {
      careersUrl: normaliseUrl(careersUrl),
      ats: configuredATS || null,
      atsSlug: configuredSlug || null,
      source: 'dataset-careers-url',
      status: 'resolved'
    };
  }

  // 3. Existing ATS + slug is sufficient for ATS adapters.
  if (configuredATS && configuredSlug) {
    const resolved = resolveATSConfig({
      ats: configuredATS,
      atsSlug: configuredSlug,
      careersUrl: ''
    });

    if (!resolved.error && resolved.ats) {
      return {
        careersUrl: '',
        ats: resolved.ats,
        atsSlug: resolved.slug || configuredSlug,
        source: 'dataset-ats-config',
        status: 'resolved'
      };
    }
  }

  // 4. Recover a real company website when the dataset contains a bad
  // placeholder such as https://www.google.com/search?q=Company+careers.
  const website = await discoverWebsite(company);
  if (!website) {
    return {
      careersUrl: null,
      ats: configuredATS || null,
      atsSlug: configuredSlug || null,
      source: 'unresolved',
      status: 'unresolved',
      reason: 'No usable company website could be discovered'
    };
  }

  // 5. Probe common paths first.
  for (const path of COMMON_CAREER_PATHS) {
    const resolved = await probe(new URL(path, website).toString());
    if (resolved) {
      return {
        careersUrl: resolved,
        ats: configuredATS || null,
        atsSlug: configuredSlug || null,
        source: 'website-probe',
        status: 'resolved'
      };
    }
  }

  // 6. Some companies use non-standard paths but expose a careers link on
  // their homepage. Inspect the homepage before declaring the company lost.
  const homepageCareerLink = await discoverCareerLinkFromHomepage(website);
  if (homepageCareerLink) {
    return {
      careersUrl: homepageCareerLink,
      ats: configuredATS || null,
      atsSlug: configuredSlug || null,
      source: 'homepage-career-link',
      status: 'resolved'
    };
  }

  return {
    careersUrl: null,
    ats: configuredATS || null,
    atsSlug: configuredSlug || null,
    source: 'unresolved',
    status: 'unresolved',
    reason: 'Company website did not expose a usable careers/jobs source'
  };
}
