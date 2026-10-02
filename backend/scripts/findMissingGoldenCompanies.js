import 'dotenv/config';
import mongoose from 'mongoose';
import Company from '../models/Company.js';
import GoldenDiscoveryCheckpoint from '../models/GoldenDiscoveryCheckpoint.js';

try {
  await mongoose.connect(process.env.MONGODB_URI);

  const companies = await Company.find({ enabled: true })
    .select('companyId')
    .lean();

  const checkpoints = await GoldenDiscoveryCheckpoint.distinct('companyId');
  const checkpointSet = new Set(checkpoints.map((id) => String(id)));

  const missing = companies
    .map((company) => String(company.companyId))
    .filter((id) => !checkpointSet.has(id));

  console.log(JSON.stringify({
    enabledCompanies: companies.length,
    checkpointCompanies: checkpointSet.size,
    missingCount: missing.length,
    missing
  }, null, 2));
} finally {
  await mongoose.disconnect();
}
