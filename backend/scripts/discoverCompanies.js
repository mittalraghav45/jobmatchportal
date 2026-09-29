import { discoverEnabledCompanies } from '../services/companyDiscovery.js';

const result = await discoverEnabledCompanies();

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  ...result.summary,
  companies: result.companies.map(item => ({
    companyId: item.company.companyId,
    companyName: item.company.companyName,
    ats: item.company.ats || null,
    status: item.status,
    jobs: item.jobs.length,
    added: item.added,
    updated: item.updated,
    rejected: item.rejected
  }))
}, null, 2));
