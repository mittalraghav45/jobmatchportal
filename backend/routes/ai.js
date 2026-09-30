import express from 'express';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Job } from '../models/Job.js';
import { CandidateProfile } from '../models/CandidateProfile.js';
import { generateJobInsight } from '../services/openaiJobInsight.js';
import { analyseJob, scoreCandidateAgainstJob } from '../jobIntelligence.js';
import { evaluateSponsorship } from '../sponsorRegistry.js';

const router = express.Router();

router.post('/job-insight', async (req, res) => {
  try {
    await connectMongo();

    let profile = req.body?.profile || null;
    let job = req.body?.job || null;

    if (req.body?.profileId) {
      profile = await CandidateProfile.findOne({ profileId: String(req.body.profileId) }).lean();
      if (!profile) return res.status(404).json({ error: `Candidate profile '${req.body.profileId}' not found` });
    }

    if (req.body?.jobId) {
      const jobId = String(req.body.jobId);
      const lookup = [
        { fingerprint: jobId },
        { externalId: jobId }
      ];
      if (mongoose.isValidObjectId(jobId)) lookup.push({ _id: new mongoose.Types.ObjectId(jobId) });

      job = await Job.findOne({ $or: lookup }).lean();
      if (!job) return res.status(404).json({ error: 'Job not found', jobId });
    }

    if (!profile || !job) {
      return res.status(400).json({ error: 'profile/profileId and job/jobId are required' });
    }

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
    const match = {
      score: candidateScore.score,
      matchedSkills: candidateScore.matchedSkills,
      missingSkills: candidateScore.missingSkills,
      components: candidateScore.components,
      seniority: analysis.seniority,
      sponsorship
    };

    const insight = await generateJobInsight({ job, profile, match });
    return res.json({ insight, match });
  } catch (error) {
    console.error('OpenAI job insight error:', error.message);
    return res.status(400).json({ error: 'Unable to generate AI job insight', message: error.message });
  }
});

export default router;
