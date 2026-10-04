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

export { DEFAULT_QUERIES, SERPER_ENDPOINT };
