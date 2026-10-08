import express from 'express';
import mongoose from 'mongoose';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';
import { Application } from '../models/Application.js';
import { MatchResult } from '../models/MatchResult.js';
import { loadCandidateProfile, matchJobToProfile } from '../profileMatching.js';
import { DEFAULT_PROFILE_ID } from '../models/CandidateProfile.js';
import { buildVerifiedLiveMatchFilter } from '../utils/matchFilters.js';

const router = express.Router();
const MAX_DYNAMIC_MATCH_CANDIDATES = Math.max(500, Number(process.env.MATCH_DYNAMIC_CANDIDATE_LIMIT || 5000));

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
  const companies = await Company.find(sponsorship === 'unknown' ? { sponsorship: { $in: ['verified', 'not-sponsor'] } } : { sponsorship }).select('companyId').lean();
  return companies.map(company => String(company.companyId));
}

function jobIdFilter(jobId) {
  const value = String(jobId || '').trim();
  if (!value) return null;
  const clauses = [{ fingerprint: value }, { externalId: value }];
  if (mongoose.isValidObjectId(value)) clauses.push({ _id: value });
  return { $or: clauses };
}

async function companyMapForJobs(jobs) {
  const companyIds = [...new Set(jobs.map(job => String(job.companyId || '')).filter(Boolean))];
  if (!companyIds.length) return new Map();
  const companies = await Company.find({ companyId: { $in: companyIds } })
    .select('companyId companyName sponsorship employerType')
    .lean();
  return new Map(companies.map(company => [String(company.companyId), company]));
}

function serialiseMatch(job, company, result) {
  return {
    ...result,
    job: {
      id: String(job._id),
      companyId: job.companyId,
      companyName: company?.companyName || job.companyName || 'Unknown company',
      title: job.title,
      location: job.location,
      employmentType: job.employmentType,
      url: job.source?.url || job.applyUrl || '',
      ats: job.source?.ats || 'unknown',
      isLive: job.status?.isLive === true,
      verification: { status: job.verification?.status || 'unknown', checkedAt: job.verification?.checkedAt || null },
      status: { isLive: job.status?.isLive === true },
      applyUrl: job.applyUrl || job.source?.url || '',
      verifiedAt: job.verification?.checkedAt || null,
      closingAt: job.dates?.closingAt || null
    },
    sponsorship: company?.sponsorship || 'unknown'
  };
}

async function computeDynamicMatches({ profileId, filter, page, limit }) {
  const candidates = await Job.find(filter)
    .sort({ 'dates.lastSeenAt': -1, _id: -1 })
    .limit(MAX_DYNAMIC_MATCH_CANDIDATES)
    .lean();

  const companies = await companyMapForJobs(candidates);
  const matches = [];
  for (const job of candidates) {
    const company = companies.get(String(job.companyId));
    const result = await matchJobToProfile({
      profileId,
      job: {
        ...job,
        companyName: company?.companyName || '',
        postedAt: job.dates?.postedAt,
        closingAt: job.dates?.closingAt,
        ats: job.source?.ats,
        source: job.source?.url
      }
    });
    matches.push(serialiseMatch(job, company, result));
  }

  matches.sort((a, b) => {
    const score = Number(b.candidateScore?.score || 0) - Number(a.candidateScore?.score || 0);
    if (score) return score;
    return String(b.job?.id || '').localeCompare(String(a.job?.id || ''));
  });

  return {
    total: matches.length,
    matches: matches.slice((page - 1) * limit, page * limit),
    rankingSource: 'dynamic_fallback',
    rankingLimited: candidates.length >= MAX_DYNAMIC_MATCH_CANDIDATES
  };
}

