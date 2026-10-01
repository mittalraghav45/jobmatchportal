import dotenv from 'dotenv';
import { connectMongo, disconnectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';

dotenv.config();

function present(value) {
  return Boolean(String(value ?? '').trim());
}

async function main() {
  try {
    await connectMongo();

    const companies = await Company.find({
      employerType: { $in: ['nhs', 'councils', 'universities'] }
    })
      .select('companyId companyName employerType website careersUrl ats sponsorship')
      .sort({ employerType: 1, companyName: 1 })
      .limit(1000)
      .lean();

    const summary = {
      total: companies.length,
      withWebsite: companies.filter(c => present(c.website)).length,
      withCareersUrl: companies.filter(c => present(c.careersUrl)).length,
      withAts: companies.filter(c => present(c.ats) && c.ats !== 'unknown').length,
      byEmployerType: {
        nhs: companies.filter(c => c.employerType === 'nhs').length,
        councils: companies.filter(c => c.employerType === 'councils').length,
        universities: companies.filter(c => c.employerType === 'universities').length
      },
      sample: companies.slice(0, 30).map(c => ({
        companyId: c.companyId,
        companyName: c.companyName,
        employerType: c.employerType,
        website: c.website || '',
        careersUrl: c.careersUrl || '',
        ats: c.ats || 'unknown',
        sponsorship: c.sponsorship || 'unknown'
      }))
    };

    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error('INSPECTION FAILED:', error.message);
    process.exitCode = 1;
  } finally {
    await disconnectMongo();
  }
}

main();
