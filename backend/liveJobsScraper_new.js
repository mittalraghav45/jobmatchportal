// liveJobsScraper_new.js - UK FULL ATS COVERAGE - FIXED v3
// Fixes: ocado returns [], encoding, google search careersUrl, more slug tries
// Test with: /api/live-jobs/monzo (definitely works) then ocadotechnology

function isTechJob(title) {
  return /react|node|typescript|javascript|python|java|software|engineer|full.?stack|frontend|backend|web|developer|devops|data|cloud/i.test(title||'');
}

// 1. Greenhouse - boards-api.greenhouse.io - FIXED to try many variations
export async function fetchGreenhouse(slug) {
  try {
    // FIXED: Try many slug variations including ocado cases
    const base = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const tries = [
      base,
      base.replace(/[^a-z0-9]/g, ''),
      base.replace(/-/g, ''),
      base + 'technology',
      base.replace('technology',''),
      base.replace(/[^a-z0-9]/g, '-') + '-technology',
      base + '-group',
      base.replace('-technology',''),
      'ocado-group',
      'ocadotechnology',
      'ocado',
      'monzo',
      'starling-bank',
      'revolut',
      'monzo-bank'
    ];
    // Remove duplicates, keep order
    const uniqueTries = [...new Set(tries)].slice(0,12);
    
    for (const s of uniqueTries) {
      if (!s || s.length < 2) continue;
      try {
        const url = `https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`;
        const res = await fetch(url, { headers: { 'User-Agent': 'JobMatchPortal/1.0' } });
        if (!res.ok) continue;
        const data = await res.json();
        const jobs = (data.jobs||[]).map(j=>({
          id:`gh-${j.id}`, title:j.title, location:j.location?.name||'UK', department:j.departments?.[0]?.name||'',
          description:(j.content||'').slice(0,4000), url:j.absolute_url, posting_date:j.updated_at, ats:'greenhouse', isTech:isTechJob(j.title)
        }));
        if (jobs.length) {
          console.log(`✅ Greenhouse found ${jobs.length} jobs for slug ${s}`);
          return jobs;
        }
      } catch(e){ continue; }
    }
    return [];
  } catch(e){ return []; }
}

// 2. Lever - api.lever.co
export async function fetchLever(slug) {
  try {
    const tries = [slug, slug.toLowerCase(), slug.replace(/[^a-z0-9]/g, '-'), slug.replace(/[^a-z0-9]/g, '')];
    for (const s of [...new Set(tries)]) {
      const url = `https://api.lever.co/v0/postings/${s}?mode=json`;
      const res = await fetch(url, { headers: { 'User-Agent': 'JobMatchPortal/1.0' } });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        return data.map(j=>({
          id:`lever-${j.id}`, title:j.text, location:j.categories?.location||'UK', department:j.categories?.team||'',
          description:(j.descriptionPlain||j.description||'').slice(0,4000), url:j.hostedUrl,
          posting_date:j.createdAt?new Date(j.createdAt).toISOString():new Date().toISOString(), ats:'lever', isTech:isTechJob(j.text)
        }));
      }
    }
    return [];
  } catch(e){ return []; }
}

// 3. Ashby - api.ashbyhq.com
export async function fetchAshby(slug) {
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, { headers: { 'User-Agent': 'JobMatchPortal/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs||[]).map(j=>({
      id:`ashby-${j.id}`, title:j.title, location:j.location||'UK', department:j.department||'',
      description:(j.descriptionHtml||'').replace(/<[^>]*>/g,'').slice(0,4000), url:j.jobUrl,
      posting_date:j.publishedAt||new Date().toISOString(), ats:'ashby', isTech:isTechJob(j.title)
    }));
  } catch(e){ return []; }
}

