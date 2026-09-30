import express from 'express';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { CandidateProfile } from '../models/CandidateProfile.js';
import { analyseJob, scoreCandidateAgainstJob } from '../jobIntelligence.js';
import { evaluateSponsorship } from '../sponsorRegistry.js';
import { getRecommendation } from '../cvJobMatcher.js';

const router = express.Router();

function buildMatch(profile, job, sponsorshipOverride = null) {
  const analysis = analyseJob({
    title: job.title,
    description: job.description || '',
    location: job.location,
    employmentType: job.employmentType,
    source: job.source?.url || job.source,
    ats: job.source?.ats || job.ats,
    postedAt: job.dates?.postedAt || job.postedAt,
    closingAt: job.dates?.closingAt || job.closingAt
  });

  const candidateScore = scoreCandidateAgainstJob({
    cvSkills: profile.skills || [],
    yearsExperience: profile.yearsExperience || 0,
    cvText: profile.cvText || '',
    job: analysis
  });

  const sponsorship = evaluateSponsorship(sponsorshipOverride || job.sponsorship || {});
  const recommendation = getRecommendation(
    candidateScore.score,
    job.status?.isLive !== false,
    analysis.closingAt,
    sponsorship.decision === 'not-sponsor' ? false : null
  );

  return {
    score: candidateScore.score,
    matchedSkills: candidateScore.matchedSkills,
    missingSkills: candidateScore.missingSkills,
    components: candidateScore.components,
    seniority: analysis.seniority,
    sponsorship,
    recommendation,
    analysedJob: analysis
  };
}

async function resolveProfile(body) {
  if (body?.profile) return body.profile;
  if (body?.profileId) {
    const profile = await CandidateProfile.findOne({ profileId: String(body.profileId) }).lean();
    if (!profile) throw Object.assign(new Error('Candidate profile not found'), { statusCode: 404 });
    return profile;
  }
  throw Object.assign(new Error('profile or profileId is required'), { statusCode: 400 });
}

router.post('/', async (req, res) => {
  try {
    let profile = req.body?.profile;
    let job = req.body?.job;

    if (req.body?.profileId || req.body?.jobId) {
      await connectMongo();
      if (req.body.profileId) profile = await resolveProfile(req.body);
      if (req.body.jobId) {
        job = await Job.findOne({
          $or: [{ fingerprint: String(req.body.jobId) }, { externalId: String(req.body.jobId) }]
        }).lean();
        if (!job) return res.status(404).json({ error: 'Job not found' });
      }
    }

    if (!profile || !job) {
      return res.status(400).json({ error: 'profile and job are required, or provide profileId and jobId' });
    }

    return res.json({ match: buildMatch(profile, job) });
  } catch (error) {
    console.error('Match error:', error.message);
    return res.status(error.statusCode || 400).json({ error: 'Unable to calculate match', message: error.message });
  }
});

// Score a candidate against a page of real MongoDB jobs in one request.
// This is intentionally bounded to keep the endpoint responsive.
router.post('/jobs', async (req, res) => {
  try {
    await connectMongo();
    const profile = await resolveProfile(req.body || {});
    const requestedLimit = Number(req.body?.limit ?? 50);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), 100);
    const requestedPage = Number(req.body?.page ?? 1);
    const page = Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1);
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      Job.find({}).sort({ 'dates.postedAt': -1, postedAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      Job.countDocuments({})
    ]);

    const companyIds = [...new Set(jobs.map(job => String(job.companyId || '')).filter(Boolean))];
    const { Company } = await import('../models/Company.js');
    const companies = await Company.find({ companyId: { $in: companyIds } }).select('companyId companyName sponsorship').lean();
    const companyMap = new Map(companies.map(company => [String(company.companyId), company]));

    const matches = jobs.map(job => {
      const company = companyMap.get(String(job.companyId || ''));
      const match = buildMatch(profile, job, company?.sponsorship || null);
      return {
        job,
        companyName: company?.companyName || job.companyName || 'Unknown company',
        match
      };
    }).sort((a, b) => b.match.score - a.match.score);

    return res.json({
      profile: { profileId: profile.profileId || null, name: profile.name || '' },
      matches,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Bulk match error:', error.message);
    return res.status(error.statusCode || 400).json({ error: 'Unable to calculate job matches', message: error.message });
  }
});

export default router;
