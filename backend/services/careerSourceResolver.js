import axios from 'axios';
import { getCareerSourceOverride } from '../config/career-source-overrides.js';
import { resolveATSConfig } from '../ats/detector.js';

const SEARCH_HOSTS = new Set([
  'google.com', 'www.google.com', 'bing.com', 'www.bing.com',
  'yahoo.com', 'search.yahoo.com', 'duckduckgo.com', 'www.duckduckgo.com'
]);

const BLOCKED_RESULT_HOSTS = new Set([
  'linkedin.com', 'www.linkedin.com', 'indeed.com', 'www.indeed.com',
  'glassdoor.com', 'www.glassdoor.com', 'facebook.com', 'www.facebook.com',
  'instagram.com', 'www.instagram.com', 'youtube.com', 'www.youtube.com',
  'companieshouse.gov.uk', 'find-and-update.company-information.service.gov.uk'
]);

const COMMON_CAREER_PATHS = [
  '/careers', '/jobs', '/vacancies', '/work-for-us', '/work-with-us',
  '/join-us', '/join-our-team', '/current-vacancies', '/job-search'
];

const ATS_HINTS = [
  ['trac', /trac\.jobs|jobs\.trac\.jobs/i],
  ['jobtrain', /jobtrain\.co\.uk/i],
  ['nhs', /jobs\.nhs\.uk/i],
  ['workday', /(?:myworkdayjobs\.com|\.myworkday\.com)/i],
  ['smartrecruiters', /smartrecruiters\.com/i],
  ['successfactors', /successfactors\.(?:com|eu|co\.uk)/i],
  ['icims', /(?:\.icims\.com|icims\.com)/i],
  ['oracle', /(?:taleo\.net|oraclecloud\.com\/hcm|oracle\.com\/.*careers)/i],
  ['greenhouse', /(?:greenhouse\.io|greenhouse\.com)/i],
  ['lever', /(?:jobs\.lever\.co|lever\.co)/i],
  ['ashby', /ashbyhq\.com/i],
  ['teamtailor', /teamtailor\.com/i],
  ['recruitee', /recruitee\.com/i],
  ['pinpoint', /pinpointhq\.com/i],
  ['workable', /workable\.com/i],
  ['bamboohr', /bamboohr\.com/i],
  ['brassring', /brassring\.com/i],
  ['civica', /civica(?:\.co\.uk|\.com)/i]
];

function firstNonEmpty(...values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

function hostOf(url = '') {
  try { return new URL(String(url).trim()).hostname.toLowerCase(); } catch { return ''; }
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
    return !isSearchEngine(url) && !isBlockedResult(url);
  } catch { return false; }
}

function normaliseUrl(url = '') {
  try {
    const parsed = new URL(String(url).trim());
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch { return ''; }
}

function candidateDomains(companyName = '', employerType = '') {
  const suffixes = new Set([
    'limited', 'ltd', 'plc', 'llp', 'uk', 'group', 'holdings', 'company', 'co', 'the',
    'council', 'borough', 'district', 'city', 'metropolitan', 'county', 'corporation',
    'nhs', 'trust', 'university', 'universities'
  ]);
  const words = String(companyName).toLowerCase().match(/[a-z0-9]+/g) || [];
  const filtered = words.filter(word => !suffixes.has(word));
  if (!filtered.length) return [];

  const compact = filtered.join('');
  const hyphenated = filtered.join('-');
  const candidates = [
    `${compact}.gov.uk`, `${hyphenated}.gov.uk`,
    `${compact}.nhs.uk`, `${hyphenated}.nhs.uk`,
    `${compact}.ac.uk`, `${hyphenated}.ac.uk`,
    `${compact}.org.uk`, `${hyphenated}.org.uk`,
    `${compact}.co.uk`, `${hyphenated}.co.uk`,
    `${compact}.uk`, `${hyphenated}.uk`,
    `${compact}.com`, `${hyphenated}.com`
  ];

  if (employerType === 'universities') return candidates.sort((a, b) => Number(b.endsWith('.ac.uk')) - Number(a.endsWith('.ac.uk')));
  if (employerType === 'nhs') return candidates.sort((a, b) => Number(b.endsWith('.nhs.uk')) - Number(a.endsWith('.nhs.uk')));
  if (employerType === 'councils' || employerType === 'dwp') return candidates.sort((a, b) => Number(b.endsWith('.gov.uk')) - Number(a.endsWith('.gov.uk')));
  return candidates;
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
  } catch { return null; }
}

