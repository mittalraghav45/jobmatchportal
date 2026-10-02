const ATS_HOSTS = new Set([
  'boards.greenhouse.io', 'job-boards.greenhouse.io', 'jobs.lever.co', 'jobs.ashbyhq.com',
  'myworkdayjobs.com', 'apply.workable.com', 'jobs.jobvite.com', 'smartrecruiters.com',
  'careers.smartrecruiters.com', 'applytojob.com', 'hibob.com'
]);

const CAREER_HINTS = /\b(careers?|jobs?|vacancies|opportunities|join[- ]us|work[- ]with[- ]us)\b/i;
const JOB_HINTS = /\b(job|jobs|vacancy|vacancies|position|opening|opportunity|apply)\b/i;

function looksLikeAtsJobPath(host, pathname) {
  const path = pathname.replace(/^\/+|\/+$/g, '');
  if (!path) return false;
  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') return /\/jobs?\/\d+(?:\/|$)/i.test(`/${path}`);
  if (host === 'jobs.lever.co') return path.split('/').length >= 2;
  if (host === 'jobs.ashbyhq.com') return path.split('/').length >= 2;
  if (host === 'apply.workable.com') return /\/[^/]+\/j\//i.test(`/${path}`) || path.split('/').length >= 2;
  if (host === 'jobs.jobvite.com') return path.split('/').length >= 2;
  if (host === 'smartrecruiters.com' || host === 'careers.smartrecruiters.com') return /\/[^/]+\/job\//i.test(`/${path}`);
  if (host === 'applytojob.com') return path.split('/').length >= 2;
  if (host === 'myworkdayjobs.com') return /\/[^/]+\/job\//i.test(`/${path}`);
  if (host === 'hibob.com') return /\/[^/]+\/[^/]+/i.test(`/${path}`);
  return false;
}

export function normaliseUrl(value, baseUrl = '') {
  try {
    const url = new URL(value, baseUrl || undefined);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = '';
    return url.toString();
  } catch { return null; }
}

export function isAllowedHttpUrl(url) {
  try { return /^https?:$/.test(new URL(url).protocol); } catch { return false; }
}

export function classifyDiscoveredUrl(url, companyHost = '') {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = `${u.pathname} ${u.search}`;
    const sameCompany = !companyHost || host === companyHost.replace(/^www\./, '').toLowerCase() || host.endsWith(`.${companyHost.replace(/^www\./, '').toLowerCase()}`);
    const ats = ATS_HOSTS.has(host) || [...ATS_HOSTS].some(h => host.endsWith(`.${h}`));
    if (ats && (JOB_HINTS.test(path) || looksLikeAtsJobPath(host, u.pathname))) return 'ats_job';
    if (sameCompany && JOB_HINTS.test(path) && CAREER_HINTS.test(path)) return 'job';
    if (sameCompany && CAREER_HINTS.test(path)) return 'careers';
    if (ats) return 'ats_board';
    return 'other';
  } catch { return 'other'; }
}

export function extractLinks(html, baseUrl, companyHost = '') {
  const links = [];
  const seen = new Set();
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html))) {
    const url = normaliseUrl(match[1], baseUrl);
    if (!url || seen.has(url)) continue;
    const text = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const kind = classifyDiscoveredUrl(url, companyHost);
    if (kind !== 'other' || JOB_HINTS.test(text) || CAREER_HINTS.test(text)) {
      seen.add(url);
      links.push({ url, text, kind });
    }
  }
  return links;
}

export function extractJobPostingJsonLd(html) {
  const jobs = [];
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const raw = script.replace(/^.*?>/, '').replace(/<\/script>\s*$/i, '').trim();
    try {
      const data = JSON.parse(raw);
      const values = Array.isArray(data) ? data : Array.isArray(data?.['@graph']) ? data['@graph'] : [data];
      for (const item of values) {
        if (item && (item['@type'] === 'JobPosting' || (Array.isArray(item['@type']) && item['@type'].includes('JobPosting')))) jobs.push(item);
      }
    } catch { /* malformed JSON-LD is ignored */ }
  }
  return jobs;
}

export function buildGoogleQuery(companyName, employerType = '') {
  const suffix = employerType === 'nhs' ? ' NHS UK jobs careers' : employerType === 'universities' ? ' university UK jobs careers' : employerType === 'councils' ? ' council UK jobs careers' : ' UK jobs careers';
  return `"${companyName}"${suffix}`;
}

export function buildGoogleSearchUrl(companyName, employerType = '') {
  return `https://www.google.com/search?q=${encodeURIComponent(buildGoogleQuery(companyName, employerType))}`;
}

export function chooseCrawlTargets(links, limit = 5) {
  const rank = { ats_job: 0, job: 1, careers: 2, ats_board: 3, other: 9 };
  return [...links].sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9)).slice(0, limit);
}

export function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

export { CAREER_HINTS, JOB_HINTS, ATS_HOSTS };
