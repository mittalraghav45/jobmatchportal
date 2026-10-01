import express from 'express';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';

const router = express.Router();
const CHECKPOINT_COLLECTION = 'golden_discovery_checkpoints';

router.get('/status', async (req, res) => {
  try {
    await connectMongo();
    const runId = String(req.query.runId || process.env.GOLDEN_RUN_ID || 'golden-full-v1').trim();
    if (!runId) return res.status(400).json({ error: 'runId is required' });

    const collection = mongoose.connection.db.collection(CHECKPOINT_COLLECTION);
    const [companyTotal, processed, grouped] = await Promise.all([
      Company.countDocuments({ enabled: true }),
      collection.countDocuments({ runId }),
      collection.aggregate([
        { $match: { runId } },
        { $group: {
          _id: '$status',
          companies: { $sum: 1 },
          jobsDiscovered: { $sum: { $ifNull: ['$jobsDiscovered', 0] } },
          jobsAdded: { $sum: { $ifNull: ['$jobsAdded', 0] } },
          jobsUpdated: { $sum: { $ifNull: ['$jobsUpdated', 0] } },
          duplicatesRemoved: { $sum: { $ifNull: ['$duplicatesRemoved', 0] } },
          rejected: { $sum: { $ifNull: ['$rejected', 0] } }
        } }
      ]).toArray()
    ]);

    const byStatus = Object.fromEntries(grouped.map(row => [row._id || 'unknown', {
      companies: row.companies,
      jobsDiscovered: row.jobsDiscovered,
      jobsAdded: row.jobsAdded,
      jobsUpdated: row.jobsUpdated,
      duplicatesRemoved: row.duplicatesRemoved,
      rejected: row.rejected
    }]));

    const completed = Number(byStatus.completed?.companies || 0);
    const unresolved = Number(byStatus.unresolved?.companies || 0);
    const invalid = Number(byStatus.invalid?.companies || 0);
    const failed = Number(byStatus.failed?.companies || 0);

    return res.json({
      runId,
      companyTotal,
      processed,
      remaining: Math.max(companyTotal - processed, 0),
      progressPercent: companyTotal ? Number(((processed / companyTotal) * 100).toFixed(2)) : 0,
      resolvedSuccessful: completed,
      unresolved,
      invalid,
      failed,
      jobsDiscovered: grouped.reduce((sum, row) => sum + Number(row.jobsDiscovered || 0), 0),
      jobsAdded: grouped.reduce((sum, row) => sum + Number(row.jobsAdded || 0), 0),
      jobsUpdated: grouped.reduce((sum, row) => sum + Number(row.jobsUpdated || 0), 0),
      duplicatesRemoved: grouped.reduce((sum, row) => sum + Number(row.duplicatesRemoved || 0), 0),
      rejected: grouped.reduce((sum, row) => sum + Number(row.rejected || 0), 0),
      byStatus,
      checkpointCollection: CHECKPOINT_COLLECTION,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Discovery status error:', error.message);
    return res.status(503).json({ error: 'Unable to read discovery status', message: error.message });
  }
});

export default router;