function extractAbsoluteUrls(html = '') {
  const urls = new Set();
  const patterns = [
    /(?:href|src|action|data-src|data-url|data-href|data-careers-url|data-jobs-url)\s*=\s*["']([^"']+)["']/gi,
    /(?:https?:)?\/\/[^\s"'<>\\]+/gi
  ];

  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(String(html))) !== null) {
      let value = match[1] || match[0];
      value = value.replace(/&amp;/g, '&').replace(/[),.;]+$/, '');
      if (value.startsWith('//')) value = `https:${value}`;
      if (!/^https?:\/\//i.test(value)) continue;
      const normalised = normaliseUrl(value);
      if (normalised && isUsableCareerUrl(normalised)) urls.add(normalised);
    }
  }
  return [...urls];
}

function extractSearchLinks(html = '') {
  const links = [];
  const regex = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    let href = match[1].replace(/&amp;/g, '&');
    try {
      if (href.startsWith('/url?')) href = new URL(`https://www.google.com${href}`).searchParams.get('q') || '';
    } catch { href = ''; }
    if (!/^https?:\/\//i.test(href)) continue;
    const normalised = normaliseUrl(href);
    if (!normalised || isBlockedResult(normalised)) continue;
    if (!links.includes(normalised)) links.push(normalised);
  }
  return links;
}

async function searchForCompanyWebsite(companyName, employerType = '') {
  if (!companyName?.trim()) return null;
  const suffix = employerType === 'nhs' ? ' NHS UK' : employerType === 'universities' ? ' university UK' : employerType === 'councils' ? ' council UK' : ' UK';
  const query = encodeURIComponent(`"${companyName}"${suffix} official website`);
  const searchUrls = [
    `https://www.google.com/search?q=${query}`,
    `https://www.bing.com/search?q=${query}`
  ];

  for (const searchUrl of searchUrls) {
    try {
      const response = await axios.get(searchUrl, {
        timeout: 7000, maxRedirects: 3,
        validateStatus: status => status >= 200 && status < 400,
        headers: { 'User-Agent': 'Mozilla/5.0 SponsorTracker/1.0' }
      });
      const links = extractSearchLinks(response.data);
      if (links.length) return links[0];
    } catch { /* try next source */ }
  }
  return null;
}

async function discoverWebsite(company) {
  const existingWebsite = firstNonEmpty(
    company.website, company.websiteUrl, company.website_url,
    company.metadata?.website, company.metadata?.websiteUrl, company.metadata?.website_url
  );
  if (isUsableCareerUrl(existingWebsite)) return normaliseUrl(existingWebsite);

  for (const domain of candidateDomains(company.companyName, company.employerType)) {
    const resolved = await probe(`https://${domain}/`);
    if (resolved) return resolved;
  }

  return searchForCompanyWebsite(company.companyName, company.employerType);
}

function looksLikeCareerLink(url = '') {
  return /career|jobs|join-us|joinourteam|work-with-us|vacanc|opportunit|recruit|talent/i.test(String(url));
}

async function discoverCareerLinkFromHomepage(website) {
  try {
    const response = await axios.get(website, {
      timeout: 7000, maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 400,
      headers: { 'User-Agent': 'SponsorTracker/1.0 career-source-resolver' }
    });
    const html = String(response.data || '');
    const links = [...extractSearchLinks(html), ...extractAbsoluteUrls(html)];
    for (const link of links) if (looksLikeCareerLink(link)) return link;
  } catch { return null; }
  return null;
}

function detectATSInText(text = '', candidateUrl = '') {
  const inspectedUrls = [candidateUrl, ...extractAbsoluteUrls(text)];
  for (const url of inspectedUrls) {
    const detected = resolveATSConfig({ careersUrl: url });
    if (detected.ats) return { ats: detected.ats, atsSlug: detected.slug || null, source: 'ats-url' };
  }

  for (const [ats, pattern] of ATS_HINTS) {
    if (pattern.test(text)) return { ats, atsSlug: null, source: 'ats-page-hint' };
  }
  return { ats: null, atsSlug: null };
}

