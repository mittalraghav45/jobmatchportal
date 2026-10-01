import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectMongo, disconnectMongo } from '../db/mongoose.js';

const result = dotenv.config({ path: new URL('../.env', import.meta.url) });
if (result.error && result.error.code !== 'ENOENT') throw result.error;

try {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing. Check backend/.env.');
  }

  const connection = await connectMongo();
  const database = connection.name;
  const expected = process.env.MONGODB_DB_NAME || 'jobmatchportal';

  console.log('MongoDB connection successful');
  console.log(`Database: ${database}`);
  console.log(`Expected database: ${expected}`);
  console.log(`Mongoose state: ${connection.readyState === 1 ? 'connected' : 'not-connected'}`);

  if (database !== expected) {
    throw new Error(`Connected to unexpected database "${database}". Expected "${expected}".`);
  }

  await disconnectMongo();
  console.log('MongoDB connection closed');
} catch (error) {
  console.error('MongoDB check failed:', error.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
}