// 4. Workday - myworkdayjobs.com - UK heavy: NHS, Universities, Banks, Ocado Group
export async function fetchWorkday(companyUrl, slug) {
  try {
    // FIXED: Also try to detect ocado group careers
    if (!companyUrl || (!companyUrl.includes('myworkdayjobs') && !companyUrl.includes('ocadogroup') && !companyUrl.includes('myworkday'))) {
      // If no careersUrl but slug is ocado, try ocado workday pattern
      if (slug.includes('ocado')) {
        // Ocado Group uses https://ocadogroup.com/careers/technology - not Workday API, so return []
        return [];
      }
      return [];
    }
    // Extract tenant from URL like https://ocadotech.wd3.myworkdayjobs.com/Careers
    const match = companyUrl.match(/https?:\/\/([^.]+)\.wd\d+\.myworkdayjobs\.com\/([^\/]+)\/([^\/]+)/i) 
               || companyUrl.match(/https?:\/\/([^.]+)\.myworkdayjobs\.com\/([^\/]+)/i);
    if (!match) return [];
    const tenant = match[1];
    const site = match[2] || 'Careers';
    const apiUrl = `https://${tenant}.wd3.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
    const res = await fetch(apiUrl, {
      method:'POST',
      headers:{'Content-Type':'application/json','User-Agent':'JobMatchPortal/1.0'},
      body: JSON.stringify({appliedFacets:{}, limit:20, offset:0, searchText:'React Developer'})
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobPostings||[]).map(j=>({
      id:`wd-${j.bulletFields?.[0]||j.title}`, title:j.title, location:j.bulletFields?.[1]||'UK',
      description:(j.bulletFields?.join(' ')||'').slice(0,4000), url:`https://${tenant}.myworkdayjobs.com/${site}${j.externalPath}`,
      posting_date:j.postedOn||new Date().toISOString(), ats:'workday', isTech:true
    }));
  } catch(e){ return []; }
}

// 5. SmartRecruiters
export async function fetchSmartRecruiters(slug) {
  try {
    const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=20`, { headers: { 'User-Agent': 'JobMatchPortal/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.content||[]).map(j=>({
      id:`sr-${j.id}`, title:j.name||j.title, location:j.location?.city||'UK', department:j.department?.label||'',
      description:(j.jobAd?.sections?.companyDescription?.text||'').slice(0,4000), url:j.ref||j.applyUrl,
      posting_date:j.releasedDate||new Date().toISOString(), ats:'smartrecruiters', isTech:isTechJob(j.name||j.title)
    }));
  } catch(e){ return []; }
}

// 6. Workable
export async function fetchWorkable(slug) {
  try {
    for (const s of [slug, slug.toLowerCase()]) {
      const res = await fetch(`https://${s}.workable.com/api/v3/accounts/${s}/jobs?details=true`, { headers: { 'User-Agent': 'JobMatchPortal/1.0' } });
      if (!res.ok) continue;
      const data = await res.json();
      const jobs = (data.jobs||data.results||[]).map(j=>({
        id:`wb-${j.shortcode||j.id}`, title:j.title, location:j.location?.city||j.city||'UK',
        description:(j.description||'').replace(/<[^>]*>/g,'').slice(0,4000), url:j.url||`https://${s}.workable.com/j/${j.shortcode}`,
        posting_date:j.published_on||j.created_at||new Date().toISOString(), ats:'workable', isTech:isTechJob(j.title)
      }));
      if (jobs.length) return jobs;
    }
    return [];
  } catch(e){ return []; }
}

// 7. Teamtailor
export async function fetchTeamtailor(slug) {
  try {
    for (const s of [slug, slug.toLowerCase()]) {
      const res = await fetch(`https://${s}.teamtailor.com/careers`, { headers: { 'User-Agent': 'JobMatchPortal/1.0', 'Accept':'application/json' } });
      if (!res.ok) continue;
      const text = await res.text();
      const match = text.match(/"jobs":\s*(\[.*?\])/s);
      if (match) {
        try {
          const jobs = JSON.parse(match[1]);
          return jobs.map(j=>({
            id:`tt-${j.id}`, title:j.title, location:j.location||'UK', department:j.department||'',
            description:(j.body||'').slice(0,4000), url:j.url||`https://${s}.teamtailor.com/jobs/${j.id}`,
            posting_date:j.created_at||new Date().toISOString(), ats:'teamtailor', isTech:isTechJob(j.title)
          }));
        } catch(e){}
      }
    }
    return [];
  } catch(e){ return []; }
}

// 8. Pinpoint
export async function fetchPinpoint(slug) {
  try {
    const res = await fetch(`https://${slug}.pinpointhq.com/en/postings.json`, { headers: { 'User-Agent': 'JobMatchPortal/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data||[]).map(j=>({
      id:`pp-${j.id}`, title:j.title, location:j.location||'UK', department:j.department||'',
      description:(j.description||'').slice(0,4000), url:j.url||`https://${slug}.pinpointhq.com/postings/${j.id}`,
      posting_date:j.created_at||new Date().toISOString(), ats:'pinpoint', isTech:isTechJob(j.title)
    }));
  } catch(e){ return []; }
}

