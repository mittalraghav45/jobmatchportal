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
        ats: {
          $ifNull: [
            { $getField: { field: 'name', input: '$source.ats' } },
            { $ifNull: [
              { $getField: { field: 'provider', input: '$source.ats' } },
              { $ifNull: [
                { $getField: { field: 'type', input: '$source.ats' } },
                'unknown'
              ] }
            ] }
          ]
        },
        reason: '$verification.evidenceType',
        httpStatus: '$verification.httpStatus',
        sourceHost: {
          $regexFind: {
            input: { $ifNull: ['$verification.sourceUrl', '$source.url'] },
            regex: '^https?://([^/]+)'
          }
        },
        finalHost: {
          $regexFind: {
            input: '$verification.finalUrl',
            regex: '^https?://([^/]+)'
          }
        }
      },
      count: { $sum: 1 }
    }
  },
  {
    $project: {
      _id: 0,
      ats: '$_id.ats',
      reason: '$_id.reason',
      httpStatus: '$_id.httpStatus',
      sourceHost: { $arrayElemAt: ['$_id.sourceHost.captures', 0] },
      finalHost: { $arrayElemAt: ['$_id.finalHost.captures', 0] },
      count: 1
    }
  },
  { $sort: { count: -1 } }
]);

const totals = await Job.aggregate([
  { $match: { 'verification.status': 'unknown' } },
  { $group: { _id: '$verification.evidenceType', count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]);

console.log('=== UNKNOWN JOB TOTALS ===');
console.log(JSON.stringify(totals, null, 2));
console.log('\n=== UNKNOWN JOB BREAKDOWN ===');
console.log(JSON.stringify(rows, null, 2));

await mongoose.disconnect();
