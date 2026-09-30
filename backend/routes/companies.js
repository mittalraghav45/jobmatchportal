import express from 'express';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';

const router = express.Router();

router.get('/count', async (req, res) => {
  try {
    await connectMongo();
    const total = await Company.countDocuments({});
    res.json({ total });
  } catch (error) {
    res.status(503).json({ error: 'Unable to count companies', message: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    await connectMongo();

    const filter = {};
    if (req.query.enabled !== undefined) filter.enabled = req.query.enabled === 'true';
    if (req.query.ats) filter.ats = String(req.query.ats).trim().toLowerCase();
    if (req.query.sponsorship) filter.sponsorship = String(req.query.sponsorship).trim().toLowerCase();
    if (req.query.q) {
      const query = String(req.query.q).trim();
      if (query) {
        filter.$or = [
          { companyName: { $regex: query, $options: 'i' } },
          { companyId: { $regex: query, $options: 'i' } },
          { companyNumber: { $regex: query, $options: 'i' } }
        ];
      }
    }

    const total = await Company.countDocuments(filter);
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 50;
    const requestedPage = Number.parseInt(req.query.page, 10);
    const page = Number.isFinite(requestedPage) ? Math.max(requestedPage, 1) : 1;
    const skip = (page - 1) * limit;

    const companies = await Company.find(filter)
      .sort({ priority: -1, companyName: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({ companies, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(503).json({ error: 'Unable to query companies', message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await connectMongo();
    const company = await Company.findOne({ companyId: String(req.params.id) }).lean();
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json({ company });
  } catch (error) {
    res.status(503).json({ error: 'Unable to query company', message: error.message });
  }
});

export default router;