async function inspectATSFromPage(url) {
  if (!isUsableCareerUrl(url)) return { ats: null, atsSlug: null };
  try {
    const response = await axios.get(url, {
      timeout: 9000,
      maxRedirects: 8,
      validateStatus: status => status >= 200 && status < 400,
      headers: { 'User-Agent': 'Mozilla/5.0 SponsorTracker/1.0 ats-detector' }
    });
    const finalUrl = response.request?.res?.responseUrl || response.config?.url || url;
    const html = String(response.data || '');
    const detected = detectATSInText(html, finalUrl);
    if (detected.ats) return detected;

    // Inspect the first-level embedded/linked recruitment sources. Many public-sector
    // careers pages keep the employer URL while loading the actual ATS in an iframe.
    const embedded = extractAbsoluteUrls(html).filter(link => !isBlockedResult(link)).slice(0, 40);
    for (const candidate of embedded) {
      const fromUrl = resolveATSConfig({ careersUrl: candidate });
      if (fromUrl.ats) return { ats: fromUrl.ats, atsSlug: fromUrl.slug || null, source: 'embedded-url' };
    }

    // Follow likely recruitment links one level deeper and inspect their HTML.
    const recruitmentLinks = embedded.filter(looksLikeCareerLink).slice(0, 8);
    for (const candidate of recruitmentLinks) {
      try {
        const child = await axios.get(candidate, {
          timeout: 7000,
          maxRedirects: 5,
          validateStatus: status => status >= 200 && status < 400,
          headers: { 'User-Agent': 'Mozilla/5.0 SponsorTracker/1.0 ats-detector' }
        });
        const childFinalUrl = child.request?.res?.responseUrl || child.config?.url || candidate;
        const childDetected = detectATSInText(String(child.data || ''), childFinalUrl);
        if (childDetected.ats) return { ...childDetected, source: 'linked-careers-page' };
      } catch { /* continue inspecting other candidates */ }
    }
  } catch { /* ATS inspection is best-effort and must not fail resolution */ }
  return { ats: null, atsSlug: null };
}

function resolvedResult({ website = '', careersUrl = '', ats = null, atsSlug = null, source = '' }) {
  return { website: website || null, careersUrl: careersUrl || null, ats: ats || null, atsSlug: atsSlug || null, source, status: 'resolved' };
}

export async function resolveCareerSource(company = {}) {
  const metadata = company.metadata && typeof company.metadata === 'object' ? company.metadata : {};
  const override = getCareerSourceOverride(company);
  if (override && isUsableCareerUrl(override.careersUrl)) {
    const inspected = await inspectATSFromPage(override.careersUrl);
    return resolvedResult({
      website: company.website || '', careersUrl: override.careersUrl,
      ats: override.ats || inspected.ats, atsSlug: override.atsSlug || inspected.atsSlug,
      source: 'curated'
    });
  }

  const careersUrl = firstNonEmpty(company.careersUrl, company.careers_url, metadata.careersUrl, metadata.careers_url);
  const configuredATS = firstNonEmpty(company.ats, company.atsName, metadata.ats, metadata.atsName).toLowerCase();
  const configuredSlug = firstNonEmpty(company.atsSlug, company.ats_slug, company.slug, metadata.atsSlug, metadata.ats_slug, metadata.slug);

  if (isUsableCareerUrl(careersUrl)) {
    const detected = await inspectATSFromPage(careersUrl);
    return resolvedResult({
      website: company.website || '', careersUrl: normaliseUrl(careersUrl),
      ats: detected.ats || configuredATS, atsSlug: detected.atsSlug || configuredSlug,
      source: detected.ats ? `dataset-careers-url+${detected.source}` : 'dataset-careers-url'
    });
  }

  if (configuredATS && configuredATS !== 'unknown' && configuredSlug) {
    const resolved = resolveATSConfig({ ats: configuredATS, atsSlug: configuredSlug, careersUrl: '' });
    if (!resolved.error && resolved.ats) {
      return resolvedResult({ website: company.website || '', careersUrl: '', ats: resolved.ats, atsSlug: resolved.slug || configuredSlug, source: 'dataset-ats-config' });
    }
  }

  const website = await discoverWebsite(company);
  if (!website) {
    return { website: null, careersUrl: null, ats: configuredATS || null, atsSlug: configuredSlug || null, source: 'unresolved', status: 'unresolved', reason: 'No usable company website could be discovered' };
  }

  for (const path of COMMON_CAREER_PATHS) {
    const resolved = await probe(new URL(path, website).toString());
    if (resolved) {
      const detected = await inspectATSFromPage(resolved);
      return resolvedResult({ website, careersUrl: resolved, ats: detected.ats || configuredATS, atsSlug: detected.atsSlug || configuredSlug, source: detected.ats ? `website-probe+${detected.source}` : 'website-probe' });
    }
  }

  const homepageCareerLink = await discoverCareerLinkFromHomepage(website);
  if (homepageCareerLink) {
    const detected = await inspectATSFromPage(homepageCareerLink);
    return resolvedResult({ website, careersUrl: homepageCareerLink, ats: detected.ats || configuredATS, atsSlug: detected.atsSlug || configuredSlug, source: detected.ats ? `homepage-career-link+${detected.source}` : 'homepage-career-link' });
  }

  return { website, careersUrl: null, ats: configuredATS || null, atsSlug: configuredSlug || null, source: 'website-no-careers', status: 'unresolved', reason: 'Company website resolved but no usable careers/jobs source was found' };
}
