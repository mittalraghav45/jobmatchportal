import { ingestJobs } from './services/jobIngestion.js';

// liveJobsScraper_new.js - ATS job discovery and live-status normalisation

function isTechJob(title) {
  return /react|node|typescript|javascript|python|java|software|engineer|full.?stack|frontend|backend|web|developer|devops|data|cloud/i.test(title || '');
}

function cleanText(value = '') { return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function validDate(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }

export async function fetchGreenhouse(slug) {
  try {
    const base = String(slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const tries = [...new Set([base, base.replace(/-/g, ''), base + 'technology', base.replace(/-?technology$/, ''), base + '-group'])].filter(Boolean);
    for (const s of tries) {
      const url = `https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`;
      const res = await fetch(url, { headers: { 'User-Agent': 'JobMatchPortal/1.0' } });
      if (!res.ok) continue;
      const data = await res.json();
      const jobs = (data.jobs || []).map(j => ({ id: `gh-${j.id}`, title: j.title, location: j.location?.name || 'UK', department: j.departments?.[0]?.name || '', description: cleanText(j.content).slice(0, 12000), url: j.absolute_url, posting_date: validDate(j.updated_at), closing_date: null, ats: 'greenhouse', isTech: isTechJob(j.title), source_verified: true }));
      if (jobs.length) return jobs;
    }
    return [];
  } catch { return []; }
}

export async function fetchLever(slug) {
  try {
    const tries = [...new Set([slug, String(slug || '').toLowerCase(), String(slug || '').replace(/[^a-z0-9]/gi, '-'), String(slug || '').replace(/[^a-z0-9]/gi, '')])];
    for (const s of tries) {
      const res = await fetch(`https://api.lever.co/v0/postings/${s}?mode=json`, { headers: { 'User-Agent': 'JobMatchPortal/1.0' } });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length) return data.map(j => ({ id: `lever-${j.id}`, title: j.text, location: j.categories?.location || 'UK', department: j.categories?.team || '', description: cleanText(j.descriptionPlain || j.description).slice(0, 12000), url: j.hostedUrl, posting_date: validDate(j.createdAt), closing_date: null, ats: 'lever', isTech: isTechJob(j.text), source_verified: true }));
    }
    return [];
  } catch { return []; }
}

export async function fetchAshby(slug) {
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, { headers: { 'User-Agent': 'JobMatchPortal/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || []).map(j => ({ id: `ashby-${j.id}`, title: j.title, location: j.location || 'UK', department: j.department || '', description: cleanText(j.descriptionHtml).slice(0, 12000), url: j.jobUrl, posting_date: validDate(j.publishedAt), closing_date: validDate(j.closeDate || j.closingDate), ats: 'ashby', isTech: isTechJob(j.title), source_verified: true }));
  } catch { return []; }
}

export async function fetchWorkday(companyUrl, slug) {
  try {
    if (!companyUrl || !/myworkdayjobs\.com/i.test(companyUrl)) return [];
    const match = companyUrl.match(/https?:\/\/([^.]+)\.wd\d+\.myworkdayjobs\.com\/([^\/]+)/i) || companyUrl.match(/https?:\/\/([^.]+)\.myworkdayjobs\.com\/([^\/]+)/i);
    if (!match) return [];
    const tenant = match[1]; const site = match[2] || 'Careers';
    const apiUrl = `https://${tenant}.wd3.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
    const res = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'JobMatchPortal/1.0' }, body: JSON.stringify({ appliedFacets: {}, limit: 100, offset: 0, searchText: '' }) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobPostings || []).map(j => ({ id: `wd-${j.jobPostingId || j.externalPath || j.title}`, title: j.title, location: j.bulletFields?.find(v => /uk|london|belfast|manchester|southampton|bristol|edinburgh|glasgow|remote/i.test(v)) || 'UK', description: cleanText(j.bulletFields?.join(' ')).slice(0, 12000), url: j.externalPath ? `https://${tenant}.myworkdayjobs.com/${site}${j.externalPath}` : companyUrl, posting_date: validDate(j.postedOn), closing_date: validDate(j.closeDate || j.closingDate), ats: 'workday', isTech: isTechJob(j.title), source_verified: true }));
  } catch { return []; }
}

export async function fetchSmartRecruiters(slug) {
  try {
    const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`, { headers: { 'User-Agent': 'JobMatchPortal/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.content || []).map(j => ({ id: `sr-${j.id}`, title: j.name || j.title, location: j.location?.city || 'UK', department: j.department?.label || '', description: cleanText(j.jobAd?.sections?.jobDescription?.text || j.jobAd?.sections?.qualifications?.text || '').slice(0, 12000), url: j.ref || j.applyUrl, posting_date: validDate(j.releasedDate), closing_date: validDate(j.expirationDate), ats: 'smartrecruiters', isTech: isTechJob(j.name || j.title), source_verified: true }));
  } catch { return []; }
}

export async function fetchWorkable(slug) {
  try {
    for (const s of [slug, String(slug || '').toLowerCase()]) {
      const res = await fetch(`https://${s}.workable.com/api/v3/accounts/${s}/jobs?details=true`, { headers: { 'User-Agent': 'JobMatchPortal/1.0' } });
      if (!res.ok) continue;
      const data = await res.json();
      const jobs = (data.jobs || data.results || []).map(j => ({ id: `wb-${j.shortcode || j.id}`, title: j.title, location: j.location?.city || j.city || 'UK', description: cleanText(j.description).slice(0, 12000), url: j.url || `https://${s}.workable.com/j/${j.shortcode}`, posting_date: validDate(j.published_on || j.created_at), closing_date: validDate(j.close_date), ats: 'workable', isTech: isTechJob(j.title), source_verified: true }));
      if (jobs.length) return jobs;
    }
    return [];
  } catch { return []; }
}

export async function fetchTeamtailor(slug) {
  try {
    const res = await fetch(`https://${slug}.teamtailor.com/jobs`, { headers: { 'User-Agent': 'JobMatchPortal/1.0', Accept: 'text/html' } });
    if (!res.ok) return [];
    const text = await res.text(); const jobs = []; const regex = /href=["']([^"']*\/jobs\/[^"']+)["'][^>]*>([^<]{2,150})</gi; let match;
    while ((match = regex.exec(text)) && jobs.length < 100) jobs.push({ id: `tt-${match[1]}`, title: cleanText(match[2]), location: 'UK', department: '', description: '', url: new URL(match[1], `https://${slug}.teamtailor.com`).href, posting_date: null, closing_date: null, ats: 'teamtailor', isTech: isTechJob(match[2]), source_verified: true });
    return jobs;
  } catch { return []; }
}

export async function fetchPinpoint(slug) {
  try {
    const res = await fetch(`https://${slug}.pinpointhq.com/en/postings.json`, { headers: { 'User-Agent': 'JobMatchPortal/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map(j => ({ id: `pp-${j.id}`, title: j.title, location: j.location || 'UK', department: j.department || '', description: cleanText(j.description).slice(0, 12000), url: j.url || `https://${slug}.pinpointhq.com/postings/${j.id}`, posting_date: validDate(j.created_at), closing_date: validDate(j.close_date), ats: 'pinpoint', isTech: isTechJob(j.title), source_verified: true }));
  } catch { return []; }
}

export async function fetchRecruitee(slug) {
  try {
    const res = await fetch(`https://${slug}.recruitee.com/api/offers`, { headers: { 'User-Agent': 'JobMatchPortal/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.offers || []).map(j => ({ id: `rc-${j.id}`, title: j.title, location: j.location || 'UK', department: j.department || '', description: cleanText(j.description).slice(0, 12000), url: j.careers_url || `https://${slug}.recruitee.com/o/${j.slug}`, posting_date: validDate(j.created_at), closing_date: validDate(j.close_date), ats: 'recruitee', isTech: isTechJob(j.title), source_verified: true }));
  } catch { return []; }
}

export async function fetchBambooHR(slug) {
  try {
    const res = await fetch(`https://${slug}.bamboohr.com/careers/list`, { headers: { 'User-Agent': 'JobMatchPortal/1.0', Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.result || []).map(j => ({ id: `bh-${j.id}`, title: j.jobOpeningName || j.title, location: j.location?.city || 'UK', department: j.department || '', description: cleanText(j.description).slice(0, 12000), url: j.jobOpeningUrl || `https://${slug}.bamboohr.com/jobs/view.php?id=${j.id}`, posting_date: validDate(j.datePosted), closing_date: validDate(j.closeDate), ats: 'bamboohr', isTech: isTechJob(j.jobOpeningName || j.title), source_verified: true }));
  } catch { return []; }
}

export async function fetchNHSJobs(companyName) {
  try {
    if (!/nhs|trust/i.test(companyName || '')) return [];
    const res = await fetch(`https://www.jobs.nhs.uk/api/v1/search?keyword=Software%20Engineer&employer=${encodeURIComponent(companyName || 'NHS')}`, { headers: { 'User-Agent': 'JobMatchPortal/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.vacancies || []).map(j => ({ id: `nhs-${j.id}`, title: j.title || 'Software Engineer', location: j.location || 'UK', department: 'Digital', description: cleanText(j.description).slice(0, 12000), url: `https://www.jobs.nhs.uk/candidate/jobadvert/${j.id}`, posting_date: validDate(j.posted), closing_date: validDate(j.closingDate || j.closing_date), ats: 'nhs', isTech: true, source_verified: true }));
  } catch { return []; }
}

export async function fetchAllATS(slug, companyName, careersUrl) {
  if (careersUrl && /google\.com\/search/i.test(careersUrl)) careersUrl = '';
  console.log(`fetchAllATS: slug=${slug}, company=${companyName}, careersUrl=${careersUrl || 'none'}`);
  const results = await Promise.allSettled([fetchGreenhouse(slug), fetchLever(slug), fetchAshby(slug), fetchWorkday(careersUrl, slug), fetchSmartRecruiters(slug), fetchWorkable(slug), fetchTeamtailor(slug), fetchPinpoint(slug), fetchRecruitee(slug), fetchBambooHR(slug), fetchNHSJobs(companyName)]);
  const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const seen = new Set();
  const sourceUnique = all.filter(j => { const key = j.url || `${j.ats}:${j.id}`; if (seen.has(key)) return false; seen.add(key); return true; });
  // Canonicalise at the scraper boundary so every existing consumer gets the same job identity contract.
  // Company identity is attached by the caller slug; this is deliberately kept here as a source field only.
  return ingestJobs(sourceUnique.map(j => ({ ...j, companyId: slug }))).jobs;
}

export function enrichWithDates(jobs) {
  const now = Date.now();
  return jobs.map(j => {
    const posting = validDate(j.posting_date || j.dates?.postedAt);
    const closing = validDate(j.closing_date || j.dates?.closingAt);
    const closingTime = closing ? new Date(closing).getTime() : null;
    const isLive = closingTime === null ? true : closingTime >= now;
    return { ...j, posting_date: posting, closing_date: closing, postingDate: posting, closingDate: closing, isLive, lastVerifiedAt: new Date(now).toISOString(), daysAgo: posting ? Math.max(0, Math.floor((now - new Date(posting).getTime()) / 86400000)) : null, daysUntilClose: closing ? Math.ceil((new Date(closing).getTime() - now) / 86400000) : null };
  });
}
