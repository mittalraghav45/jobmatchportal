// cvJobMatcher.js - CV Match %, Recommendation, Dates, Live Listings
// Own logic > Perplexity for live dates. Perplexity only fallback.

export const TECH_STACK_KEYWORDS = [
  'react','next.js','nextjs','node.js','nodejs','typescript','javascript','python',
  'java','aws','azure','gcp','docker','kubernetes','graphql','rest','sql','mongodb',
  'postgres','redis','tailwind','redux','vue','angular'
];

// Parse CV text -> skills
export function parseCV(cvText) {
  const lower = (cvText||'').toLowerCase();
  const skills = TECH_STACK_KEYWORDS.filter(k => lower.includes(k));
  // Extract years of exp - simple regex
  const expMatch = lower.match(/(\d+)\+?\s*years?\s*(of)?\s*experience/);
  const years = expMatch ? parseInt(expMatch[1]) : 0;
  return { skills: [...new Set(skills)], years, raw: cvText };
}

// Calculate match % between CV and job description
export function calculateMatchPercent(cvSkills, jobDescription, jobTitle) {
  if (!jobDescription) return 0;
  const jdLower = (jobDescription + ' ' + jobTitle).toLowerCase();
  let matched = 0;
  let total = cvSkills.length;
  if (total === 0) return 0;
  
  cvSkills.forEach(skill => {
    if (jdLower.includes(skill)) matched++;
  });
  
  // Bonus for title match
  let bonus = 0;
  if (jdLower.includes('react') && cvSkills.includes('react')) bonus += 10;
  if (jdLower.includes('node') && cvSkills.includes('node.js')) bonus += 10;
  
  const basePercent = (matched / total) * 100;
  return Math.min(100, Math.round(basePercent + bonus));
}

// Recommendation logic
export function getRecommendation(matchPercent, isHiring, closingDate, visaSponsors) {
  if (!visaSponsors) return { shouldApply: false, reason: 'No visa sponsorship confirmed', priority: 'Low' };
  if (!isHiring) return { shouldApply: false, reason: 'Not currently hiring', priority: 'Low' };
  
  const now = new Date();
  const close = closingDate ? new Date(closingDate) : null;
  if (close && close < now) return { shouldApply: false, reason: `Closed on ${close.toLocaleDateString()}`, priority: 'Closed' };
  
  if (matchPercent >= 80) return { shouldApply: true, reason: `Excellent match ${matchPercent}% - Apply now!`, priority: 'High' };
  if (matchPercent >= 60) return { shouldApply: true, reason: `Good match ${matchPercent}% - Worth applying`, priority: 'Medium' };
  if (matchPercent >= 40) return { shouldApply: true, reason: `Partial match ${matchPercent}% - Apply if you have time`, priority: 'Low' };
  return { shouldApply: false, reason: `Low match ${matchPercent}%`, priority: 'Low' };
}

// Live listings fetcher - OWN LOGIC (not Perplexity)
// 90% of UK tech uses Greenhouse, Lever, Workday - free public JSON APIs
export async function fetchLiveJobsForCompany(company) {
  // This runs in backend - example for Greenhouse
  // Greenhouse: https://boards-api.greenhouse.io/v1/boards/{company}/jobs
  // Lever: https://api.lever.co/v0/postings/{company}
  // Workday: Need custom scraper
  
  // For now, simulate with Perplexity fallback structure
  // In production, you would call your backend /api/live-jobs?company=ocado
  
  return {
    company: company.name,
    careersUrl: company.careersUrl || `https://www.google.com/search?q=${encodeURIComponent(company.name + ' careers')}`,
    jobs: [], // Filled by backend scraper
    lastFetched: new Date().toISOString()
  };
}
