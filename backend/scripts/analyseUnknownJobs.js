import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';

dotenv.config();

await connectMongo();

const rows = await Job.aggregate([
  { $match: { 'verification.status': 'unknown' } },
  {
    $group: {
      _id: {
        ats: '$source.ats',
        reason: '$verification.evidenceType'
      },
      count: { $sum: 1 }
    }
  },
  { $sort: { count: -1 } }
]);

console.log(JSON.stringify(rows, null, 2));
await mongoose.disconnect();
