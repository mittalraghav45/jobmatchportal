import express from 'express';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { CandidateProfile } from '../models/CandidateProfile.js';
import { analyseJob, scoreCandidateAgainstJob } from '../jobIntelligence.js';
import { evaluateSponsorship } from '../sponsorRegistry.js';
import { getRecommendation } from '../cvJobMatcher.js';

const router = express.Router();

function buildMatch(profile, job) {
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

  const sponsorship = evaluateSponsorship(job.sponsorship || {});
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

router.post('/', async (req, res) => {
  try {
    let profile = req.body?.profile;
    let job = req.body?.job;

    if (req.body?.profileId || req.body?.jobId) {
      await connectMongo();
      if (req.body.profileId) {
        profile = await CandidateProfile.findOne({ profileId: String(req.body.profileId) }).lean();
        if (!profile) return res.status(404).json({ error: 'Candidate profile not found' });
      }
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
    return res.status(400).json({ error: 'Unable to calculate match', message: error.message });
  }
});

export default router;
