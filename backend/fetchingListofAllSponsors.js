// fetchingListOfAllSponsors.js - FIXED v3 - Correct spelling ListOf, UTF-8 fix, resume, category
// Renamed from fetchingListofAllSponsors.js (was Listof -> ListOf)
// Run: node fetchingListOfAllSponsors.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// FIXED: Don't fallback to hardcoded key - must use env
const API_KEY = process.env.COMPANIES_HOUSE_API_KEY;
if (!API_KEY) {
  console.error('❌ COMPANIES_HOUSE_API_KEY missing in backend/.env');
  console.error('   Add: COMPANIES_HOUSE_API_KEY=1a7257bf-6bcf-4d71-a05a-151b60c778b2');
  process.exit(1);
}

const POSSIBLE_INPUTS = [
  path.join(__dirname, '../frontend/src/sponsors_full_clean.json'),
  path.join(__dirname, '../frontend/src/sponsors.json'),
  path.join(__dirname, './sponsors_full_clean.json'),
  path.join(__dirname, './sponsors.json'),
];

function findInputFile() { 
  for (const p of POSSIBLE_INPUTS) if (fs.existsSync(p)) return p; 
  return null; 
}

const OUTPUT_FILE = path.join(__dirname, '../frontend/src/sponsors_gold_verified.json');
const FAILED_FILE = path.join(__dirname, 'failed_lookups.json');

const TECH_SICS = ['62012','62020','62090','62011','62019','62030','63110','63120','58290','58210','61100','61200','70229'];
const PUBLIC_KEYWORDS = ['nhs','council','government','borough','trust','police','fire','authority','health board'];
const UNI_KEYWORDS = ['university','universities','college','business school'];

// FIXED: Clean corrupted names like Aberdeen University Students??????Association
function cleanName(name) {
  if (!name) return name;
  let cleaned = name;
  // Fix ???? replacement for curly quotes / apostrophes
  cleaned = cleaned.replace(/\?{2,}/g, "'"); // ????? -> '
  cleaned = cleaned.replace(/\uFFFD/g, "'"); // � -> '
  cleaned = cleaned.replace(/â€™|â€œ|â€|â€˜|â€™/g, "'"); // smart quotes artifacts
  cleaned = cleaned.replace(/Ã¼/g, "ü").replace(/Ã©/g, "é").replace(/Ã¨/g, "è");
  // Normalize unicode
  cleaned = cleaned.normalize('NFKC').trim();
  // Remove double spaces
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  return cleaned;
}

function isPublicOrUni(name) {
  const lower = (name||'').toLowerCase();
  return PUBLIC_KEYWORDS.some(k=> lower.includes(k)) || UNI_KEYWORDS.some(k=> lower.includes(k));
}

function getCategory(sponsor) {
  const name = (sponsor.name||'').toLowerCase();
  const ind = (sponsor.industry||sponsor.Category||'').toLowerCase();
  if (ind.includes('public') || PUBLIC_KEYWORDS.some(k=> name.includes(k))) return 'Public';
  if (ind.includes('univer') || UNI_KEYWORDS.some(k=> name.includes(k))) return 'University';
  return 'Tech';
}

async function searchCompany(name) {
  const clean = cleanName(name);
  const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(clean)}&items_per_page=5`;
  const res = await fetch(url, { headers: { 'Authorization': 'Basic ' + Buffer.from(API_KEY + ':').toString('base64') } });
  if (res.status === 429) throw new Error('RATE_LIMIT');
  if (res.status === 401) throw new Error('INVALID_KEY');
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const data = await res.json();
  return data.items || [];
}

async function getCompanyProfile(companyNumber) {
  const url = `https://api.company-information.service.gov.uk/company/${companyNumber}`;
  const res = await fetch(url, { headers: { 'Authorization': 'Basic ' + Buffer.from(API_KEY + ':').toString('base64') } });
  if (res.status === 429) throw new Error('RATE_LIMIT');
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return await res.json();
}

async function verifySponsor(sponsor, attempt=1) {
  try {
    // FIX: Clean name first
    sponsor.name = cleanName(sponsor.name);
    sponsor.legalName = cleanName(sponsor.legalName || sponsor.name);
    
    if (isPublicOrUni(sponsor.name)) {
      return { ...sponsor, companyNumber: 'PUBLIC_BYPASS', verification: { verified: true, type: getCategory(sponsor), sic_codes: [], method: 'public_uni_bypass' } };
    }
    const searchResults = await searchCompany(sponsor.name);
    if (searchResults.length === 0) {
      return { ...sponsor, verification: { verified: false, type: getCategory(sponsor), reason: 'NOT_FOUND', method: 'search' } };
    }
    const top = searchResults[0];
    const profile = await getCompanyProfile(top.company_number);
    const sicCodes = profile.sic_codes || [];
    const isTech = sicCodes.some(code => TECH_SICS.includes(code));
    return {
      ...sponsor,
      legalName: cleanName(profile.company_name || sponsor.name),
      companyNumber: top.company_number,
      verification: { verified: isTech, type: getCategory(sponsor), sic_codes: sicCodes, company_status: profile.company_status, method: 'sic_check', matched_name: top.title }
    };
  } catch (e) {
    if (e.message === 'RATE_LIMIT' && attempt < 5) {
      console.log(`   ⏳ Rate limit, waiting ${attempt*10}s...`);
      await new Promise(r => setTimeout(r, attempt * 10000));
      return verifySponsor(sponsor, attempt+1);
    }
    return { ...sponsor, verification: { verified: false, type: getCategory(sponsor), reason: e.message, method: 'error' } };
  }
}

