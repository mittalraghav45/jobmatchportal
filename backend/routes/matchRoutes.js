import express from 'express';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';
import { matchJobToProfile } from '../profileMatching.js';
import { DEFAULT_PROFILE_ID } from '../models/CandidateProfile.js';
import { ukJobMongoFilter } from '../utils/ukJobLocation.js';
import { techJobMongoFilter } from '../utils/techJobRole.js';

const router = express.Router();

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

// Single-job endpoint used by the existing frontend match modal.
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
      ? await Company.findOne({ companyId }).select('companyId companyName sponsorship').lean()
      : null;

    const result = await matchJobToProfile({
      profileId,
      job: {
        ...job,
        companyName: company?.companyName || job.companyName || '',
        postedAt: job.postedAt || job.dates?.postedAt,
        closingAt: job.closingAt || job.dates?.closingAt,
        ats: job.ats || job.source?.ats,
        source: job.source?.url || job.source || ''
      }
    });

    return res.json({
      profileId,
      job: result.job,
      analysis: result.analysis,
      candidateScore: result.candidateScore,
      match: {
        score: result.candidateScore.score,
        matchedSkills: result.candidateScore.matchedSkills,
        missingSkills: result.candidateScore.missingSkills,
        components: result.candidateScore.components
      },
      sponsorship: company?.sponsorship || 'unknown'
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
    const skip = (page - 1) * limit;
    const sponsorship = resolveSponsorship(req.body?.sponsorship);
    const sponsorshipCompanyIds = await companyIdsForSponsorship(sponsorship);

    const filter = {
      $and: [
        { 'status.isLive': { $ne: false } },
        ukJobMongoFilter(),
        techJobMongoFilter()
      ]
    };
    if (sponsorshipCompanyIds) {
      filter.companyId = { $in: sponsorshipCompanyIds };
    }

    const [jobs, total] = await Promise.all([
      Job.find(filter).sort({ 'dates.lastSeenAt': -1, _id: -1 }).skip(skip).limit(limit).lean(),
      Job.countDocuments(filter)
    ]);

    const companyIds = [...new Set(jobs.map(job => String(job.companyId)).filter(Boolean))];
    const companies = await Company.find({ companyId: { $in: companyIds } })
      .select('companyId companyName sponsorship')
      .lean();
    const companyMap = new Map(companies.map(company => [String(company.companyId), company]));

    const matches = [];
    for (const job of jobs) {
      const company = companyMap.get(String(job.companyId));
      const result = await matchJobToProfile({ profileId, job: {
        ...job,
        companyName: company?.companyName || '',
        postedAt: job.dates?.postedAt,
        closingAt: job.dates?.closingAt,
        ats: job.source?.ats,
        source: job.source?.url
      }});

      matches.push({
        job: {
          id: String(job._id),
          companyId: job.companyId,
          companyName: company?.companyName || 'Unknown company',
          title: job.title,
          location: job.location,
          employmentType: job.employmentType,
          url: job.source?.url || '',
          ats: job.source?.ats || 'unknown',
          isLive: job.status?.isLive !== false
        },
        sponsorship: company?.sponsorship || 'unknown',
        ...result
      });
    }

    matches.sort((a, b) => Number(b.candidateScore?.score || 0) - Number(a.candidateScore?.score || 0));

    return res.json({
      profileId,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      matches,
      market: 'United Kingdom',
      roleType: 'Technology',
      sponsorshipFilter: sponsorship || 'all'
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

export default router;
