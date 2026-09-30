// Curated source overrides for golden sponsor records whose dataset careersUrl
// is missing, malformed, or points to a search page. These are intentionally
// explicit so the importer never silently treats a Google search URL as a job source.

export const CAREER_SOURCE_OVERRIDES = {
  '3': {
    companyName: 'Confluent',
    careersUrl: 'https://jobs.ashbyhq.com/confluent',
    ats: 'ashby',
    atsSlug: 'confluent',
    source: 'curated'
  },
  '1': {
    companyName: 'Vercel UK Limited',
    careersUrl: 'https://job-boards.greenhouse.io/vercel',
    ats: 'greenhouse',
    atsSlug: 'vercel',
    source: 'curated'
  },
  '11': {
    companyName: 'GoCardless',
    careersUrl: 'https://job-boards.greenhouse.io/gocardless',
    ats: 'greenhouse',
    atsSlug: 'gocardless',
    source: 'curated'
  },
  '8': {
    companyName: 'Darktrace',
    careersUrl: 'https://www.darktrace.com/careers',
    ats: 'custom',
    atsSlug: '8',
    source: 'curated'
  },
  '12': {
    companyName: 'BJSS',
    careersUrl: 'https://www.bjss.com/careers/search',
    ats: 'custom',
    atsSlug: '12',
    source: 'curated'
  }
};

export function getCareerSourceOverride(company = {}) {
  const id = String(company.companyId || company.company_id || company.id || '').trim();
  return CAREER_SOURCE_OVERRIDES[id] || null;
}
