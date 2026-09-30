import express from 'express';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';
import { matchJobToProfile } from '../profileMatching.js';
import { DEFAULT_PROFILE_ID } from '../models/CandidateProfile.js';

const router = express.Router();

router.post('/jobs', async (req, res) => {
  try {
    const profileId = String(req.body?.profileId || DEFAULT_PROFILE_ID).trim() || DEFAULT_PROFILE_ID;
    const page = Math.max(1, Number(req.body?.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.body?.limit || 20)));
    const skip = (page - 1) * limit;

    const filter = { 'status.isLive': { $ne: false } };
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
      matches
    });
  } catch (error) {
    if (error.code === 'PROFILE_NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    console.error('Bulk matching error:', error);
    return res.status(503).json({ error: 'Bulk job matching unavailable', detail: error.message });
  }
});

export default router;
