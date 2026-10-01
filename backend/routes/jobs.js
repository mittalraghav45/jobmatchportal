import express from 'express';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';
import { ukJobMongoFilter } from '../utils/ukJobLocation.js';
import { techJobMongoFilter } from '../utils/techJobRole.js';
import { classifyJob } from '../utils/jobClassification.js';

const router = express.Router();

const NATION_PATTERNS = {
  Scotland: 'scotland|edinburgh|glasgow|aberdeen|dundee|stirling|inverness|perth|falkirk|paisley|livingston|hamilton|motherwell|cumbernauld|east kilbride|kilmarnock|ayr|coatbridge|greenock',
  Wales: 'wales|cardiff|swansea|newport|wrexham|bangor|aberystwyth|llanelli|bridgend|neath|caerphilly|merthyr|pontypridd|port talbot|cwmbran',
  'Northern Ireland': 'northern ireland|belfast|derry|londonderry|lisburn|newry|armagh|craigavon|newtownabbey|carrickfergus|antrim|newtownards|omagh|coleraine',
  England: 'england|london|southampton|manchester|birmingham|bristol|leeds|liverpool|sheffield|nottingham|newcastle|reading|oxford|cambridge|brighton|bath|exeter|portsmouth|coventry|leicester|hull|york|milton keynes|luton|watford|guildford|winchester|chester|derby|norwich|plymouth|swindon|slough|croydon|hounslow|bournemouth|canterbury|cheltenham|gloucester|ipswich|lincoln|middlesbrough|northampton|peterborough|preston|salisbury|stoke-on-trent|sunderland|wakefield|wolverhampton|worcester'
};

const FOREIGN_LOCATION_PATTERN = 'india|indonesia|pakistan|bangladesh|nepal|sri lanka|china|japan|singapore|malaysia|philippines|australia|new zealand|canada|united states|usa|u\\.s\\.a\\.|ireland|france|germany|spain|italy|portugal|netherlands|belgium|switzerland|sweden|norway|denmark|finland|poland|romania|bulgaria|ukraine|czech republic|czechia|south africa|nigeria|kenya|ghana|uae|united arab emirates|dubai';
const GENERIC_UK_LOCATION_PATTERN = '^\\s*(uk|u\\.k\\.|united kingdom|great britain|gb|remote(?:,|\\s|$)|hybrid(?:,|\\s|$)|remote uk|uk wide|uk-wide)\\s*$';

const EMPLOYER_TYPES = new Set(['all', 'councils', 'universities', 'dwp', 'nhs']);

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
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function parseList(value) { return value === undefined || value === null || value === '' ? [] : String(value).split(',').map(x => x.trim()).filter(Boolean); }

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

function addEmployerTypeFilter(filter, value) {
  const keys = parseList(value).map(x => x.toLowerCase());
  if (!keys.length || keys.includes('all')) return;
  for (const key of keys) {
    if (!EMPLOYER_TYPES.has(key)) {
      const error = new Error('employerType must be all, councils, universities, dwp, or nhs');
      error.code = 'INVALID_EMPLOYER_TYPE';
      throw error;
    }
  }
  // employerType is persisted on the Job document by the enrichment pipeline.
  // Query it directly instead of translating through companyId. This avoids
  // false zero-result filters when a feed's companyId does not match the
  // company registry identifier exactly.
  filter.$and.push({ employerType: { $in: keys } });
}

async function resolveNationCompanyIds(value) {
  const nations = parseList(value);
  if (!nations.length || nations.some(x => x.toLowerCase() === 'all')) return null;
  for (const key of nations) {
    if (!Object.prototype.hasOwnProperty.call(NATION_PATTERNS, key)) {
      const error = new Error('nation must be all, England, Scotland, Wales, or Northern Ireland');
      error.code = 'INVALID_NATION_FILTER';
      throw error;
    }
  }
  const ids = new Set();
  for (const key of nations) {
    const regex = new RegExp(NATION_PATTERNS[key], 'i');
    const companies = await Company.find({ $or: [
      { 'metadata.location': regex }, { 'metadata.address': regex }, { 'metadata.region': regex },
      { 'metadata.country': regex }, { 'metadata.city': regex }, { 'metadata.postcode': regex }
    ] }).select({ companyId: 1 }).lean();
    companies.forEach(company => ids.add(String(company.companyId)));
  }
  return [...ids];
}

