import { getEnabledCompanies } from '../config/companies.js';
import { discoverCompanies } from '../services/discoveryPipeline.js';

const persist = process.argv.includes('--persist');
const companies = getEnabledCompanies();

if (!companies.length) {
  console.error('No enabled companies found in backend/config/companies.csv');
  process.exitCode = 1;
} else {
  try {
    const report = await discoverCompanies(companies, { persist });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
