const BASE_URL = 'https://www.jobs.ac.uk/search/';
const USER_AGENT = 'JobMatchPortal/1.0 (+https://github.com/mittalraghav45/jobmatchportal)';
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export const JOBS_AC_UK_DISCIPLINES = [
  { label: 'Computer Sciences', value: 'computer-sciences', subdisciplines: [
    { label: 'Artificial Intelligence', value: 'artificial-intelligence' },
    { label: 'Computer Science', value: 'computer-science' },
    { label: 'Cyber Security', value: 'cyber-security' },
    { label: 'Information Systems', value: 'information-systems' },
    { label: 'Software Engineering', value: 'software-engineering' },
  ]},
  { label: 'Engineering & Technology', value: 'engineering-and-technology', subdisciplines: [
    { label: 'Electrical & Electronic Engineering', value: 'electrical-and-electronic-engineering' },
    { label: 'Other Engineering', value: 'other-engineering' },
  ]},
];

function decodeHtml(value = '') {
  return String(value).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c))).replace(/&#x([0-9a-f]+);/gi, (_, c) => String.fromCharCode(parseInt(c, 16)));
}
function cleanText(value = '') { return decodeHtml(String(value).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:div|li|article|section|p|h[1-6]|dt|dd|tr)>/gi, '\n').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function textLines(value = '') { return decodeHtml(String(value).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:div|li|article|section|p|h[1-6]|dt|dd|tr)>/gi, '\n').replace(/<[^>]*>/g, ' ')).split(/\n+/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean); }
function absoluteUrl(href) { try { return href ? new URL(href, BASE_URL).href : ''; } catch { return ''; } }
function isJobUrl(url) { return /jobs\.ac\.uk\/(?:job|vacancy)\//i.test(url); }
function findMatchingTagEnd(html, start, tag) { const p = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'); p.lastIndex = start; let depth = 1, m; while ((m = p.exec(html))) { if (/^<\//.test(m[0])) { if (--depth === 0) return m.index + m[0].length; } else if (!/\/\s*>$/.test(m[0])) depth++; } return -1; }
function findCardHtml(html, anchorIndex, anchorEnd) { const start = Math.max(0, anchorIndex - 12000); const prefix = html.slice(start, anchorIndex); const candidates = []; const p = /<(article|li|div)\b([^>]*)>/gi; let m; while ((m = p.exec(prefix))) { if (!/(?:class|id)\s*=\s*["'][^"']*(?:job|result|listing|vacancy|card)[^"']*["']/i.test(m[2] || '')) continue; candidates.push({ tag: m[1].toLowerCase(), start: start + m.index, openEnd: start + p.lastIndex }); } for (let i = candidates.length - 1; i >= 0; i--) { const c = candidates[i]; const end = findMatchingTagEnd(html, c.openEnd, c.tag); if (c.openEnd <= anchorIndex && end > anchorEnd) return html.slice(c.start, end); } return ''; }

function parseListingFields(cardHtml, title) {
  const lines = textLines(cardHtml);
  const ti = lines.findIndex(x => x === title);
  const w = ti >= 0 ? lines.slice(ti + 1) : lines;
  const li = w.findIndex(x => /^location\s*:/i.test(x));
  const si = w.findIndex(x => /^salary\s*:/i.test(x));
  const pi = w.findIndex(x => /^(?:date placed|placed on)\s*:/i.test(x));
  const ci = w.findIndex(x => /^(?:closes|closing date|expires)\s*:?/i.test(x));
  const metadataEnd = [li, si, pi, ci].filter(index => index >= 0).sort((a, b) => a - b)[0] ?? w.length;
  const metadata = w.slice(0, metadataEnd).filter(x => !/^save$/i.test(x) && !/^apply$/i.test(x));

  // jobs.ac.uk search cards normally expose department followed by employer.
  // Keep the extraction positional and bounded by the first metadata field so
  // neighbouring listings can never leak into this record.
  let companyName = '';
  let department = '';
  if (metadata.length >= 2) {
    companyName = metadata.at(-1) || '';
    department = metadata.at(-2) || '';
  } else if (metadata.length === 1) {
    companyName = metadata[0];
  }

  if (companyName.includes(' - ')) {
    const parts = companyName.split(' - ');
    companyName = parts.shift().trim();
    department = parts.join(' - ').trim() || department;
  }

  return {
    companyName,
    department,
    location: li >= 0 ? w[li].replace(/^location\s*:\s*/i, '').trim() : '',
    salary: si >= 0 ? w[si].replace(/^salary\s*:\s*/i, '').trim() : '',
    posted: pi >= 0 ? w[pi].replace(/^(?:date placed|placed on)\s*:\s*/i, '').trim() : '',
    closing: ci >= 0 ? w[ci].replace(/^(?:closes|closing date|expires)\s*:?\s*/i, '').trim() : '',
  };
}

export function parseJobsAcUkHtml(html = '') { const jobs = [], seen = new Set(); const p = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi; let m; while ((m = p.exec(html))) { const url = absoluteUrl(m[1]); if (!isJobUrl(url) || seen.has(url)) continue; const title = cleanText(m[2]); if (!title || title.length > 300) continue; const cardHtml = findCardHtml(html, m.index, p.lastIndex); const fields = parseListingFields(cardHtml || html.slice(m.index, Math.min(html.length, p.lastIndex + 5000)), title); seen.add(url); jobs.push({ id: `jobs-ac-uk-${Buffer.from(url).toString('base64url').slice(0, 32)}`, externalId: url, title, companyName: fields.companyName, department: fields.department, location: fields.location || 'UK', description: '', url, posting_date: fields.posted || null, closing_date: fields.closing || null, salary: fields.salary || '', ats: 'jobs-ac-uk', source_verified: true, source: 'jobs.ac.uk' }); } return jobs; }

export function buildJobsAcUkSearchUrl({ keywords = '', location = '', discipline = 'computer-sciences', subDiscipline = '', page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) { const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE)); const currentPage = Math.max(1, Number.parseInt(page, 10) || 1); const params = new URLSearchParams(); if (keywords.trim()) params.set('keywords', keywords.trim()); if (location.trim()) params.set('location', location.trim()); if (discipline) params.append('academicDisciplineFacet[0]', discipline); if (subDiscipline) params.append('subDisciplineFacet[0]', subDiscipline); params.set('pageSize', String(size)); params.set('sortOrder', '1'); params.set('startIndex', String((currentPage - 1) * size + 1)); return `${BASE_URL}?${params.toString()}`; }

export async function searchJobsAcUk({ keywords = '', location = '', discipline = 'computer-sciences', subDiscipline = '', page = 1, pageSize = DEFAULT_PAGE_SIZE, timeoutMs = 15000 } = {}) { const url = buildJobsAcUkSearchUrl({ keywords, location, discipline, subDiscipline, page, pageSize }); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs); try { const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' } }); if (!response.ok) throw new Error(`jobs.ac.uk returned HTTP ${response.status}`); const html = await response.text(); const jobs = parseJobsAcUkHtml(html); const countMatch = cleanText(html).match(/([\d,]+)\s+Jobs? Found/i); return { source: 'jobs.ac.uk', searchUrl: url, keywords: keywords.trim(), location: location.trim(), discipline, subDiscipline, page: Math.max(1, Number.parseInt(page, 10) || 1), pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE)), totalFound: countMatch ? Number(countMatch[1].replace(/,/g, '')) : null, jobs }; } finally { clearTimeout(timeout); } }