async function main() {
  const inputFile = findInputFile();
  if (!inputFile) { console.error('❌ No input file found'); process.exit(1); }
  const raw = fs.readFileSync(inputFile, 'utf8');
  const allSponsors = JSON.parse(raw);
  console.log(`\n📂 Input: ${inputFile} - ${allSponsors.length} total`);

  // FIXED: Clean all names on load
  const cleanedSponsors = allSponsors.map(s => ({
    ...s,
    name: cleanName(s.name),
    legalName: cleanName(s.legalName || s.name)
  }));

  // RESUME: Load already verified
  let alreadyVerified = [];
  let alreadyFailed = [];
  let processedIds = new Set();
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      alreadyVerified = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      processedIds = new Set(alreadyVerified.map(s=> cleanName(s.id || s.name)));
      console.log(`   Found existing gold file with ${alreadyVerified.length} already verified - will resume`);
    } catch(e){}
  }
  if (fs.existsSync(FAILED_FILE)) {
    try { alreadyFailed = JSON.parse(fs.readFileSync(FAILED_FILE, 'utf8')); } catch(e){}
  }

  const sponsors = cleanedSponsors.filter(s => !processedIds.has(s.id || s.name));
  console.log(`   Already done: ${alreadyVerified.length} | Remaining to process: ${sponsors.length}`);
  if (sponsors.length === 0) {
    console.log('\n✅ All done already! Gold file ready.');
  }

  const CONCURRENCY = 5;
  const DELAY_MS = 700;
  const verified = [...alreadyVerified];
  const failed = [...alreadyFailed];
  let processed = alreadyVerified.length + alreadyFailed.length;
  let kept = alreadyVerified.length;

  console.log(`\n🚀 Starting 5 workers for remaining ${sponsors.length} (total ${allSponsors.length})`);
  console.log(`   Expected time: ~${Math.ceil(sponsors.length * 0.7 / 60)} mins\n`);

  const queue = [...sponsors];
  const workers = Array(CONCURRENCY).fill(null).map(async (_, workerId) => {
    while (queue.length > 0) {
      const sponsor = queue.shift();
      if (!sponsor) break;
      console.log(`[W${workerId+1}] ${processed+1}/${allSponsors.length} ${sponsor.name} (${getCategory(sponsor)})`);
      const result = await verifySponsor(sponsor);
      processed++;
      if (result.verification.verified) {
        kept++;
        verified.push(result);
        console.log(`   ✅ KEPT ${result.verification.type} SIC ${result.verification.sic_codes?.join(',') || 'BYPASS'} | Gold: ${kept}`);
      } else {
        failed.push(result);
        console.log(`   ❌ DROPPED ${result.verification.type} - ${result.verification.reason || result.verification.sic_codes?.join(',')}`);
      }
      if (processed % 20 === 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(verified, null, 2), 'utf8');
        fs.writeFileSync(FAILED_FILE, JSON.stringify(failed, null, 2), 'utf8');
        const techCount = verified.filter(v=> getCategory(v)==='Tech').length;
        const pubCount = verified.filter(v=> getCategory(v)==='Public').length;
        const uniCount = verified.filter(v=> getCategory(v)==='University').length;
        console.log(`\n💾 Progress: ${processed}/${allSponsors.length} | Gold: ${kept} (Tech:${techCount} Public:${pubCount} Uni:${uniCount}) | Dropped:${failed.length}\n`);
      }
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  });

  await Promise.all(workers);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(verified, null, 2), 'utf8');
  fs.writeFileSync(FAILED_FILE, JSON.stringify(failed, null, 2), 'utf8');

  const techCount = verified.filter(v=> getCategory(v)==='Tech').length;
  const pubCount = verified.filter(v=> getCategory(v)==='Public').length;
  const uniCount = verified.filter(v=> getCategory(v)==='University').length;

  console.log(`\n========== FINAL GOLD REPORT ==========`);
  console.log(`Total processed: ${allSponsors.length}`);
  console.log(`✅ Gold verified: ${kept}`);
  console.log(`   - Tech (SIC verified): ${techCount}`);
  console.log(`   - Public (NHS/Council bypass): ${pubCount}`);
  console.log(`   - University (bypass): ${uniCount}`);
  console.log(`❌ Dropped (SIC not tech): ${failed.length}`);
  console.log(`\n📁 Gold file: ${OUTPUT_FILE}`);
}

main().catch(console.error);
