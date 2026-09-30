import express from 'express';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';

const router = express.Router();

function parseBoolean(value) {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', async (req, res) => {
  try {
    await connectMongo();

    const page = clampInteger(req.query.page, 1, 1, 100000);
    const limit = clampInteger(req.query.limit, 25, 1, 100);
    const filter = {};

    if (req.query.company) filter.companyId = String(req.query.company).trim().toLowerCase();
    if (req.query.ats) filter['source.ats'] = String(req.query.ats).trim().toLowerCase();
    if (req.query.location) filter.location = { $regex: escapeRegex(req.query.location), $options: 'i' };
    if (req.query.employmentType) filter.employmentType = String(req.query.employmentType).trim();

    const live = parseBoolean(req.query.live);
    if (live === null) return res.status(400).json({ error: 'live must be true or false' });
    if (live !== undefined) filter['status.isLive'] = live;

    if (req.query.q) {
      const search = escapeRegex(String(req.query.q).trim());
      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { location: { $regex: search, $options: 'i' } }
        ];
      }
    }

    const sort = req.query.sort === 'oldest'
      ? { 'dates.lastSeenAt': 1 }
      : req.query.sort === 'posted'
        ? { 'dates.postedAt': -1, 'dates.lastSeenAt': -1 }
        : { 'dates.lastSeenAt': -1 };

    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Job.countDocuments(filter)
    ]);

    return res.json({
      jobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Jobs list error:', error.message);
    return res.status(503).json({ error: 'Unable to query jobs', message: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    await connectMongo();
    const [total, live, companies] = await Promise.all([
      Job.countDocuments(),
      Job.countDocuments({ 'status.isLive': true }),
      Job.distinct('companyId')
    ]);

    return res.json({
      total,
      live,
      closed: total - live,
      companies: companies.length
    });
  } catch (error) {
    console.error('Jobs stats error:', error.message);
    return res.status(503).json({ error: 'Unable to query job statistics', message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await connectMongo();
    const id = String(req.params.id).trim();
    if (!id) return res.status(400).json({ error: 'job id required' });

    const job = await Job.findOne({
      $or: [{ fingerprint: id }, { externalId: id }]
    }).lean();

    if (!job) return res.status(404).json({ error: 'Job not found' });
    return res.json({ job });
  } catch (error) {
    console.error('Job detail error:', error.message);
    return res.status(503).json({ error: 'Unable to query job', message: error.message });
  }
});

export default router;
