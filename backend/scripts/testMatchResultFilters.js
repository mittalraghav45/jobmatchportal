import 'dotenv/config';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { listPersistedMatches } from '../services/matchPersistence.js';
import { VALID_EMPLOYER_TYPES, VALID_NATIONS } from '../utils/matchResultFilters.js';

const profileId = process.env.MATCH_PROFILE_ID || 'default';

async function checkFilter(name, filter) {
  const result = await listPersistedMatches({
    profileId,
    page: 1,
    limit: 100,
    minimumScore: 0,
    ...filter
  });

  for (const match of result.matches) {
    const job = match.job || {};
    if (filter.employerType && job.employerType !== filter.employerType) {
      throw new Error(`${name}: returned employerType=${job.employerType}, expected ${filter.employerType}`);
    }
    if (filter.nation && job.nation !== filter.nation) {
      throw new Error(`${name}: returned nation=${job.nation}, expected ${filter.nation}`);
    }
  }

  console.log(JSON.stringify({
    name,
    filter,
    total: result.total,
    returned: result.matches.length,
    passed: true
  }));
  return result;
}

async function main() {
  await connectMongo();

  await checkFilter('all', {});
  for (const employerType of VALID_EMPLOYER_TYPES) {
    await checkFilter(`employer:${employerType}`, { employerType });
  }
  for (const nation of VALID_NATIONS) {
    await checkFilter(`nation:${nation}`, { nation });
  }
  await checkFilter('combined:councils:England', { employerType: 'councils', nation: 'England' });
  await checkFilter('combined:universities:Scotland', { employerType: 'universities', nation: 'Scotland' });
  await checkFilter('combined:nhs:Wales', { employerType: 'nhs', nation: 'Wales' });
  await checkFilter('combined:dwp:Northern Ireland', { employerType: 'dwp', nation: 'Northern Ireland' });

  console.log('MATCH RESULT FILTER TEST: PASS');
  await mongoose.connection.close();
}

main().catch(async error => {
  console.error(`MATCH RESULT FILTER TEST FAILED: ${error.message}`);
  try { await mongoose.connection.close(); } catch {}
  process.exit(1);
});
