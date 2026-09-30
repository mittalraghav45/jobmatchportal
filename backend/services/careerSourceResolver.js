import axios from 'axios';
import { getCareerSourceOverride } from '../config/career-source-overrides.js';

const SEARCH_HOSTS = new Set(['google.com','www.google.com','bing.com','www.bing.com','yahoo.com','search.yahoo.com','duckduckgo.com','www.duckduckgo.com']);
const COMMON_CAREER_PATHS = ['/careers','/jobs','/careers/search','/work-with-us','/join-us','/join-our-team'];

function isSearchEngine(url = '') {
  try {
    const host = new URL(String(url).trim()).hostname.toLowerCase();
    return SEARCH_HOSTS.has(host) || host.endsWith('.google.com') || host.endsWith('.bing.com');
  } catch { return false; }
}

export function isUsableCareerUrl(url = '') {
  try {
    const parsed = new URL(String(url).trim());
    if (!['http:','https:'].includes(parsed.protocol)) return false;
    return !isSearchEngine(url);
  } catch { return false; }
}

async function probe(url) {
  try {
    const response = await axios.get(url, { timeout: 7000, maxRedirects: 5, validateStatus: status => status >= 200 && status < 400, headers: { 'User-Agent': 'SponsorTracker/1.0 career-source-resolver' } });
    const finalUrl = response.request?.res?.responseUrl || response.config?.url || url;
    return isUsableCareerUrl(finalUrl) ? finalUrl : null;
  } catch { return null; }
}

export async function resolveCareerSource(company = {}) {
  const override = getCareerSourceOverride(company);
  if (override && isUsableCareerUrl(override.careersUrl)) return { careersUrl: override.careersUrl, ats: override.ats, atsSlug: override.atsSlug, source: 'curated', status: 'resolved' };
  if (isUsableCareerUrl(company.careersUrl)) return { careersUrl: company.careersUrl, ats: company.ats, atsSlug: company.metadata?.atsSlug, source: 'dataset-careers-url', status: 'resolved' };
  if (!isUsableCareerUrl(company.website)) return { careersUrl: null, ats: null, atsSlug: null, source: 'unresolved', status: 'unresolved', reason: 'No usable careers URL or company website' };

  for (const path of COMMON_CAREER_PATHS) {
    const resolved = await probe(new URL(path, company.website).toString());
    if (resolved) return { careersUrl: resolved, ats: null, atsSlug: null, source: 'website-probe', status: 'resolved' };
  }
  return { careersUrl: null, ats: null, atsSlug: null, source: 'unresolved', status: 'unresolved', reason: 'Company website did not expose a common careers/jobs path' };
}
