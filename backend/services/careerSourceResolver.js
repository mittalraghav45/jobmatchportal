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

function isSearchEngine(url = '') {
  try {
    const host = new URL(String(url).trim()).hostname.toLowerCase();
    return SEARCH_HOSTS.has(host) || host.endsWith('.google.com') || host.endsWith('.bing.com');
  } catch {
    return false;
  }
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

async function probe(url) {
  try {
    const response = await axios.get(url, {
      timeout: 7000,
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 400,
      headers: { 'User-Agent': 'SponsorTracker/1.0 career-source-resolver' }
    });

    const finalUrl = response.request?.res?.responseUrl || response.config?.url || url;
    return isUsableCareerUrl(finalUrl) ? finalUrl : null;
  } catch {
    return null;
  }
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

  // 2. Accept all known dataset field variants. This is important because
  // the golden-company importer has used both top-level and metadata fields.
  const careersUrl = firstNonEmpty(
    company.careersUrl,
    company.careers_url,
    metadata.careersUrl,
    metadata.careers_url
  );

  const website = firstNonEmpty(
    company.website,
    company.websiteUrl,
    company.website_url,
    metadata.website,
    metadata.websiteUrl,
    metadata.website_url
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

  // 3. A real careers URL is already enough. Do not reject it just because
  // the generic resolver cannot infer the ATS; processCompany will validate
  // the source through the normal ATS detector.
  if (isUsableCareerUrl(careersUrl)) {
    return {
      careersUrl,
      ats: configuredATS || null,
      atsSlug: configuredSlug || null,
      source: 'dataset-careers-url',
      status: 'resolved'
    };
  }

  // 4. If the dataset already contains a valid ATS + slug, it can be used
  // directly even when the careers URL is missing. Greenhouse/Ashby/etc.
  // adapters can operate from their canonical slug.
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

  // 5. If there is no usable website, there is nothing safe to probe.
  if (!isUsableCareerUrl(website)) {
    return {
      careersUrl: null,
      ats: configuredATS || null,
      atsSlug: configuredSlug || null,
      source: 'unresolved',
      status: 'unresolved',
      reason: 'No usable careers URL or company website'
    };
  }

  // 6. Probe a small, deterministic set of common careers paths.
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

  return {
    careersUrl: null,
    ats: configuredATS || null,
    atsSlug: configuredSlug || null,
    source: 'unresolved',
    status: 'unresolved',
    reason: 'Company website did not expose a common careers/jobs path'
  };
}
