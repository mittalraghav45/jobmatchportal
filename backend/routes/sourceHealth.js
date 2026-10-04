import express from 'express';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { buildSourceHealthSummary, normaliseStaleHours } from '../utils/sourceHealth.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    await connectMongo();
    const staleHours = normaliseStaleHours(req.query.staleHours, 24);
    const staleSince = new Date(Date.now() - staleHours * 60 * 60 * 1000);

    const [total, verification, processing, ats, staleLive, missingApplyUrl] = await Promise.all([
      Job.countDocuments({}),
      Job.aggregate([
        { $group: { _id: '$verification.status', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Job.aggregate([
        { $group: { _id: '$processing.status', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Job.aggregate([
        { $group: { _id: '$source.ats', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } }
      ]),
      Job.countDocuments({
        'status.isLive': true,
        'verification.status': 'live',
        'verification.checkedAt': { $lt: staleSince }
      }),
      Job.countDocuments({
        $or: [
          { applyUrl: { $exists: false } },
          { applyUrl: null },
          { applyUrl: '' }
        ]
      })
    ]);

    return res.json({
      ...buildSourceHealthSummary({ total, verification, processing, ats, staleLive, missingApplyUrl }),
      staleHours,
      staleSince: staleSince.toISOString(),
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Source health error:', error.message);
    return res.status(503).json({ error: 'Unable to read source health', message: error.message });
  }
});

export default router;
