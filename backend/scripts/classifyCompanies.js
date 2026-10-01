import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { classifyCompany } from '../utils/companyClassification.js';

dotenv.config();

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const BATCH_SIZE = Math.max(50, Math.min(1000, Number(arg('batch-size', 500)) || 500));
const LIMIT = Math.max(0, Number(arg('limit', 0)) || 0);

async function main() {
  await connectMongo();
  console.log(`MongoDB connected: ${mongoose.connection.name}`);

  let lastId = null;
  let processed = 0;
  let changed = 0;
  const counts = { nhs: 0, councils: 0, universities: 0, dwp: 0, private: 0 };

  while (true) {
    const remaining = LIMIT ? Math.min(BATCH_SIZE, LIMIT - processed) : BATCH_SIZE;
    if (remaining <= 0) break;

    const filter = lastId ? { _id: { $gt: lastId } } : {};
    const companies = await Company.find(filter)
      .sort({ _id: 1 })
      .limit(remaining)
      .lean();
    if (!companies.length) break;

    const operations = [];
    for (const company of companies) {
      const classification = classifyCompany({ company });
      counts[classification.employerType] += 1;

      if (company.employerType === classification.employerType &&
          company.classificationVersion === classification.classificationVersion) continue;

      operations.push({
        updateOne: {
          filter: { _id: company._id },
          update: { $set: classification }
        }
      });
    }

    if (operations.length) {
      const result = await Company.bulkWrite(operations, { ordered: false });
      changed += result.modifiedCount || 0;
    }

    processed += companies.length;
    lastId = companies[companies.length - 1]._id;
    console.log(`[company-classify] processed=${processed}${LIMIT ? `/${LIMIT}` : ''} changed=${changed}`);
  }

  console.log(JSON.stringify({ processed, changed, counts, batchSize: BATCH_SIZE }, null, 2));
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('COMPANY CLASSIFICATION FAILED:', error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
