// fetchingListofAllSponsors.js - Companies House identity enrichment for an existing sponsor dataset.
// IMPORTANT: Companies House confirms company identity/status/SIC data. It does NOT by itself
// prove that an employer holds a UK Skilled Worker sponsor licence. Sponsor status must come
// from an appropriate sponsorship source and is stored separately as sponsorStatus.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_KEY = process.env.COMPANIES_HOUSE_API_KEY;

const POSSIBLE_INPUTS = [
  path.join(__dirname, '../frontend/src/sponsors_full_clean.json'),
  path.join(__dirname, '../frontend/src/sponsors.json'),
  path.join(__dirname, './sponsors_full_clean.json'),
  path.join(__dirname, './sponsors.json')
];
const OUTPUT_FILE = path.join(__dirname, '../frontend/src/sponsors_gold_verified.json');
const FAILED_FILE = path.join(__dirname, 'failed_lookups.json');

function cleanName(name) {
  if (!name) return name;
  return String(name)
    .replace(/\?{2,}/g, "'")
    .replace(/\uFFFD/g, "'")
    .replace(/â€™|â€œ|â€|â€˜/g, "'")
    .replace(/Ã¼/g, 'ü').replace(/Ã©/g, 'é').replace(/Ã¨/g, 'è')
    .normalize('NFKC').trim().replace(/\s{2,}/g, ' ');
}

function findInputFile() {
  return POSSIBLE_INPUTS.find(file => fs.existsSync(file)) || null;
}

function getSponsorStatus(sponsor) {
  const value = String(sponsor.sponsorStatus || sponsor.status || '').toLowerCase().trim();
  return ['verified', 'not-sponsor'].includes(value) ? value : 'unknown';
}

async function searchCompany(name, apiKey = API_KEY) {
  if (!apiKey) throw new Error('MISSING_COMPANIES_HOUSE_API_KEY');
  const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(cleanName(name))}&items_per_page=5`;
  const res = await fetch(url, {
    headers: { Authorization: 'Basic ' + Buffer.from(apiKey + ':').toString('base64') }
  });
  if (res.status === 429) throw new Error('RATE_LIMIT');
  if (res.status === 401) throw new Error('INVALID_KEY');
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return (await res.json()).items || [];
}

async function getCompanyProfile(companyNumber, apiKey = API_KEY) {
  if (!apiKey) throw new Error('MISSING_COMPANIES_HOUSE_API_KEY');
  const res = await fetch(`https://api.company-information.service.gov.uk/company/${companyNumber}`, {
    headers: { Authorization: 'Basic ' + Buffer.from(apiKey + ':').toString('base64') }
  });
  if (res.status === 429) throw new Error('RATE_LIMIT');
  if (res.status === 401) throw new Error('INVALID_KEY');
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json();
}

export async function enrichCompanyIdentity(sponsor, apiKey = API_KEY, attempt = 1) {
  const input = {
    ...sponsor,
    name: cleanName(sponsor.name),
    legalName: cleanName(sponsor.legalName || sponsor.name),
    sponsorStatus: getSponsorStatus(sponsor)
  };

  try {
    const searchResults = await searchCompany(input.name, apiKey);
    if (!searchResults.length) {
      return {
        ...input,
        companyVerification: {
          verified: false,
          reason: 'NOT_FOUND',
          method: 'companies_house_search'
        }
      };
    }

    const top = searchResults[0];
    const profile = await getCompanyProfile(top.company_number, apiKey);

    return {
      ...input,
      legalName: cleanName(profile.company_name || input.legalName),
      companyNumber: top.company_number,
      companyVerification: {
        verified: true,
        method: 'companies_house',
        matchedName: top.title,
        companyStatus: profile.company_status || null,
        sicCodes: profile.sic_codes || [],
        dateOfCreation: profile.date_of_creation || null
      }
    };
  } catch (error) {
    if (error.message === 'RATE_LIMIT' && attempt < 5) {
      await new Promise(resolve => setTimeout(resolve, attempt * 10000));
      return enrichCompanyIdentity(input, apiKey, attempt + 1);
    }

    return {
      ...input,
      companyVerification: {
        verified: false,
        reason: error.message,
        method: 'companies_house_error'
      }
    };
  }
}

export async function runSponsorEnrichment({ inputFile = findInputFile(), outputFile = OUTPUT_FILE, failedFile = FAILED_FILE, apiKey = API_KEY, concurrency = 5, delayMs = 700 } = {}) {
  if (!inputFile) throw new Error('NO_INPUT_FILE');
  if (!apiKey) throw new Error('MISSING_COMPANIES_HOUSE_API_KEY');

  const allSponsors = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const cleanedSponsors = allSponsors.map(sponsor => ({
    ...sponsor,
    name: cleanName(sponsor.name),
    legalName: cleanName(sponsor.legalName || sponsor.name),
    sponsorStatus: getSponsorStatus(sponsor)
  }));

  let alreadyProcessed = [];
  if (fs.existsSync(outputFile)) {
    try { alreadyProcessed = JSON.parse(fs.readFileSync(outputFile, 'utf8')); } catch { alreadyProcessed = []; }
  }
  const processedIds = new Set(alreadyProcessed.map(s => s.id || s.companyNumber || s.name));
  const queue = cleanedSponsors.filter(s => !processedIds.has(s.id || s.companyNumber || s.name));
  const verified = [...alreadyProcessed];
  const failed = fs.existsSync(failedFile) ? JSON.parse(fs.readFileSync(failedFile, 'utf8')) : [];

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const sponsor = queue.shift();
      if (!sponsor) break;
      const result = await enrichCompanyIdentity(sponsor, apiKey);
      if (result.companyVerification?.verified) verified.push(result);
      else failed.push(result);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  });

  await Promise.all(workers);
  fs.writeFileSync(outputFile, JSON.stringify(verified, null, 2));
  fs.writeFileSync(failedFile, JSON.stringify(failed, null, 2));
  return { total: allSponsors.length, verified: verified.length, failed: failed.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSponsorEnrichment()
    .then(result => console.log(`Completed: ${result.total}; company-verified: ${result.verified}; failed: ${result.failed}`))
    .catch(error => { console.error(`Sponsor enrichment failed: ${error.message}`); process.exitCode = 1; });
}
