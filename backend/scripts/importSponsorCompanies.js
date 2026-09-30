import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATASET_PATH = path.join(__dirname, '../config/sponsor-companies.json');

function sponsorshipStatus(company) {
  if (company?.verification?.verified === true) return 'verified';
  if (typeof company?.sponsorRating === 'string' && company.sponsorRating.trim()) return 'verified';
  return 'unknown';
}

function priority(company) {
  if (company?.isHiring === true) return 'high';
  return 'medium';
}

async function main() {
  console.log('=== Sponsor Companies Golden Dataset Import ===');
  console.log(`Dataset: ${DATASET_PATH}`);

  const raw = fs.readFileSync(DATASET_PATH, 'utf8');
  const companies = JSON.parse(raw);

  if (!Array.isArray(companies)) {
    throw new Error('Golden dataset must be a JSON array.');
  }

  const invalid = companies.filter(company => company?.id === undefined || !company?.name);
  if (invalid.length) {
    throw new Error(`Golden dataset contains ${invalid.length} records without id/name.`);
  }

  const ids = new Set();
  const duplicateIds = [];
  for (const company of companies) {
    const id = String(company.id);
    if (ids.has(id)) duplicateIds.push(id);
    ids.add(id);
  }
  if (duplicateIds.length) {
    throw new Error(`Golden dataset contains duplicate ids: ${[...new Set(duplicateIds)].slice(0, 10).join(', ')}`);
  }

  console.log(`Validated ${companies.length} records.`);
  await connectMongo();
  console.log(`MongoDB connected: ${mongoose.connection.name}`);

  const operations = companies.map(company => ({
    updateOne: {
      filter: { companyId: String(company.id) },
      update: {
        $set: {
          companyId: String(company.id),
          companyName: company.name,
          companyNumber: company.companyNumber || '',
          website: company.website || '',
          careersUrl: company.careersUrl || '',
          enabled: company.isHiring !== false,
          priority: priority(company),
          ats: company.ats || 'unknown',
          sponsorship: sponsorshipStatus(company),
          // Keep the complete golden record so no source fields are lost.
          metadata: { ...company }
        }
      },
      upsert: true
    }
  }));

  const result = await Company.bulkWrite(operations, { ordered: false });
  const count = await Company.countDocuments();
  const sample = await Company.findOne({ companyId: String(companies[0].id) }).lean();

  console.log('=== IMPORT COMPLETE ===');
  console.log(`Source records: ${companies.length}`);
  console.log(`Inserted: ${result.upsertedCount}`);
  console.log(`Updated: ${result.modifiedCount}`);
  console.log(`Matched: ${result.matchedCount}`);
  console.log(`MongoDB Company documents: ${count}`);
  console.log(`Sample imported company: ${sample?.companyName || 'NOT FOUND'}`);

  if (count < companies.length) {
    throw new Error(`MongoDB contains ${count} Company documents; expected at least ${companies.length}.`);
  }

  await mongoose.disconnect();
  console.log('MongoDB connection closed.');
}

main().catch(async error => {
  console.error('IMPORT FAILED:', error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
