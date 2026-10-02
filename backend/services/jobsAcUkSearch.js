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

function textLines(value = '') {
  return decodeHtml(String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|li|article|section|p|h[1-6]|dt|dd|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, ' '))
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function absoluteUrl(href) {
  if (!href) return '';
  try { return new URL(href, BASE_URL).href; } catch { return ''; }
}

function isJobUrl(url) {
  return /jobs\.ac\.uk\/job\//i.test(url) || /jobs\.ac\.uk\/vacancy\//i.test(url);
}

function findMatchingTagEnd(html, start, tag) {
  const tokenPattern = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  tokenPattern.lastIndex = start;
  let depth = 1;
  let match;

  while ((match = tokenPattern.exec(html))) {
    const token = match[0];
    if (/^<\//.test(token)) {
      depth -= 1;
      if (depth === 0) return match.index + token.length;
    } else if (!/\/\s*>$/.test(token)) {
      depth += 1;
    }
  }

  return -1;
}

function findCardHtml(html, anchorIndex, anchorEnd) {
  const prefixStart = Math.max(0, anchorIndex - 12000);
  const prefix = html.slice(prefixStart, anchorIndex);
  const candidates = [];
  const openingTagPattern = /<(article|li|div)\b([^>]*)>/gi;
  let match;

  while ((match = openingTagPattern.exec(prefix))) {
    const attrs = match[2] || '';
    if (!/(?:class|id)\s*=\s*["'][^"']*(?:job|result|listing|vacancy|card)[^"']*["']/i.test(attrs)) continue;
    candidates.push({
      tag: match[1].toLowerCase(),
      start: prefixStart + match.index,
      openEnd: prefixStart + openingTagPattern.lastIndex
    });
  }

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const candidate = candidates[i];
    if (candidate.openEnd > anchorIndex) continue;
    const end = findMatchingTagEnd(html, candidate.openEnd, candidate.tag);
    if (end <= anchorEnd) continue;
    return html.slice(candidate.start, end);
  }

  return '';
}

function parseListingFields(cardHtml, title) {
  const lines = textLines(cardHtml);
  const titleIndex = lines.findIndex(line => line === title);
  const workingLines = titleIndex >= 0 ? lines.slice(titleIndex) : lines;
  const locationIndex = workingLines.findIndex(line => /^location\s*:/i.test(line));
  const salaryIndex = workingLines.findIndex(line => /^salary\s*:/i.test(line));
  const postedIndex = workingLines.findIndex(line => /^(?:date placed|placed on)\s*:/i.test(line));
  const closingIndex = workingLines.findIndex(line => /^(?:closes|closing date|expires)\s*:?/i.test(line));

  const beforeLocation = locationIndex > 0 ? workingLines.slice(1, locationIndex) : [];
  const metadata = beforeLocation.filter(line => !/^save$/i.test(line));
  let companyName = metadata.at(-1) || '';
  let department = metadata.at(-2) || '';

  if (companyName.includes(' - ')) {
    const [company, ...departmentParts] = companyName.split(' - ');
    companyName = company.trim();
    department = departmentParts.join(' - ').trim() || department;
  }

  const location = locationIndex >= 0
    ? workingLines[locationIndex].replace(/^location\s*:\s*/i, '').trim()
    : '';
  const salary = salaryIndex >= 0
    ? workingLines[salaryIndex].replace(/^salary\s*:\s*/i, '').trim()
    : '';
  const posted = postedIndex >= 0
    ? workingLines[postedIndex].replace(/^(?:date placed|placed on)\s*:\s*/i, '').trim()
    : '';
  const closing = closingIndex >= 0
    ? workingLines[closingIndex].replace(/^(?:closes|closing date|expires)\s*:?\s*/i, '').trim()
    : '';

  return { companyName, department, location, salary, posted, closing };
}

export function parseJobsAcUkHtml(html = '') {
  const jobs = [];
  const seen = new Set();
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(html))) {
    const url = absoluteUrl(match[1]);
    if (!isJobUrl(url) || seen.has(url)) continue;

    const title = cleanText(match[2]);
    if (!title || title.length < 2 || title.length > 300) continue;

    const anchorStart = match.index;
    const anchorEnd = linkPattern.lastIndex;
    const cardHtml = findCardHtml(html, anchorStart, anchorEnd);
    const fallbackStart = Math.max(0, anchorStart);
    const fallbackEnd = Math.min(html.length, anchorEnd + 5000);
    const sourceHtml = cardHtml || html.slice(fallbackStart, fallbackEnd);
    const fields = parseListingFields(sourceHtml, title);

    seen.add(url);
    jobs.push({
      id: `jobs-ac-uk-${Buffer.from(url).toString('base64url').slice(0, 32)}`,
      externalId: url,
      title,
      companyName: fields.companyName,
      department: fields.department,
      location: fields.location || 'UK',
      description: '',
      url,
      posting_date: fields.posted || null,
      closing_date: fields.closing || null,
      salary: fields.salary || '',
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

    if (!response.ok) throw new Error(`jobs.ac.uk returned HTTP ${response.status}`);

    const html = await response.text();
    const jobs = parseJobsAcUkHtml(html);
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
