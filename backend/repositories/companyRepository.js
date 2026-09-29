import { Company } from '../models/Company.js';
import { normaliseCompany, validateCompany } from '../config/companySchema.js';

export async function upsertCompany(rawCompany) {
  const company = normaliseCompany(rawCompany);
  const validation = validateCompany(company);
  if (!validation.valid) throw new Error(`Invalid company: ${validation.errors.join('; ')}`);
  return Company.findOneAndUpdate({ companyId: company.companyId }, company, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
}

export async function importCompanies(rawCompanies = []) {
  const results = { insertedOrUpdated: 0, rejected: [] };
  for (const raw of rawCompanies) {
    try { await upsertCompany(raw); results.insertedOrUpdated += 1; }
    catch (error) { results.rejected.push({ raw, error: error.message }); }
  }
  return results;
}

export function listEnabledCompanies() {
  return Company.find({ enabled: true }).sort({ priority: -1, companyName: 1 }).lean();
}