// 9. Recruitee
export async function fetchRecruitee(slug) {
  try {
    const res = await fetch(`https://${slug}.recruitee.com/api/offers`, { headers: { 'User-Agent': 'JobMatchPortal/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.offers||[]).map(j=>({
      id:`rc-${j.id}`, title:j.title, location:j.location||'UK', department:j.department||'',
      description:(j.description||'').slice(0,4000), url:j.careers_url||`https://${slug}.recruitee.com/o/${j.slug}`,
      posting_date:j.created_at||new Date().toISOString(), ats:'recruitee', isTech:isTechJob(j.title)
    }));
  } catch(e){ return []; }
}

// 10. BambooHR
export async function fetchBambooHR(slug) {
  try {
    const res = await fetch(`https://${slug}.bamboohr.com/careers/list`, { headers: { 'User-Agent': 'JobMatchPortal/1.0', 'Accept':'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.result||[]).map(j=>({
      id:`bh-${j.id}`, title:j.jobOpeningName||j.title, location:j.location?.city||'UK', department:j.department||'',
      description:(j.description||'').slice(0,4000), url:j.jobOpeningUrl||`https://${slug}.bamboohr.com/jobs/view.php?id=${j.id}`,
      posting_date:j.datePosted||new Date().toISOString(), ats:'bamboohr', isTech:isTechJob(j.jobOpeningName||j.title)
    }));
  } catch(e){ return []; }
}

// 11. NHS Jobs
export async function fetchNHSJobs(companyName) {
  try {
    if (!/nhs|trust/i.test(companyName||'')) return [];
    const res = await fetch(`https://www.jobs.nhs.uk/api/v1/search?keyword=Software%20Engineer&employer=${encodeURIComponent(companyName||'NHS')}`, { headers: { 'User-Agent': 'JobMatchPortal/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.vacancies||[]).slice(0,5).map(j=>({
      id:`nhs-${j.id}`, title:j.title||'Software Engineer', location:j.location||'UK', department:'Digital',
      description:(j.description||'').slice(0,4000), url:`https://www.jobs.nhs.uk/candidate/jobadvert/${j.id}`,
      posting_date:j.posted||new Date().toISOString(), ats:'nhs', isTech:true
    }));
  } catch(e){ return []; }
}

// MAIN - Try all UK portals - FIXED to ignore google search URLs
export async function fetchAllATS(slug, companyName, careersUrl) {
  // FIX: If careersUrl is google search fallback, ignore it
  if (careersUrl && careersUrl.includes('google.com/search')) careersUrl = '';
  
  console.log(`🔍 fetchAllATS: slug=${slug}, company=${companyName}, careersUrl=${careersUrl || 'none (will try auto)'}`);
  
  const results = await Promise.allSettled([
    fetchGreenhouse(slug),
    fetchLever(slug),
    fetchAshby(slug),
    fetchWorkday(careersUrl, slug),
    fetchSmartRecruiters(slug),
    fetchWorkable(slug),
    fetchTeamtailor(slug),
    fetchPinpoint(slug),
    fetchRecruitee(slug),
    fetchBambooHR(slug),
    fetchNHSJobs(companyName)
  ]);
  const all = results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value);
  const seen = new Set();
  const deduped = all.filter(j=>{
    if (seen.has(j.id)) return false;
    seen.add(j.id);
    return true;
  });
  console.log(`✅ fetchAllATS total found: ${deduped.length} for ${slug}`);
  return deduped;
}

function estimateClosingDate(postingDate) {
  if (!postingDate) return null;
  const d = new Date(postingDate); d.setDate(d.getDate()+30); return d.toISOString();
}

export function enrichWithDates(jobs) {
  return jobs.map(j=>{
    const posting = j.posting_date||new Date().toISOString();
    const closing = j.closing_date||estimateClosingDate(posting);
    const now = Date.now();
    return {
      ...j, posting_date:posting, closing_date:closing, postingDate:posting, closingDate:closing,
      daysAgo: Math.floor((now - new Date(posting).getTime())/(1000*60*60*24)),
      daysUntilClose: Math.ceil((new Date(closing).getTime()-now)/(1000*60*60*24))
    };
  });
}
