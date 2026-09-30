import { ATSAdapter, createATSRegistry } from './adapter.js';
import { fetchGreenhouse, fetchLever, fetchAshby, fetchWorkday, fetchSmartRecruiters, fetchWorkable, fetchTeamtailor, fetchPinpoint, fetchRecruitee, fetchBambooHR, fetchNHSJobs } from '../liveJobsScraper_new.js';
import { fetchCustomCareersPage } from './custom.js';

export const atsRegistry = createATSRegistry([
  new ATSAdapter('greenhouse', ({ slug }) => fetchGreenhouse(slug)),
  new ATSAdapter('lever', ({ slug }) => fetchLever(slug)),
  new ATSAdapter('ashby', ({ slug }) => fetchAshby(slug)),
  new ATSAdapter('workday', ({ slug, careersUrl, site }) => fetchWorkday(careersUrl, site || slug)),
  new ATSAdapter('smartrecruiters', ({ slug }) => fetchSmartRecruiters(slug)),
  new ATSAdapter('workable', ({ slug }) => fetchWorkable(slug)),
  new ATSAdapter('teamtailor', ({ slug }) => fetchTeamtailor(slug)),
  new ATSAdapter('pinpoint', ({ slug }) => fetchPinpoint(slug)),
  new ATSAdapter('recruitee', ({ slug }) => fetchRecruitee(slug)),
  new ATSAdapter('bamboohr', ({ slug }) => fetchBambooHR(slug)),
  new ATSAdapter('nhs', ({ companyName }) => fetchNHSJobs(companyName)),
  new ATSAdapter('custom', ({ careersUrl, companyId, companyName }) => fetchCustomCareersPage(careersUrl, { companyId, companyName }))
]);

export function getSupportedATS() {
  return [...atsRegistry.keys()];
}

export async function discoverWithATS(name, context = {}) {
  const key = String(name || '').trim().toLowerCase();
  const adapter = atsRegistry.get(key);
  if (!adapter) throw new Error(`Unsupported ATS adapter: ${name}`);
  return adapter.discover(context);
}
