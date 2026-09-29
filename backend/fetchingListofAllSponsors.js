// fetchingListOfAllSponsors.js - sponsor/company verification pipeline

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_KEY = process.env.COMPANIES_HOUSE_API_KEY;
if (!API_KEY) {
  console.error('❌ COMPANIES_HOUSE_API_KEY missing in backend/.env');
  console.error('   Configure COMPANIES_HOUSE_API_KEY in your environment; never commit the key to source control.');
  process.exit(1);
}

const POSSIBLE_INPUTS = [
  path.join(__dirname, '../frontend/src/sponsors_full_clean.json'),
  path.join(__dirname, '../frontend/src/sponsors.json'),
  path.join(__dirname, './sponsors_full_clean.json'),
  path.join(__dirname, './sponsors.json')
];
function findInputFile() { for (const p of POSSIBLE_INPUTS) if (fs.existsSync(p)) return p; return null; }
const OUTPUT_FILE = path.join(__dirname, '../frontend/src/sponsors_gold_verified.json');
const FAILED_FILE = path.join(__dirname, 'failed_lookups.json');
const TECH_SICS = ['62012','62020','62090','62011','62019','62030','63110','63120','58290','58210','61100','61200','70229'];
const PUBLIC_KEYWORDS = ['nhs','council','government','borough','trust','police','fire','authority','health board'];
const UNI_KEYWORDS = ['university','universities','college','business school'];

function cleanName(name) {
  if (!name) return name;
  return String(name).replace(/\?{2,}/g, "'").replace(/\uFFFD/g, "'")
    .replace(/â€™|â€œ|â€|â€˜/g, "'").replace(/Ã¼/g, 'ü').replace(/Ã©/g, 'é').replace(/Ã¨/g, 'è')
    .normalize('NFKC').trim().replace(/\s{2,}/g, ' ');
}
function isPublicOrUni(name) { const lower = (name || '').toLowerCase(); return PUBLIC_KEYWORDS.some(k => lower.includes(k)) || UNI_KEYWORDS.some(k => lower.includes(k)); }
function getCategory(sponsor) {
  const name = (sponsor.name || '').toLowerCase();
  const ind = (sponsor.industry || sponsor.Category || '').toLowerCase();
  if (ind.includes('public') || PUBLIC_KEYWORDS.some(k => name.includes(k))) return 'Public';
  if (ind.includes('univer') || UNI_KEYWORDS.some(k => name.includes(k))) return 'University';
  return 'Tech';
}

async function searchCompany(name) {
  const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(cleanName(name))}&items_per_page=5`;
  const res = await fetch(url, { headers: { Authorization: 'Basic ' + Buffer.from(API_KEY + ':').toString('base64') } });
  if (res.status === 429) throw new Error('RATE_LIMIT');
  if (res.status === 401) throw new Error('INVALID_KEY');
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return (await res.json()).items || [];
}
async function getCompanyProfile(companyNumber) {
  const res = await fetch(`https://api.company-information.service.gov.uk/company/${companyNumber}`, { headers: { Authorization: 'Basic ' + Buffer.from(API_KEY + ':').toString('base64') } });
  if (res.status === 429) throw new Error('RATE_LIMIT');
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json();
}
async function verifySponsor(sponsor, attempt = 1) {
  try {
    sponsor.name = cleanName(sponsor.name);
    sponsor.legalName = cleanName(sponsor.legalName || sponsor.name);
    if (isPublicOrUni(sponsor.name)) return { ...sponsor, companyNumber: 'PUBLIC_BYPASS', verification: { verified: true, type: getCategory(sponsor), sic_codes: [], method: 'public_uni_bypass' } };
    const searchResults = await searchCompany(sponsor.name);
    if (!searchResults.length) return { ...sponsor, verification: { verified: false, type: getCategory(sponsor), reason: 'NOT_FOUND', method: 'search' } };
    const top = searchResults[0];
    const profile = await getCompanyProfile(top.company_number);
    const sicCodes = profile.sic_codes || [];
    const isTech = sicCodes.some(code => TECH_SICS.includes(code));
    return { ...sponsor, legalName: cleanName(profile.company_name || sponsor.name), companyNumber: top.company_number,
      verification: { verified: isTech, type: getCategory(sponsor), sic_codes: sicCodes, company_status: profile.company_status, method: 'sic_check', matched_name: top.title } };
  } catch (e) {
    if (e.message === 'RATE_LIMIT' && attempt < 5) { await new Promise(r => setTimeout(r, attempt * 10000)); return verifySponsor(sponsor, attempt + 1); }
    return { ...sponsor, verification: { verified: false, type: getCategory(sponsor), reason: e.message, method: 'error' } };
  }
}

async function main() {
  const inputFile = findInputFile();
  if (!inputFile) { console.error('❌ No input file found'); process.exit(1); }
  const allSponsors = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const cleanedSponsors = allSponsors.map(s => ({ ...s, name: cleanName(s.name), legalName: cleanName(s.legalName || s.name) }));
  let alreadyVerified = [], alreadyFailed = [], processedIds = new Set();
  if (fs.existsSync(OUTPUT_FILE)) { try { alreadyVerified = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8')); processedIds = new Set(alreadyVerified.map(s => cleanName(s.id || s.name))); } catch {} }
  if (fs.existsSync(FAILED_FILE)) { try { alreadyFailed = JSON.parse(fs.readFileSync(FAILED_FILE, 'utf8')); } catch {} }
  const sponsors = cleanedSponsors.filter(s => !processedIds.has(s.id || s.name));
  const CONCURRENCY = 5, DELAY_MS = 700;
  const verified = [...alreadyVerified], failed = [...alreadyFailed];
  let processed = alreadyVerified.length + alreadyFailed.length;
  const queue = [...sponsors];
  const workers = Array(CONCURRENCY).fill(null).map(async () => {
    while (queue.length) {
      const sponsor = queue.shift();
      if (!sponsor) break;
      const result = await verifySponsor(sponsor); processed++;
      if (result.verification.verified) verified.push(result); else failed.push(result);
      if (processed % 20 === 0) { fs.writeFileSync(OUTPUT_FILE, JSON.stringify(verified, null, 2)); fs.writeFileSync(FAILED_FILE, JSON.stringify(failed, null, 2)); }
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  });
  await Promise.all(workers);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(verified, null, 2));
  fs.writeFileSync(FAILED_FILE, JSON.stringify(failed, null, 2));
  console.log(`Completed: ${allSponsors.length}; verified: ${verified.length}; failed: ${failed.length}`);
}
main().catch(err => { console.error(err); process.exit(1); });
