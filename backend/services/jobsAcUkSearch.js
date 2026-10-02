const BASE_URL = 'https://www.jobs.ac.uk/search/';
const USER_AGENT = 'JobMatchPortal/1.0 (+https://github.com/mittalraghav45/jobmatchportal)';
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function cleanText(value = '') {
  return decodeHtml(String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function absoluteUrl(href) {
  if (!href) return '';
  try { return new URL(href, BASE_URL).href; } catch { return ''; }
}

function isJobUrl(url) {
  return /jobs\.ac\.uk\/job\//i.test(url) || /jobs\.ac\.uk\/vacancy\//i.test(url);
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }
  return '';
}

function parseJobCards(html) {
  const jobs = [];
  const seen = new Set();
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(html))) {
    const url = absoluteUrl(match[1]);
    if (!isJobUrl(url) || seen.has(url)) continue;

    const title = cleanText(match[2]);
    if (!title || title.length < 2 || title.length > 300) continue;

    const start = Math.max(0, match.index - 3000);
    const end = Math.min(html.length, linkPattern.lastIndex + 5000);
    const card = cleanText(html.slice(start, end));

    const employer = firstMatch(card, [
      /(?:employer|organisation|organization|company)\s*:?\s*([^|•]+?)(?=\s+(?:location|salary|date placed|closes|expires)\b|$)/i
    ]);
    const location = firstMatch(card, [
      /(?:location)\s*:?\s*([^|•]+?)(?=\s+(?:salary|date placed|closes|expires)\b|$)/i
    ]);
    const salary = firstMatch(card, [
      /(?:salary)\s*:?\s*([^|•]+?)(?=\s+(?:date placed|closes|expires)\b|$)/i
    ]);
    const posted = firstMatch(card, [
      /(?:date placed|placed on)\s*:?\s*([^|•]+?)(?=\s+(?:closes|expires)\b|$)/i
    ]);
    const closing = firstMatch(card, [
      /(?:closes|expires)\s*:?\s*([^|•]+?)(?=\s+(?:save|$))/i
    ]);

    seen.add(url);
    jobs.push({
      id: `jobs-ac-uk-${Buffer.from(url).toString('base64url').slice(0, 32)}`,
      externalId: url,
      title,
      companyName: employer,
      location: location || 'UK',
      description: card.slice(0, 12000),
      url,
      posting_date: posted || null,
      closing_date: closing || null,
      salary: salary || '',
      ats: 'jobs-ac-uk',
      source_verified: true,
      source: 'jobs.ac.uk'
    });
  }

  return jobs;
}

export function buildJobsAcUkSearchUrl({ keywords = '', location = '', page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE));
  const params = new URLSearchParams();
  if (keywords) params.set('keywords', String(keywords).trim());
  if (location) params.set('location', String(location).trim());
  params.set('pageSize', String(safePageSize));
  params.set('sortOrder', '1');
  params.set('startIndex', String((safePage - 1) * safePageSize + 1));
  return `${BASE_URL}?${params.toString()}`;
}

export async function searchJobsAcUk({ keywords = '', location = '', page = 1, pageSize = DEFAULT_PAGE_SIZE, timeoutMs = 15000 } = {}) {
  const url = buildJobsAcUkSearchUrl({ keywords, location, page, pageSize });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml'
      }
    });

    if (!response.ok) {
      throw new Error(`jobs.ac.uk returned HTTP ${response.status}`);
    }

    const html = await response.text();
    const jobs = parseJobCards(html);
    const countMatch = cleanText(html).match(/([\d,]+)\s+Jobs? Found/i);

    return {
      source: 'jobs.ac.uk',
      searchUrl: url,
      keywords: String(keywords || '').trim(),
      location: String(location || '').trim(),
      page: Math.max(1, Number.parseInt(page, 10) || 1),
      pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE)),
      totalFound: countMatch ? Number(countMatch[1].replace(/,/g, '')) : null,
      jobs
    };
  } finally {
    clearTimeout(timeout);
  }
}
