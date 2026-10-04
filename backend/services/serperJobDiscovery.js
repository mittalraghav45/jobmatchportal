import axios from 'axios';

const SERPER_ENDPOINT = 'https://google.serper.dev/search';

const DEFAULT_QUERIES = [
  'site:jobs.lever.co software engineer UK',
  'site:boards.greenhouse.io software engineer UK',
  'site:jobs.ashbyhq.com software engineer UK',
  'site:myworkdayjobs.com software engineer UK'
];

export function buildSerperQuery({ keyword = 'software engineer', location = 'UK', site = '' } = {}) {
  const terms = [keyword, location].filter(Boolean).join(' ');
  return site ? `site:${site} ${terms}` : terms;
}

export function normaliseSerperResults(data) {
  const organic = Array.isArray(data?.organic) ? data.organic : [];
  const seen = new Set();

  return organic.map((result) => {
    const url = String(result?.link || '').trim();
    if (!url || seen.has(url)) return null;
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) return null;
      seen.add(url);
      return {
        url,
        title: String(result?.title || '').trim(),
        snippet: String(result?.snippet || '').trim(),
        position: Number.isFinite(result?.position) ? result.position : null,
        source: 'serper'
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

export async function searchJobsWithSerper({
  query,
  apiKey = process.env.SERPER_API_KEY,
  gl = 'uk',
  hl = 'en',
  num = 10,
  timeoutMs = 10000
} = {}) {
  if (!apiKey) throw new Error('SERPER_API_KEY is required');
  if (!query) throw new Error('query is required');

  const response = await axios.post(
    SERPER_ENDPOINT,
    { q: query, gl, hl, num },
    {
      timeout: timeoutMs,
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      }
    }
  );

  return {
    query,
    results: normaliseSerperResults(response.data),
    source: 'serper'
  };
}

export async function discoverJobsWithSerper({
  keyword = 'software engineer',
  location = 'UK',
  sites = ['jobs.lever.co', 'boards.greenhouse.io', 'jobs.ashbyhq.com', 'myworkdayjobs.com'],
  apiKey = process.env.SERPER_API_KEY,
  perQuery = 10
} = {}) {
  const queries = sites.map(site => buildSerperQuery({ keyword, location, site }));
  const responses = [];

  for (const query of queries) {
    responses.push(await searchJobsWithSerper({ query, apiKey, num: perQuery }));
  }

  const seen = new Set();
  const results = responses.flatMap(response => response.results).filter(result => {
    if (seen.has(result.url)) return false;
    seen.add(result.url);
    return true;
  });

  return { queries, results, source: 'serper' };
}


const DEFAULT_ROLE_QUERY = 'software engineer software developer frontend developer full stack developer web developer jobs careers';
const DEFAULT_SERPER_SITES = [];

function significantCompanyTokens(companyName = '') {
  const ignored = new Set(['the', 'and', 'of', 'for', 'uk', 'ltd', 'limited', 'plc', 'llp', 'group', 'company', 'university', 'council', 'borough', 'city', 'nhs', 'trust']);
  return String(companyName).toLowerCase().match(/[a-z0-9]+/g)?.filter(token => token.length >= 4 && !ignored.has(token)) || [];
}

function extractHost(url = '') {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

function companyHostFromUrl(url = '') {
  const host = extractHost(url);
  return host && !/^(?:google|bing|search\.)/i.test(host) ? host : '';
}

export function isLikelyJobPostingUrl(url = '', careerHost = '') {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.toLowerCase();
    const atsHosts = ['jobs.lever.co', 'boards.greenhouse.io', 'job-boards.greenhouse.io', 'jobs.ashbyhq.com'];
    const atsJob = atsHosts.includes(host) && path.split('/').filter(Boolean).length >= 2;
    const workdayJob = host.endsWith('.myworkdayjobs.com') && path.includes('/job/');
    const pathSegments = path.split('/').filter(Boolean);
    const jobPathMarkers = new Set(['job', 'jobs', 'career', 'careers', 'vacancy', 'vacancies', 'position', 'positions', 'opening', 'openings', 'opportunity', 'opportunities', 'role', 'roles']);
    const genericJobPath = pathSegments.length >= 2 && pathSegments.slice(0, -1).some(segment => jobPathMarkers.has(segment));
    const sameCareerHost = careerHost && host === careerHost
      && /(?:job|career|vacanc|position|opening|opportunit|role)/i.test(path)
      && path.split('/').filter(Boolean).length >= 2;
    return Boolean(atsJob || workdayJob || genericJobPath || sameCareerHost);
  } catch {
    return false;
  }
}

export function buildCompanySerperQueries({
  companyName = '',
  location = 'UK',
  keyword = DEFAULT_ROLE_QUERY,
  sites = DEFAULT_SERPER_SITES,
  careersUrl = ''
} = {}) {
  const company = String(companyName).trim();
  if (!company) return [];

  const queries = [
    `"${company}" ${keyword} ${location}`
  ];

  const careerHost = companyHostFromUrl(careersUrl);
  if (careerHost) queries.push(`site:${careerHost} "${company}" software engineer ${location}`);

  for (const site of sites || []) {
    if (site) queries.push(`site:${site} "${company}" software engineer ${location}`);
  }

  return [...new Set(queries)];
}

export async function discoverCompanyJobsWithSerper({
  companyId,
  companyName,
  location = 'UK',
  keyword = DEFAULT_ROLE_QUERY,
  sites = DEFAULT_SERPER_SITES,
  careersUrl = '',
  apiKey = process.env.SERPER_API_KEY,
  perQuery = 10
} = {}) {
  if (!companyId) throw new Error('companyId is required');
  if (!companyName) throw new Error('companyName is required');

  const queries = buildCompanySerperQueries({ companyName, location, keyword, sites, careersUrl });
  const responses = [];

  for (const query of queries) {
    responses.push(await searchJobsWithSerper({ query, apiKey, num: perQuery }));
  }

  const careerHost = companyHostFromUrl(careersUrl);
  const seen = new Set();
  const results = responses
    .flatMap(response => response.results)
    .filter(result => isLikelyJobPostingUrl(result.url, careerHost) && !seen.has(result.url))
    .filter(result => {
      const tokens = significantCompanyTokens(companyName);
      if (!tokens.length) return true;
      const haystack = `${result.title || ''} ${result.snippet || ''} ${result.url || ''}`.toLowerCase();
      return tokens.some(token => haystack.includes(token));
    })
    .filter(result => {
      if (seen.has(result.url)) return false;
      seen.add(result.url);
      return true;
    });

  return {
    companyId: String(companyId),
    companyName: String(companyName),
    queries,
    results: results.map(result => ({
      ...result,
      companyId: String(companyId),
      companyName: String(companyName),
      title: result.title || 'Job opening',
      description: result.snippet || '',
      location,
      externalId: result.url,
      source: { ats: 'serper', url: result.url },
      applyUrl: result.url
    })),
    source: 'serper'
  };
}

export { DEFAULT_QUERIES, SERPER_ENDPOINT };
