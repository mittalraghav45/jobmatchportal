import express from 'express';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';
import { matchJobToProfile, loadCandidateProfile } from '../profileMatching.js';
import { analyseJob, scoreCandidateAgainstJob } from '../jobIntelligence.js';
import { DEFAULT_PROFILE_ID } from '../models/CandidateProfile.js';
import { ukJobMongoFilter } from '../utils/ukJobLocation.js';
import { techJobMongoFilter } from '../utils/techJobRole.js';

const router = express.Router();

function normaliseAts(value, depth = 0) {
  if (depth > 4 || value === undefined || value === null || value === '') return 'unknown';
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    return text && text !== '[object Object]' ? text : 'unknown';
  }
  if (typeof value === 'object') {
    for (const key of ['ats', 'name', 'type', 'platform', 'provider', 'slug', 'id']) {
      const candidate = normaliseAts(value[key], depth + 1);
      if (candidate !== 'unknown') return candidate;
    }
  }
  return 'unknown';
}

function resolveAts(...values) {
  for (const value of values) {
    const ats = normaliseAts(value);
    if (ats !== 'unknown') return ats;
  }
  return 'unknown';
}

function resolveApplicationUrl(job) {
  const queue = [
    job?.applicationUrl,
    job?.application_url,
    job?.applyUrl,
    job?.apply_url,
    job?.atsUrl,
    job?.ats_url,
    job?.jobUrl,
    job?.job_url,
    job?.url,
    job?.source?.url,
    job?.source?.applicationUrl,
    job?.source?.application_url,
    job?.raw?.applicationUrl,
    job?.raw?.application_url,
    job?.raw?.applyUrl,
    job?.raw?.apply_url,
    job?.raw?.atsUrl,
    job?.raw?.ats_url,
    job?.raw?.jobUrl,
    job?.raw?.job_url,
    job?.raw?.url,
    job?.raw?.source
  ];
  const seen = new Set();

  while (queue.length) {
    const value = queue.shift();
    if (typeof value === 'string') {
      const url = value.trim();
      if (/^https?:\/\//i.test(url)) return url;
      continue;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    for (const key of ['applicationUrl', 'application_url', 'applyUrl', 'apply_url', 'atsUrl', 'ats_url', 'jobUrl', 'job_url', 'url']) {
      if (value[key] !== undefined) queue.push(value[key]);
    }
  }

  return '';
}

function resolveSponsorship(value) {
  if (value === undefined || value === '') return null;
  const sponsorship = String(value).trim().toLowerCase();
  if (!['verified', 'not-sponsor', 'unknown'].includes(sponsorship)) {
    const error = new Error('sponsorship must be verified, not-sponsor, or unknown');
    error.code = 'INVALID_SPONSORSHIP_FILTER';
    throw error;
  }
  return sponsorship;
}

async function companyIdsForSponsorship(sponsorship) {
  if (!sponsorship) return null;
  const companies = await Company.find({ sponsorship }).select('companyId').lean();
  return companies.map(company => String(company.companyId));
}

function compareRankedMatches(a, b) {
  const scoreDelta = Number(b.candidateScore?.score || 0) - Number(a.candidateScore?.score || 0);
  if (scoreDelta) return scoreDelta;

  const sponsorshipRank = { verified: 2, unknown: 1, 'not-sponsor': 0 };
  const sponsorshipDelta = (sponsorshipRank[b.sponsorship] || 0) - (sponsorshipRank[a.sponsorship] || 0);
  if (sponsorshipDelta) return sponsorshipDelta;

  const aDate = new Date(a.job?.postedAt || 0).getTime();
  const bDate = new Date(b.job?.postedAt || 0).getTime();
  if (bDate !== aDate) return bDate - aDate;

  return String(a.job?.id || '').localeCompare(String(b.job?.id || ''));
}

function addToTopMatches(topMatches, match, maxItems) {
  topMatches.push(match);
  topMatches.sort(compareRankedMatches);
  if (topMatches.length > maxItems) topMatches.pop();
}

router.post('/', async (req, res) => {
  try {
    const profileId = String(req.body?.profileId || DEFAULT_PROFILE_ID).trim() || DEFAULT_PROFILE_ID;
    let job = req.body?.job;

    if (!job && req.body?.jobId) {
      job = await Job.findById(req.body.jobId).lean();
      if (!job) return res.status(404).json({ error: 'Job not found' });
    }

    if (!job || typeof job !== 'object') {
      return res.status(400).json({ error: 'job or jobId is required' });
    }

    const companyId = String(job.companyId || '').trim();
    const company = companyId
      ? await Company.findOne({ companyId }).select('companyId companyName sponsorship website careersUrl ats').lean()
      : null;

    const ats = resolveAts(job.ats, job.source?.ats, company?.ats, job.raw?.ats, job.raw?.source?.ats, job.raw?.atsName, job.raw?.atsSlug);
    const applicationUrl = resolveApplicationUrl(job);
    const result = await matchJobToProfile({
      profileId,
      job: {
        ...job,
        companyName: company?.companyName || job.companyName || '',
        postedAt: job.postedAt || job.dates?.postedAt,
        closingAt: job.closingAt || job.dates?.closingAt,
        ats,
        source: applicationUrl
      }
    });

    return res.json({
      profileId,
      job: {
        ...result.job,
        ats: resolveAts(result.job?.ats, ats, job.raw?.ats, job.raw?.source?.ats),
        applicationUrl: resolveApplicationUrl(result.job) || applicationUrl
      },
      analysis: result.analysis,
      candidateScore: result.candidateScore,
      match: {
        score: result.candidateScore.score,
        matchedSkills: result.candidateScore.matchedSkills,
        missingSkills: result.candidateScore.missingSkills,
        components: result.candidateScore.components
      },
      sponsorship: company?.sponsorship || 'unknown',
      company: {
        website: company?.website || '',
        careersUrl: company?.careersUrl || '',
        ats: resolveAts(company?.ats, ats)
      }
    });
  } catch (error) {
    if (error.code === 'PROFILE_NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    console.error('Single-job matching error:', error);
    return res.status(503).json({ error: 'Job matching unavailable', detail: error.message });
  }
});

router.post('/jobs', async (req, res) => {
  try {
    const profileId = String(req.body?.profileId || DEFAULT_PROFILE_ID).trim() || DEFAULT_PROFILE_ID;
    const page = Math.max(1, Number(req.body?.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.body?.limit || 20)));
    const sponsorship = resolveSponsorship(req.body?.sponsorship);
    const sponsorshipCompanyIds = await companyIdsForSponsorship(sponsorship);
    const requiredTopMatches = page * limit;

    const filter = {
      $and: [
        { 'status.isLive': { $ne: false } },
        ukJobMongoFilter(),
        techJobMongoFilter()
      ]
    };
    if (sponsorshipCompanyIds) filter.companyId = { $in: sponsorshipCompanyIds };

    const [total, profile] = await Promise.all([
      Job.countDocuments(filter),
      loadCandidateProfile(profileId)
    ]);

    const cursor = Job.find(filter)
      .select({
        fingerprint: 1, companyId: 1, companyName: 1, title: 1, description: 1,
        location: 1, nation: 1, employmentType: 1, source: 1, dates: 1, status: 1, raw: 1
      })
      .lean()
      .cursor();

    const companyIds = new Set();
    const jobs = [];
    for await (const job of cursor) {
      jobs.push(job);
      if (job.companyId) companyIds.add(String(job.companyId));
    }

    const companies = await Company.find({ companyId: { $in: [...companyIds] } })
      .select('companyId companyName sponsorship website careersUrl ats')
      .lean();
    const companyMap = new Map(companies.map(company => [String(company.companyId), company]));

    const topMatches = [];
    for (const job of jobs) {
      const company = companyMap.get(String(job.companyId));
      const ats = resolveAts(job.source?.ats, company?.ats, job.raw?.ats, job.raw?.source?.ats, job.raw?.atsName, job.raw?.atsSlug);
      const applicationUrl = resolveApplicationUrl(job);
      const analysis = analyseJob({
        title: job.title || '',
        description: job.description || '',
        location: job.location,
        employmentType: job.employmentType,
        source: applicationUrl,
        ats,
        postedAt: job.dates?.postedAt,
        closingAt: job.dates?.closingAt
      });
      const candidateScore = scoreCandidateAgainstJob({
        cvSkills: Array.isArray(profile.skills) ? profile.skills : [],
        cvText: profile.cvText || '',
        yearsExperience: Number(profile.yearsExperience || 0),
        job: analysis
      });
      const match = {
        job: {
          id: String(job._id),
          companyId: job.companyId,
          companyName: company?.companyName || job.companyName || 'Unknown company',
          title: job.title,
          location: job.location,
          nation: job.nation,
          employmentType: job.employmentType,
          url: applicationUrl,
          applicationUrl,
          ats,
          postedAt: job.dates?.postedAt || null,
          closingAt: job.dates?.closingAt || null,
          isLive: job.status?.isLive !== false
        },
        sponsorship: company?.sponsorship || 'unknown',
        company: {
          website: company?.website || '',
          careersUrl: company?.careersUrl || '',
          ats: resolveAts(company?.ats, ats)
        },
        analysis,
        candidateScore,
        profileSnapshot: {
          name: profile.name || '',
          skills: profile.skills || [],
          yearsExperience: Number(profile.yearsExperience || 0)
        }
      };
      addToTopMatches(topMatches, match, requiredTopMatches);
    }

    const pageStart = (page - 1) * limit;
    const matches = topMatches.slice(pageStart, pageStart + limit);

    return res.json({
      profileId,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      matches,
      market: 'United Kingdom',
      roleType: 'Technology',
      sponsorshipFilter: sponsorship || 'all',
      ranking: {
        version: 'v2',
        strategy: 'global-score-then-paginate',
        tieBreakers: ['sponsorship', 'postedAt', 'jobId']
      }
    });
  } catch (error) {
    if (error.code === 'PROFILE_NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    if (error.code === 'INVALID_SPONSORSHIP_FILTER') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Bulk matching error:', error);
    return res.status(503).json({ error: 'Bulk job matching unavailable', detail: error.message });
  }
});

export { compareRankedMatches, addToTopMatches };
export default router;
