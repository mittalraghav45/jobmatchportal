import express from 'express';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { CandidateProfile } from '../models/CandidateProfile.js';
import { analyseJob, scoreCandidateAgainstJob } from '../jobIntelligence.js';
import { evaluateSponsorship } from '../sponsorRegistry.js';
import { getRecommendation } from '../cvJobMatcher.js';
import { buildVerifiedLiveMatchFilter } from '../utils/matchFilters.js';
import { calculateApplicationPriority } from '../utils/applicationPriority.js';
import { calculateApplicationReadiness } from '../utils/applicationReadiness.js';

const router = express.Router();

export function buildMatch(profile, job, sponsorshipOverride = null) {
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

  const sponsorship = evaluateSponsorship(sponsorshipOverride || job.sponsorship || {});
  const candidateScore = scoreCandidateAgainstJob({
    cvSkills: profile.skills || [],
    yearsExperience: profile.yearsExperience || 0,
    cvText: profile.cvText || '',
    job: analysis,
    sponsorshipStatus: sponsorship.decision
  });

  const recommendation = getRecommendation(
    candidateScore.score,
    job.status?.isLive !== false,
    analysis.closingAt,
    sponsorship.decision === 'not-sponsor' ? false : null
  );

  const applicationPriority = calculateApplicationPriority({
    matchScore: candidateScore.score,
    sponsorship: sponsorship.decision,
    seniorityLevel: analysis.seniority?.level,
    isLive: job.status?.isLive !== false,
    postedAt: analysis.postedAt,
    closingAt: analysis.closingAt,
    employerType: job.employerType || 'private'
  });

  const applicationReadiness = calculateApplicationReadiness({
    matchScore: candidateScore.score,
    applicationPriority,
    isLive: job.status?.isLive !== false,
    applyUrl: job.applyUrl || job.raw?.applyUrl || '',
    verificationStatus: job.verification?.status || '',
    sponsorship: sponsorship.decision,
    missingSkills: candidateScore.missingSkills,
    seniorityLevel: analysis.seniority?.level,
    closingAt: analysis.closingAt
  });

  return {
    score: candidateScore.score,
    matchedSkills: candidateScore.matchedSkills,
    missingSkills: candidateScore.missingSkills,
    components: candidateScore.components,
    seniority: analysis.seniority,
    sponsorship,
    recommendation,
    applicationPriority,
    applicationReadiness,
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

router.post('/jobs', async (req, res) => {
  try {
    await connectMongo();
    const profile = await resolveProfile(req.body || {});
    const requestedLimit = Number(req.body?.limit ?? 50);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), 100);
    const requestedPage = Number(req.body?.page ?? 1);
    const page = Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1);

    const filter = buildVerifiedLiveMatchFilter();
    const [jobs, total] = await Promise.all([
      Job.find(filter).sort({ 'dates.lastSeenAt': -1, 'dates.postedAt': -1, createdAt: -1 }).limit(1000).lean(),
      Job.countDocuments(filter)
    ]);

    const companyIds = [...new Set(jobs.map(job => String(job.companyId || '')).filter(Boolean))];
    const { Company } = await import('../models/Company.js');
    const companies = await Company.find({ companyId: { $in: companyIds }).select('companyId companyName sponsorship employerType').lean();
    const companyMap = new Map(companies.map(company => [String(company.companyId), company]));

    const matches = jobs.map(job => {
      const company = companyMap.get(String(job.companyId || ''));
      const enrichedJob = company?.employerType && !job.employerType ? { ...job, employerType: company.employerType } : job;
      const match = buildMatch(profile, enrichedJob, company?.sponsorship || null);
      return { job: enrichedJob, companyName: company?.companyName || job.companyName || 'Unknown company', match };
    }).sort((a, b) => {
      const priorityDelta = b.match.applicationPriority.score - a.match.applicationPriority.score;
      return priorityDelta || b.match.score - a.match.score;
    });

    const start = (page - 1) * limit;
    return res.json({
      profile: { profileId: profile.profileId || null, name: profile.name || '' },
      matches: matches.slice(start, start + limit),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Bulk match error:', error.message);
    return res.status(error.statusCode || 400).json({ error: 'Unable to calculate job matches', message: error.message });
  }
});

export default router;
