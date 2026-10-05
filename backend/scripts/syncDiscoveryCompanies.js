import 'dotenv/config';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { getEnabledCompanies } from '../config/companies.js';

const configured = getEnabledCompanies();
if (!configured.length) throw new Error('No enabled companies found in config/companies.csv');

await connectMongo();

const results = [];
for (const company of configured) {
  const filter = {
    $or: [
      { companyId: company.company_id },
      { companyName: new RegExp(`^${String(company.company_name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    ]
  };

  const update = {
    $set: {
      companyId: company.company_id,
      companyName: company.company_name,
      enabled: company.enabled,
      priority: company.priority || 'medium',
      ats: company.ats || 'unknown',
      careersUrl: company.careers_url || '',
      metadata: {
        discoveryConfig: {
          atsSlug: company.ats_slug || null,
          source: 'config/companies.csv'
        }
      }
    }
  };

  const result = await Company.updateOne(filter, update, { upsert: true });
  results.push({
    companyId: company.company_id,
    companyName: company.company_name,
    matched: result.matchedCount || 0,
    modified: result.modifiedCount || 0,
    upserted: result.upsertedCount || 0
  });
}

console.log(JSON.stringify({ synced: results.length, results }, null, 2));
await import('mongoose').then(({ default: mongoose }) => mongoose.disconnect());
