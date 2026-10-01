import dotenv from 'dotenv';
import { connectMongo, disconnectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';

dotenv.config();

async function main() {
  try {
    await connectMongo();

    const companies = await Company.find({
      employerType: { $in: ['nhs', 'councils', 'universities'] }
    })
      .select('companyId companyName employerType website careersUrl ats sponsorship metadata')
      .limit(30)
      .lean();

    console.log(`Found ${companies.length} public-sector companies`);
    console.log(JSON.stringify(companies, null, 2));
  } catch (error) {
    console.error('INSPECTION FAILED:', error);
    process.exitCode = 1;
  } finally {
    await disconnectMongo();
  }
}

main();
