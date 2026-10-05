import 'dotenv/config';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { loadCompanies } from '../config/companies.js';
import { discoverCompanyJobs } from '../services/companyDiscovery.js';

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find(item => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function parseCompanySelection(value) {
  if (!value) return [];
  return [...new Set(String(value)
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean))];
}

function applyDiscoveryConfig(company, configuredById) {
  const configured = configuredById.get(String(company.companyId || '').trim().toLowerCase());
  if (!configured) return company;

  return {
    ...company,
    careersUrl: configured.careers_url || company.careersUrl || '',
    ats: configured.ats || company.ats || 'unknown',
    metadata: {
      ...(company.metadata || {}),
      discoveryConfig: {
        priority: configured.priority || null,
        atsSlug: configured.ats_slug || null,
        source: 'config/companies.csv'
      }
    }
  };
}

const selectedCompanies = parseCompanySelection(arg('companies', process.env.DISCOVERY_COMPANIES || ''));
const limit = Math.max(1, Number(arg('limit', process.env.DISCOVERY_LIMIT || 500)) || 500);
const start = Math.max(0, Number(arg('skip', process.env.DISCOVERY_SKIP || 0)) || 0);
const delayMs = Math.max(0, Number(process.env.DISCOVERY_DELAY_MS || 100));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

await connectMongo();

const configuredCompanies = loadCompanies();
const configuredById = new Map(
  configuredCompanies.map(company => [String(company.company_id || '').trim().toLowerCase(), company])
);

const companyQuery = { enabled: true };
if (selectedCompanies.length) {
  companyQuery.$or = [
    { companyId: { $in: selectedCompanies } },
    { companyName: { $in: selectedCompanies } },
    { companyId: { $in: selectedCompanies.map(value => value) } }
  ];
}

let companies = await Company.find(companyQuery)
  .select('companyId companyName companyNumber website careersUrl ats enabled metadata')
  .sort({ companyId: 1 })
  .skip(selectedCompanies.length ? 0 : start)
  .limit(selectedCompanies.length ? selectedCompanies.length : limit)
  .lean();

if (selectedCompanies.length) {
  const byName = new Map(companies.map(company => [String(company.companyName || '').trim().toLowerCase(), company]));
  const byId = new Map(companies.map(company => [String(company.companyId || '').trim().toLowerCase(), company]));
  companies = selectedCompanies
    .map(selection => byId.get(selection) || byName.get(selection))
    .filter(Boolean);
}

companies = companies.map(company => applyDiscoveryConfig(company, configuredById));

const summary = {
  requested: selectedCompanies.length || companies.length,
  selected: companies.length,
  missing: selectedCompanies.filter(selection => !companies.some(company =>
    String(company.companyId || '').trim().toLowerCase() === selection ||
    String(company.companyName || '').trim().toLowerCase() === selection
  )),
  successful: 0,
  failed: 0,
  unconfigured: 0,
  invalid: 0,
  discovered: 0,
  added: 0,
  updated: 0,
  duplicatesRemoved: 0,
  rejected: 0
};

for (const company of companies) {
  const result = await discoverCompanyJobs(company, {
    persist: true,
    now: new Date()
  });

  if (result.status === 'ok') summary.successful += 1;
  else if (result.status === 'error') summary.failed += 1;
  else if (result.status === 'unconfigured') summary.unconfigured += 1;
  else if (result.status === 'invalid') summary.invalid += 1;

  summary.discovered += result.jobs?.length || 0;
  summary.added += result.added || 0;
  summary.updated += result.updated || 0;
  summary.duplicatesRemoved += result.duplicatesRemoved || 0;
  summary.rejected += result.rejected?.length || 0;

  console.log(JSON.stringify({
    companyId: company.companyId,
    companyName: company.companyName,
    ats: result.company?.ats || null,
    atsSource: result.company?.atsSource || null,
    status: result.status,
    discovered: result.jobs?.length || 0,
    added: result.added || 0,
    updated: result.updated || 0,
    duplicatesRemoved: result.duplicatesRemoved || 0,
    rejected: result.rejected?.length || 0
  }));

  if (delayMs) await sleep(delayMs);
}

console.log('=== UNIFIED NIGHTLY DISCOVERY SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));

await import('mongoose').then(({ default: mongoose }) => mongoose.disconnect());
