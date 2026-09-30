import express from 'express';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';
import { ukJobMongoFilter } from '../utils/ukJobLocation.js';

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

function applySponsorshipFilter(filter, value) {
  if (value === undefined || value === '') return;
  const sponsorship = String(value).trim().toLowerCase();
  if (!['verified', 'not-sponsor', 'unknown'].includes(sponsorship)) {
    const error = new Error('sponsorship must be verified, not-sponsor, or unknown');
    error.code = 'INVALID_SPONSORSHIP_FILTER';
    throw error;
  }
  filter.$and.push({ companySponsorship: sponsorship });
}

async function enrichJobs(jobs) {
  const companyIds = [...new Set(jobs.map(job => String(job.companyId || '').trim()).filter(Boolean))];
  if (!companyIds.length) return jobs;

  const companies = await Company.find({ companyId: { $in: companyIds } })
    .select({ companyId: 1, companyName: 1, sponsorship: 1, careersUrl: 1, metadata: 1 })
    .lean();
  const byId = new Map(companies.map(company => [String(company.companyId), company]));

  return jobs.map(job => {
    const company = byId.get(String(job.companyId || ''));
    return {
      ...job,
      companyName: company?.companyName || 'Unknown company',
      sponsorship: company?.sponsorship || 'unknown',
      company: company ? {
        id: company.companyId,
        name: company.companyName,
        sponsorship: company.sponsorship,
        careersUrl: company.careersUrl
      } : null
    };
  });
}

async function resolveCompanySponsorshipFilter(filter) {
  const sponsorship = filter.$and.find(condition => condition.companySponsorship)?.companySponsorship;
  if (!sponsorship) return;

  delete filter.$and.find(condition => condition.companySponsorship).companySponsorship;
  filter.$and = filter.$and.filter(condition => !condition.companySponsorship);

  const companies = await Company.find({ sponsorship })
    .select({ companyId: 1 })
    .lean();
  filter.companyId = { $in: companies.map(company => String(company.companyId)) };
}

router.get('/', async (req, res) => {
  try {
    await connectMongo();

    const page = clampInteger(req.query.page, 1, 1, 100000);
    const limit = clampInteger(req.query.limit, 25, 1, 100);
    const filter = { $and: [ukJobMongoFilter()] };

    if (req.query.company) filter.companyId = String(req.query.company).trim().toLowerCase();
    if (req.query.ats) filter['source.ats'] = String(req.query.ats).trim().toLowerCase();
    if (req.query.location) filter.location = { $regex: escapeRegex(req.query.location), $options: 'i' };
    if (req.query.employmentType) filter.employmentType = String(req.query.employmentType).trim();
    applySponsorshipFilter(filter, req.query.sponsorship);
    await resolveCompanySponsorshipFilter(filter);

    const live = parseBoolean(req.query.live);
    if (live === null) return res.status(400).json({ error: 'live must be true or false' });
    if (live !== undefined) filter['status.isLive'] = live;

    if (req.query.q) {
      const search = escapeRegex(String(req.query.q).trim());
      if (search) {
        filter.$and.push({
          $or: [
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { location: { $regex: search, $options: 'i' } }
          ]
        });
      }
    }

    const sort = req.query.sort === 'oldest'
      ? { 'dates.lastSeenAt': 1 }
      : req.query.sort === 'posted'
        ? { 'dates.postedAt': -1, 'dates.lastSeenAt': -1 }
        : { 'dates.lastSeenAt': -1 };

    const [rawJobs, total] = await Promise.all([
      Job.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Job.countDocuments(filter)
    ]);

    const jobs = await enrichJobs(rawJobs);

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
    if (error.code === 'INVALID_SPONSORSHIP_FILTER') {
      return res.status(400).json({ error: error.message });
    }
    return res.status(503).json({ error: 'Unable to query jobs', message: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    await connectMongo();
    const ukFilter = ukJobMongoFilter();
    const [total, live, companies] = await Promise.all([
      Job.countDocuments(ukFilter),
      Job.countDocuments({ $and: [ukFilter, { 'status.isLive': true }] }),
      Job.distinct('companyId', ukFilter)
    ]);

    return res.json({
      total,
      live,
      closed: total - live,
      companies: companies.length,
      market: 'United Kingdom'
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
      $and: [
        { $or: [{ fingerprint: id }, { externalId: id }] },
        ukJobMongoFilter()
      ]
    }).lean();

    if (!job) return res.status(404).json({ error: 'UK job not found' });
    const [enriched] = await enrichJobs([job]);
    return res.json({ job: enriched });
  } catch (error) {
    console.error('Job detail error:', error.message);
    return res.status(503).json({ error: 'Unable to query job', message: error.message });
  }
});

export default router;