router.post('/', async (req, res) => {
  try {
    const profileId = String(req.body?.profileId || DEFAULT_PROFILE_ID).trim() || DEFAULT_PROFILE_ID;
    let job = req.body?.job;
    if (!job && req.body?.jobId) {
      job = await Job.findById(req.body.jobId).lean();
      if (!job) return res.status(404).json({ error: 'Job not found' });
    }
    if (!job || typeof job !== 'object') return res.status(400).json({ error: 'job or jobId is required' });

    const companyId = String(job.companyId || '').trim();
    const company = companyId ? await Company.findOne({ companyId }).select('companyId companyName sponsorship').lean() : null;
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
    if (error.code === 'PROFILE_NOT_FOUND') return res.status(404).json({ error: error.message });
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
    const filter = buildVerifiedLiveMatchFilter(sponsorship === 'unknown' ? null : sponsorshipCompanyIds);
    if (sponsorship === 'unknown') filter.companyId = { $nin: sponsorshipCompanyIds };

    const profile = await loadCandidateProfile(profileId);
    const persistedFilter = {
      profileId,
      profileVersion: profile.activeVersion || 'v1',
      'eligibility.uk': true,
      'eligibility.live': true,
      'eligibility.verified': true,
      'eligibility.technology': true
    };
    // Join current job state BEFORE counting/pagination. Closed jobs and stale
    // eligibility snapshots must not create empty ranked pages or false totals.
    const eligiblePipeline = [
      { $match: persistedFilter },
      { $sort: { matchScore: -1, calculatedAt: -1, _id: -1 } },
      { $lookup: { from: Job.collection.name, localField: 'jobId', foreignField: '_id', pipeline: [{ $match: filter }], as: 'currentJob' } },
      { $unwind: '$currentJob' }
    ];
    const [count] = await MatchResult.aggregate([...eligiblePipeline, { $count: 'total' }]).allowDiskUse(true);
    const persistedTotal = count?.total || 0;
    if (persistedTotal > 0) {
      const persisted = await MatchResult.aggregate([
        ...eligiblePipeline,
        { $skip: (page - 1) * limit },
        { $limit: limit }
      ]).allowDiskUse(true);
      const jobs = persisted.map(result => result.currentJob);
      const companies = await companyMapForJobs(jobs);
      const byId = new Map(jobs.map(job => [String(job._id), job]));
      const matches = persisted
        .map(result => {
          const job = byId.get(String(result.jobId));
          if (!job) return null;
          const company = companies.get(String(job.companyId));
          return serialiseMatch(job, company, {
            candidateScore: {
              score: result.matchScore,
              matchedSkills: result.components?.matchedSkills || [],
              missingSkills: result.components?.missingSkills || [],
              components: result.components || {}
            },
            matchStrength: result.applicationFit,
            applicationFit: result.applicationFit,
            reasons: result.reasons || [],
            persistedMatch: true
          });
        })
        .filter(Boolean);

      return res.json({
        profileId,
        page,
        limit,
        total: persistedTotal,
        pages: Math.ceil(persistedTotal / limit),
        matches,
        market: 'United Kingdom',
        roleType: 'Technology',
        verifiedLiveOnly: true,
        sponsorshipFilter: sponsorship || 'all',
        rankingSource: 'persisted_match_results'
      });
    }

    const dynamic = await computeDynamicMatches({ profileId, filter, page, limit });
    return res.json({
      profileId,
      page,
      limit,
      total: dynamic.total,
      pages: Math.ceil(dynamic.total / limit),
      matches: dynamic.matches,
      market: 'United Kingdom',
      roleType: 'Technology',
      verifiedLiveOnly: true,
      sponsorshipFilter: sponsorship || 'all',
      rankingSource: dynamic.rankingSource,
      rankingLimited: dynamic.rankingLimited
    });
  } catch (error) {
    if (error.code === 'PROFILE_NOT_FOUND') return res.status(404).json({ error: error.message });
    if (error.code === 'INVALID_SPONSORSHIP_FILTER') return res.status(400).json({ error: error.message });
    console.error('Bulk matching error:', error);
    return res.status(503).json({ error: 'Bulk job matching unavailable', detail: error.message });
  }
});

router.post('/jobs/:jobId/application', async (req, res) => {
  try {
    const profileId = String(req.body?.profileId || DEFAULT_PROFILE_ID).trim() || DEFAULT_PROFILE_ID;
    const identity = jobIdFilter(req.params.jobId);
    if (!identity) return res.status(400).json({ error: 'jobId is required' });

    const filter = {
      ...buildVerifiedLiveMatchFilter(),
      ...identity
    };
    const job = await Job.findOne(filter).lean();
    if (!job) return res.status(404).json({ error: 'Verified live UK technology job not found' });

    const company = await Company.findOne({ companyId: String(job.companyId || '') })
      .select('companyId companyName sponsorship employerType')
      .lean();

    const result = await matchJobToProfile({
      profileId,
      job: {
        ...job,
        companyName: company?.companyName || job.companyName || '',
        postedAt: job.dates?.postedAt,
        closingAt: job.dates?.closingAt,
        ats: job.source?.ats,
        source: job.source?.url
      }
    });

    const existing = await Application.findOne({
      profileId,
      $or: [
        { 'job.id': String(job._id) },
        { 'job.url': job.source?.url || job.applyUrl || '' }
      ]
    }).lean();

    if (existing) {
      return res.status(409).json({
        error: 'Application already exists for this job',
        application: existing,
        match: result
      });
    }

    const application = await Application.create({
      applicationId: `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      profileId,
      job: {
        id: String(job._id),
        title: job.title,
        company: company?.companyName || job.companyName || 'Unknown company',
        companyId: job.companyId || null,
        url: job.source?.url || job.applyUrl || null
      },
      match: {
        score: result.candidateScore.score,
        applicationFit: result.candidateScore.applicationFit || result.applicationFit || null,
        reasons: result.candidateScore.reasons || result.reasons || [],
        components: result.candidateScore.components || {}
      },
      specialist: ['nhs', 'dwp', 'councils', 'universities', 'civil_service'].includes(company?.employerType) ? 'nhs-public-sector' : 'all-in-one',
      status: 'saved',
      statusHistory: [{ status: 'saved', at: new Date() }],
      materials: {},
      notes: ''
    });

    return res.status(201).json({
      application: application.toObject(),
      match: result,
      next: 'tailoring'
    });
  } catch (error) {
    if (error.code === 'PROFILE_NOT_FOUND') return res.status(404).json({ error: error.message });
    if (error.code === 11000) return res.status(409).json({ error: 'Application already exists' });
    console.error('Create application from match error:', error);
    return res.status(503).json({ error: 'Unable to create application from match', detail: error.message });
  }
});

export default router;
