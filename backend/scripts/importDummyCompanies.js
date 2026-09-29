import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectMongo, disconnectMongo } from '../db/mongoose.js';
import { importCompanies } from '../repositories/companyRepository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.join(__dirname, '..', 'config', 'dummy', 'companies.json');

const companies = JSON.parse(await fs.readFile(inputPath, 'utf8'));
await connectMongo();
try {
  const result = await importCompanies(companies);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await disconnectMongo();
}
