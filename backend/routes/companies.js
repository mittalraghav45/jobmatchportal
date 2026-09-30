import express from 'express';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    await connectMongo();
    const filter = {};
    if (req.query.enabled !== undefined) filter.enabled = req.query.enabled === 'true';
    if (req.query.ats) filter.ats = String(req.query.ats).trim().toLowerCase();
    if (req.query.sponsorship) filter.sponsorship = String(req.query.sponsorship).trim().toLowerCase();
    if (req.query.q) filter.$or = [
      { companyName: { $regex: String(req.query.q), $options: 'i' } },
      { companyId: { $regex: String(req.query.q), $options: 'i' } }
    ];
    const companies = await Company.find(filter).sort({ priority: -1, companyName: 1 }).lean();
    res.json({ companies, total: companies.length });
  } catch (error) {
    res.status(503).json({ error: 'Unable to query companies', message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await connectMongo();
    const company = await Company.findOne({ companyId: String(req.params.id).toLowerCase() }).lean();
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json({ company });
  } catch (error) {
    res.status(503).json({ error: 'Unable to query company', message: error.message });
  }
});

export default router;
