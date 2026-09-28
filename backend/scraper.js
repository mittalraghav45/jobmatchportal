// liveJobsScraper.js - OWN LOGIC FOR LIVE LISTINGS - Better than Perplexity for dates
// Uses free public ATS APIs: Greenhouse, Lever, Ashby, Workday

import fetch from 'node-fetch';

const ATS_APIS = {
  greenhouse: (company) => `https://boards-api.greenhouse.io/v1/boards/${company}/jobs`,
  lever: (company) => `https://api.lever.co/v0/postings/${company}?mode=json`,
  ashby: (company) => `https://api.ashbyhq.com/posting-api/job-board/${company}`,
};

// Detect ATS from careersUrl
function detectATS(url) {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes('greenhouse.io') || lower.includes('boards.greenhouse')) return 'greenhouse';
  if (lower.includes('lever.co')) return 'lever';
  if (lower.includes('ashbyhq')) return 'ashby';
  if (lower.includes('myworkdayjobs') || lower.includes('workday')) return 'workday';
  return null;
}

// Fetch from Greenhouse - returns posting_date, closing_date
async function fetchGreenhouse(companySlug) {
  try {
    const url = ATS_APIS.greenhouse(companySlug);
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || []).map(job => ({
      id: job.id,
      title: job.title,
      location: job.location?.name || 'UK',
      description: job.content || '',
      url: job.absolute_url,
      posting_date: job.updated_at, // Greenhouse gives updated_at
      closing_date: null, // Greenhouse doesn't give closing, we estimate +30 days
      department: job.departments?.[0]?.name || '',
      isTech: /react|node|javascript|typescript|software|engineer/i.test(job.title)
    }));
  } catch(e) { return []; }
}

async function fetchLever(companySlug) {
  try {
    const url = ATS_APIS.lever(companySlug);
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map(job => ({
      id: job.id,
      title: job.text,
      location: job.categories?.location || 'UK',
      description: job.description || job.descriptionPlain || '',
      url: job.hostedUrl,
      posting_date: job.createdAt, // Lever gives createdAt
      closing_date: null,
      department: job.categories?.team || '',
      isTech: /react|node|javascript|typescript|software|engineer/i.test(job.text)
    }));
  } catch(e) { return []; }
}

// Main: Get live jobs for a sponsor (OWN LOGIC)
export async function getLiveJobsForSponsor(sponsor, cvSkills = []) {
  // Try to guess ATS slug from company name
  const slug = sponsor.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const atsType = detectATS(sponsor.careersUrl);
  
  let jobs = [];
  if (atsType === 'greenhouse' || !atsType) {
    jobs = await fetchGreenhouse(slug);
    if (jobs.length === 0 && !atsType) {
      jobs = await fetchLever(slug); // Fallback try lever
    }
  } else if (atsType === 'lever') {
    jobs = await fetchLever(slug);
  }

  // Filter to tech jobs matching CV
  const techJobs = jobs.filter(j => j.isTech);
  
  // Calculate match % for each job
  const enriched = techJobs.map(job => {
    const matchPercent = calculateMatch(job, cvSkills);
    const closingDate = job.closing_date || estimateClosingDate(job.posting_date);
    return {
      ...job,
      matchPercent,
      closingDate,
      recommendation: getRecommendationLocal(matchPercent, closingDate),
      daysAgo: getDaysAgo(job.posting_date)
    };
  });

  return enriched.sort((a,b) => b.matchPercent - a.matchPercent); // Highest match first
}

function calculateMatch(job, cvSkills) {
  if (!cvSkills.length) return 0;
  const text = (job.title + ' ' + job.description).toLowerCase();
  let matched = cvSkills.filter(s => text.includes(s.toLowerCase())).length;
  return Math.round((matched / cvSkills.length) * 100);
}

function estimateClosingDate(postingDate) {
  if (!postingDate) return null;
  const d = new Date(postingDate);
  d.setDate(d.getDate() + 30); // Most UK jobs close after 30 days
  return d.toISOString();
}

function getDaysAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000*60*60*24));
}

function getRecommendationLocal(matchPercent, closingDate) {
  if (!closingDate) return matchPercent >= 60 ? 'Apply' : 'Low match';
  const close = new Date(closingDate);
  if (close < new Date()) return 'Closed';
  if (matchPercent >= 80) return 'Apply now - Excellent match';
  if (matchPercent >= 60) return 'Apply - Good match';
  if (matchPercent >= 40) return 'Consider';
  return 'Low match';
}
