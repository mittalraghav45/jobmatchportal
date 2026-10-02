import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';

dotenv.config();

const CONTROLLED_TEST_IDS = new Set(['1', '3', '8', '11', '12']);
const CHECKPOINT_COLLECTION = 'golden_discovery_checkpoints';

try {
  await connectMongo();

  const db = mongoose.connection.db;
  const checkpointRows = await db.collection(CHECKPOINT_COLLECTION).distinct('companyId');
  const checkpointSet = new Set(checkpointRows.map((id) => String(id)));

  const companies = await Company.find({ enabled: true })
    .select('companyId companyName')
    .sort({ companyId: 1 })
    .lean();

  const scannableCompanies = companies.filter(
    (company) => !CONTROLLED_TEST_IDS.has(String(company.companyId))
  );

  const missing = scannableCompanies
    .filter((company) => !checkpointSet.has(String(company.companyId)))
    .map((company) => ({
      companyId: String(company.companyId),
      companyName: company.companyName || null
    }));

  console.log(JSON.stringify({
    enabledCompanies: companies.length,
    controlledTestCompaniesExcluded: companies.filter((company) => CONTROLLED_TEST_IDS.has(String(company.companyId))).length,
    expectedScannableCompanies: scannableCompanies.length,
    checkpointCompanies: checkpointSet.size,
    actualMissingCount: missing.length,
    missing
  }, null, 2));
} finally {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
