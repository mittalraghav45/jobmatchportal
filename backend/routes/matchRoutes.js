import express from 'express';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';
import { matchJobToProfile, loadCandidateProfile } from '../profileMatching.js';
import { analyseJob, scoreCandidateAgainstJob } from '../jobIntelligence.js';
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
      ? await Company.findOne({ companyId }).select('companyId companyName sponsorship website careersUrl ats').lean()
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
      sponsorship: company?.sponsorship || 'unknown',
      company: {
        website: company?.website || '',
        careersUrl: company?.careersUrl || '',
        ats: company?.ats || job.source?.ats || 'unknown'
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

    // Score the complete eligible pool before pagination. The previous
    // implementation paginated first, which meant page 1 was simply the
    // newest jobs rather than the best matches across the eligible pool.
    const cursor = Job.find(filter)
      .select({
        fingerprint: 1, companyId: 1, companyName: 1, title: 1, description: 1,
        location: 1, nation: 1, employmentType: 1, source: 1, dates: 1, status: 1
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

    // Keep only the best page*limit results in memory. This preserves global
    // ranking without retaining every scored match after it falls outside the
    // requested page window.
    const topMatches = [];
    for (const job of jobs) {
      const company = companyMap.get(String(job.companyId));
      const analysis = analyseJob({
        title: job.title || '',
        description: job.description || '',
        location: job.location,
        employmentType: job.employmentType,
        source: job.source?.url || '',
        ats: job.source?.ats,
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
          url: job.source?.url || '',
          applicationUrl: job.source?.url || '',
          ats: job.source?.ats || company?.ats || 'unknown',
          postedAt: job.dates?.postedAt || null,
          closingAt: job.dates?.closingAt || null,
          isLive: job.status?.isLive !== false
        },
        sponsorship: company?.sponsorship || 'unknown',
        company: {
          website: company?.website || '',
          careersUrl: company?.careersUrl || '',
          ats: company?.ats || job.source?.ats || 'unknown'
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
