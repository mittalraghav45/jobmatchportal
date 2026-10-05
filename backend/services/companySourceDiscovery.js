import axios from 'axios';
import { searchJobsWithSerper } from './serperJobDiscovery.js';
import { resolveATSConfig } from '../ats/detector.js';

const SEARCH_TERMS = [
  'careers jobs',
  'careers jobs vacancies',
  'jobs hiring'
];

const ATS_FALLBACK_QUERY = '("COMPANY" site:boards.greenhouse.io OR site:job-boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR site:myworkdayjobs.com) jobs UK';

const SEARCH_IGNORED_TOKENS = new Set([
  'the', 'and', 'of', 'for', 'uk', 'ltd', 'limited', 'plc', 'llp',
  'group', 'company', 'university', 'council', 'borough', 'city', 'nhs', 'trust'
]);

function hostOf(url = '') {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

function companyTokens(companyName = '') {
  return String(companyName).toLowerCase().match(/[a-z0-9]+/g)
    ?.filter(token => token.length >= 4 && !SEARCH_IGNORED_TOKENS.has(token)) || [];
}

function isSearchEngineHost(host = '') {
  return /^(?:google\.|www\.google\.|bing\.|www\.bing\.|search\.)/i.test(host);
}

function isCareerPath(url = '') {
  try {
    const parsed = new URL(url);
    return /(?:career|jobs?|vacanc|opportunit|recruit|talent|work-with-us|join-us|join-our-team)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function officialHostOf(company) {
  return hostOf(company?.website || company?.careersUrl || company?.metadata?.website || company?.metadata?.careersUrl || '');
}

function scoreCandidate({ company, result }) {
  const url = String(result?.url || '').trim();
  const host = hostOf(url);
  if (!url || !host || isSearchEngineHost(host)) return null;

  const tokens = companyTokens(company.companyName);
  const haystack = `${result.title || ''} ${result.snippet || ''} ${url}`.toLowerCase();
  const tokenMatches = tokens.filter(token => haystack.includes(token)).length;

  const detected = resolveATSConfig({ careersUrl: url });
  const officialHost = officialHostOf(company);
  const sameOfficialHost = Boolean(officialHost && (host === officialHost || host.endsWith(`.${officialHost}`)));
  const careerPath = isCareerPath(url);
  const credibleCareerResult = careerPath || sameOfficialHost || Boolean(detected.ats);

  if (!credibleCareerResult) return null;
  if (!sameOfficialHost && !detected.ats && tokens.length && tokenMatches === 0) return null;

  const score =
    (detected.ats ? 100 : 0) +
    (sameOfficialHost ? 55 : 0) +
    (careerPath ? 25 : 0) +
    Math.min(tokenMatches, 3) * 10;

  return {
    companyId: String(company.companyId),
    companyName: company.companyName,
    sourceUrl: url,
    ats: detected.ats || (sameOfficialHost && careerPath ? 'custom' : null),
    atsSlug: detected.slug || null,
    atsSite: detected.site || null,
    sourceType: detected.ats ? 'ats' : 'career-site',
    score,
    evidence: {
      title: result.title || '',
      snippet: result.snippet || '',
      sourceHost: host,
      officialHost: officialHost || null,
      sameOfficialHost,
      careerPath,
      tokenMatches
    }
  };
}

export function buildCompanySourceQueries({ companyName, website = '', careersUrl = '', location = 'UK' } = {}) {
  const name = String(companyName || '').trim();
  if (!name) return [];

  const officialHost = hostOf(website || careersUrl);
  const queries = [];

  if (officialHost) {
    queries.push(`site:${officialHost} careers jobs ${location}`);
  }

  queries.push(ATS_FALLBACK_QUERY.replace('COMPANY', name).replace('UK', location));

  for (const term of SEARCH_TERMS) {
    queries.push(`"${name}" ${term} ${location}`);
  }

  return [...new Set(queries)];
}

export function rankSourceCandidates({ company, results = [] } = {}) {
  const candidates = results
    .map(result => scoreCandidate({ company, result }))
    .filter(Boolean);

  const byUrl = new Map();
  for (const candidate of candidates) {
    const existing = byUrl.get(candidate.sourceUrl);
    if (!existing || candidate.score > existing.score) byUrl.set(candidate.sourceUrl, candidate);
  }

  return [...byUrl.values()].sort((a, b) => b.score - a.score);
}

export function prioritizeSourceReadyCompanies(companies = [], { limit = 25, registeredIds = new Set() } = {}) {
  const eligible = companies.filter(company => !registeredIds.has(String(company.companyId)));
  const sourceReady = eligible.filter(company => Boolean(
    company.website ||
    company.careersUrl ||
    company.metadata?.website ||
    company.metadata?.careersUrl
  ));
  const sourceReadyIds = new Set(sourceReady.map(company => String(company.companyId)));
  const fallback = eligible.filter(company => !sourceReadyIds.has(String(company.companyId)));
  return [...sourceReady, ...fallback].slice(0, Math.max(1, Number(limit) || 1));
}

export async function discoverCompanySourceCandidates({
  company,
  apiKey = process.env.SERPER_API_KEY,
  perQuery = 10,
  maxQueries = 3,
  location = 'UK'
} = {}) {
  if (!company?.companyId || !company?.companyName) throw new Error('companyId and companyName are required');

  const queries = buildCompanySourceQueries({
    companyName: company.companyName,
    website: company.website,
    careersUrl: company.careersUrl,
    location
  }).slice(0, Math.max(1, Number(maxQueries) || 1));
  const responses = [];
  for (const query of queries) {
    responses.push(await searchJobsWithSerper({ query, apiKey, num: perQuery }));
  }

  return {
    companyId: String(company.companyId),
    companyName: company.companyName,
    queries,
    candidates: rankSourceCandidates({ company, results: responses.flatMap(response => response.results) })
  };
}

export async function verifySourceReachability(url, { timeoutMs = 8000 } = {}) {
  try {
    const response = await axios.get(url, {
      timeout: timeoutMs,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: { 'User-Agent': 'JobMatchPortal/1.0 source verification' }
    });
    return {
      ok: response.status >= 200 && response.status < 400,
      httpStatus: response.status,
      finalUrl: response.request?.res?.responseUrl || url
    };
  } catch (error) {
    return { ok: false, httpStatus: null, finalUrl: url, error: error.message };
  }
}

export function selectBestSource(candidates = []) {
  return candidates.find(candidate => candidate.ats) || candidates[0] || null;
}
