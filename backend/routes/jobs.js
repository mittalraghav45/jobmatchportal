import express from 'express';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';
import { ukJobMongoFilter } from '../utils/ukJobLocation.js';
import { techJobMongoFilter } from '../utils/techJobRole.js';

const router = express.Router();

const NATION_PATTERNS = {
  Scotland: 'scotland|edinburgh|glasgow|aberdeen|dundee|stirling|inverness|perth|falkirk|paisley|livingston|hamilton|motherwell|cumbernauld|east kilbride|kilmarnock|ayr|coatbridge|greenock',
  Wales: 'wales|cardiff|swansea|newport|wrexham|bangor|aberystwyth|llanelli|bridgend|neath|caerphilly|merthyr|pontypridd|port talbot|cwmbran',
  'Northern Ireland': 'northern ireland|belfast|derry|londonderry|lisburn|newry|armagh|craigavon|newtownabbey|carrickfergus|antrim|newtownards|omagh|coleraine',
  England: 'england|london|southampton|manchester|birmingham|bristol|leeds|liverpool|sheffield|nottingham|newcastle|reading|oxford|cambridge|brighton|bath|exeter|portsmouth|coventry|leicester|hull|york|milton keynes|luton|watford|guildford|winchester|chester|derby|norwich|plymouth|swindon|slough|croydon|hounslow|watford'
};

const EMPLOYER_PATTERNS = {
  councils: 'council|borough council|city council|county council|district council|metropolitan borough|unitary authority|local authority|local government',
  universities: 'university|universities|higher education|institute of technology|university of|college',
  dwp: '^department for work and pensions$|department for work and pensions|dwp',
  nhs: '(^|\\s)nhs($|\\s)|nhs trust|nhs foundation trust|health board|health and social care|nhs scotland|nhs england|nhs wales|nhs northern ireland'
};

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

async function resolveSponsorshipCompanyIds(value) {
  if (value === undefined || value === '') return null;
  const sponsorship = String(value).trim().toLowerCase();
  if (!['verified', 'not-sponsor', 'unknown'].includes(sponsorship)) {
    const error = new Error('sponsorship must be verified, not-sponsor, or unknown');
    error.code = 'INVALID_SPONSORSHIP_FILTER';
    throw error;
  }
  const companies = await Company.find({ sponsorship }).select({ companyId: 1 }).lean();
  return companies.map(company => String(company.companyId));
}

async function resolveEmployerCompanyIds(value) {
  if (value === undefined || value === '' || String(value).toLowerCase() === 'all') return null;
  const key = String(value).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(EMPLOYER_PATTERNS, key)) {
    const error = new Error('employerType must be all, councils, universities, dwp, or nhs');
    error.code = 'INVALID_EMPLOYER_TYPE';
    throw error;
  }
  const pattern = EMPLOYER_PATTERNS[key];
  const regex = new RegExp(pattern, 'i');
  const companies = await Company.find({
    $or: [
      { companyName: regex },
      { 'metadata.industry': regex },
      { 'metadata.category': regex },
      { 'metadata.organisationType': regex },
      { 'metadata.organizationType': regex },
      { 'metadata.sector': regex }
    ]
  }).select({ companyId: 1 }).lean();
  return companies.map(company => String(company.companyId));
}

function addNationFilter(filter, nation) {
  if (nation === undefined || nation === '' || String(nation).toLowerCase() === 'all') return;
  const key = String(nation).trim();
  if (!Object.prototype.hasOwnProperty.call(NATION_PATTERNS, key)) {
    const error = new Error('nation must be all, England, Scotland, Wales, or Northern Ireland');
    error.code = 'INVALID_NATION_FILTER';
    throw error;
  }
  if (key === 'England') {
    const nonEngland = Object.entries(NATION_PATTERNS)
      .filter(([name]) => name !== 'England')
      .map(([, pattern]) => pattern)
      .join('|');
    filter.$and.push({ location: { $not: { $regex: nonEngland, $options: 'i' } } });
    return;
  }
  filter.$and.push({ location: { $regex: NATION_PATTERNS[key], $options: 'i' } });
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
        careersUrl: company.careersUrl,
        metadata: company.metadata || {}
      } : null
    };
  });
}

router.get('/', async (req, res) => {
  try {
    await connectMongo();
    const page = clampInteger(req.query.page, 1, 1, 100000);
    const limit = clampInteger(req.query.limit, 25, 1, 100);
    const filter = { $and: [ukJobMongoFilter(), techJobMongoFilter()] };

    if (req.query.company) filter.companyId = String(req.query.company).trim();
    if (req.query.ats) filter['source.ats'] = String(req.query.ats).trim().toLowerCase();
    if (req.query.location) filter.location = { $regex: escapeRegex(req.query.location), $options: 'i' };
    if (req.query.employmentType) filter.employmentType = String(req.query.employmentType).trim();

    addNationFilter(filter, req.query.nation);

    const sponsorshipCompanyIds = await resolveSponsorshipCompanyIds(req.query.sponsorship);
    const employerCompanyIds = await resolveEmployerCompanyIds(req.query.employerType);
    const companyIdSets = [sponsorshipCompanyIds, employerCompanyIds].filter(Boolean);
    if (companyIdSets.length) {
      const allowed = companyIdSets.reduce((acc, ids) => acc ? ids.filter(id => acc.includes(id)) : ids, null);
      if (!allowed.length) return res.json({ jobs: [], pagination: { page, limit, total: 0, pages: 0 }, market: 'United Kingdom', roleType: 'Technology' });
      if (filter.companyId) {
        const requested = String(filter.companyId);
        if (!allowed.includes(requested)) return res.json({ jobs: [], pagination: { page, limit, total: 0, pages: 0 }, market: 'United Kingdom', roleType: 'Technology' });
      } else {
        filter.companyId = { $in: allowed };
      }
    }

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
      Job.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
      Job.countDocuments(filter)
    ]);
    const jobs = await enrichJobs(rawJobs);
    return res.json({ jobs, pagination: { page, limit, total, pages: Math.ceil(total / limit) }, market: 'United Kingdom', roleType: 'Technology' });
  } catch (error) {
    console.error('Jobs list error:', error.message);
    if (['INVALID_SPONSORSHIP_FILTER', 'INVALID_EMPLOYER_TYPE', 'INVALID_NATION_FILTER'].includes(error.code)) return res.status(400).json({ error: error.message });
    return res.status(503).json({ error: 'Unable to query jobs', message: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    await connectMongo();
    const filter = { $and: [ukJobMongoFilter(), techJobMongoFilter()] };
    const [total, live, companies] = await Promise.all([Job.countDocuments(filter), Job.countDocuments({ $and: [filter, { 'status.isLive': true }] }), Job.distinct('companyId', filter)]);
    return res.json({ total, live, closed: total - live, companies: companies.length, market: 'United Kingdom', roleType: 'Technology' });
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
    const job = await Job.findOne({ $and: [{ $or: [{ fingerprint: id }, { externalId: id }] }, ukJobMongoFilter(), techJobMongoFilter()] }).lean();
    if (!job) return res.status(404).json({ error: 'UK technology job not found' });
    const [enriched] = await enrichJobs([job]);
    return res.json({ job: enriched });
  } catch (error) {
    console.error('Job detail error:', error.message);
    return res.status(503).json({ error: 'Unable to query job', message: error.message });
  }
});

export default router;