function addNationFilter(filter, value, nationCompanyIds = null) {
  const nations = parseList(value);
  if (!nations.length || nations.some(x => x.toLowerCase() === 'all')) return;

  const nationRegexes = nations.map(key => NATION_PATTERNS[key]);
  const directLocationClauses = nationRegexes.map(pattern => ({
    $and: [
      { location: { $regex: pattern, $options: 'i' } },
      { location: { $not: { $regex: FOREIGN_LOCATION_PATTERN, $options: 'i' } } }
    ]
  }));

  const clauses = [{
    $and: [
      { nation: { $in: nations } },
      { location: { $not: { $regex: FOREIGN_LOCATION_PATTERN, $options: 'i' } } }
    ]
  }, ...directLocationClauses];

  if (nationCompanyIds?.length) {
    clauses.push({
      $and: [
        { companyId: { $in: nationCompanyIds } },
        { location: { $regex: GENERIC_UK_LOCATION_PATTERN, $options: 'i' } }
      ]
    });
  }

  filter.$and.push({ $or: clauses });
}

async function enrichJobs(jobs) {
  const companyIds = [...new Set(jobs.map(job => String(job.companyId || '').trim()).filter(Boolean))];
  if (!companyIds.length) return jobs;
  const companies = await Company.find({ companyId: { $in: companyIds } })
    .select({ companyId: 1, companyName: 1, companyNumber: 1, sponsorship: 1, employerType: 1, careersUrl: 1, metadata: 1 })
    .lean();
  const byId = new Map(companies.map(company => [String(company.companyId), company]));
  return jobs.map(job => {
    const company = byId.get(String(job.companyId || ''));
    const classification = classifyJob({ job, company, raw: job.raw || {} });
    return {
      ...job,
      nation: classification.nation,
      employerType: classification.employerType,
      classificationVersion: classification.classificationVersion,
      companyName: company?.companyName || 'Unknown company',
      sponsorship: company?.sponsorship || 'unknown',
      company: company ? { id: company.companyId, name: company.companyName, companyNumber: company.companyNumber, sponsorship: company.sponsorship, employerType: company.employerType || classification.employerType, careersUrl: company.careersUrl, metadata: company.metadata || {} } : null
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

    const nationCompanyIds = await resolveNationCompanyIds(req.query.nation);
    addNationFilter(filter, req.query.nation, nationCompanyIds);

    const sponsorshipCompanyIds = await resolveSponsorshipCompanyIds(req.query.sponsorship);
    addEmployerTypeFilter(filter, req.query.employerType);
    if (sponsorshipCompanyIds) filter.$and.push({ companyId: { $in: sponsorshipCompanyIds } });

    const live = parseBoolean(req.query.live);
    if (live === null) return res.status(400).json({ error: 'live must be true or false' });
    if (live !== undefined) filter['status.isLive'] = live;
    if (req.query.q) {
      const search = escapeRegex(String(req.query.q).trim());
      if (search) filter.$and.push({ $or: [{ title: { $regex: search, $options: 'i' } }, { description: { $regex: search, $options: 'i' } }, { location: { $regex: search, $options: 'i' } }] });
    }

    const sort = req.query.sort === 'oldest' ? { 'dates.lastSeenAt': 1 } : req.query.sort === 'posted' ? { 'dates.postedAt': -1, 'dates.lastSeenAt': -1 } : { 'dates.lastSeenAt': -1 };
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
    const [total, live, companies, byNation, byEmployer] = await Promise.all([
      Job.countDocuments(filter),
      Job.countDocuments({ $and: [filter, { 'status.isLive': true }] }),
      Job.distinct('companyId', filter),
      Job.aggregate([{ $match: filter }, { $group: { _id: '$nation', count: { $sum: 1 } } }]),
      Job.aggregate([{ $match: filter }, { $group: { _id: '$employerType', count: { $sum: 1 } } }])
    ]);
    return res.json({ total, live, closed: total - live, companies: companies.length, byNation, byEmployer, market: 'United Kingdom', roleType: 'Technology' });
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
