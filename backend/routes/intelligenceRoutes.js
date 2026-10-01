import express from 'express';
import OpenAI from 'openai';
import { Job } from '../models/Job.js';
import { Company } from '../models/Company.js';
import { CandidateProfile, DEFAULT_PROFILE_ID } from '../models/CandidateProfile.js';
import { Application } from '../models/Application.js';
import { analyseJob, scoreCandidateAgainstJob } from '../jobIntelligence.js';
import { connectMongo } from '../db/mongoose.js';

const router = express.Router();
function getOpenAI() { return process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null; }
function list(value) { return value ? String(value).split(',').map(x => x.trim()).filter(Boolean) : []; }

function buildJobPayload(job, company) {
  const analysis = analyseJob({ title: job.title, description: job.description || '', location: job.location, employmentType: job.employmentType, source: job.source?.url || '', ats: job.source?.ats || '', postedAt: job.dates?.postedAt, closingAt: job.dates?.closingAt });
  return { id: String(job._id), companyId: job.companyId, companyName: company?.companyName || 'Unknown company', title: job.title, description: job.description || '', location: job.location, nation: job.nation, employerType: job.employerType, employmentType: job.employmentType, url: job.source?.url || '', sponsorship: company?.sponsorship || 'unknown', dates: job.dates, ...analysis };
}

async function discoveryStats(runId) {
  const connection = await connectMongo();
  const collection = connection.db.collection('golden_discovery_checkpoints');
  const runs = connection.db.collection('golden_discovery_runs');
  const [companyTotal, processed, resolved, unresolved, failed, jobsAdded, jobsUpdated, run] = await Promise.all([
    Company.countDocuments({ enabled: true }),
    collection.countDocuments({ runId, status: { $in: ['completed', 'unresolved', 'invalid', 'failed'] } }),
    collection.countDocuments({ runId, status: 'completed' }),
    collection.countDocuments({ runId, status: 'unresolved' }),
    collection.countDocuments({ runId, status: 'failed' }),
    collection.aggregate([{ $match: { runId } }, { $group: { _id: null, value: { $sum: '$jobsAdded' } } }]).toArray(),
    collection.aggregate([{ $match: { runId } }, { $group: { _id: null, value: { $sum: '$jobsUpdated' } } }]).toArray(),
    runs.findOne({ runId })
  ]);

  const heartbeatAt = run?.heartbeatAt ? new Date(run.heartbeatAt) : null;
  const heartbeatAgeMs = heartbeatAt ? Date.now() - heartbeatAt.getTime() : null;
  const heartbeatFresh = heartbeatAgeMs !== null && heartbeatAgeMs <= 120000;
  const active = run?.status === 'running' && heartbeatFresh;
  const currentBatchCount = active ? Number(run.currentBatchCount || 0) : 0;
  const currentBatchStart = active && run.currentBatchStart ? Number(run.currentBatchStart) : null;
  const currentBatchEnd = active && run.currentBatchEnd ? Number(run.currentBatchEnd) : null;
  const processedInBatch = currentBatchStart ? Math.max(0, Math.min(currentBatchCount, processed - Math.max(0, currentBatchStart - 1))) : 0;

  return {
    runId,
    status: active ? 'running' : (run?.status || 'idle'),
    phase: active ? (run.phase || 'processing') : (run?.status === 'running' ? 'stale' : (run?.phase || 'idle')),
    companyTotal,
    processed,
    processing: currentBatchCount,
    processingRemaining: Math.max(0, currentBatchCount - processedInBatch),
    currentBatch: currentBatchStart && currentBatchEnd ? { start: currentBatchStart, end: currentBatchEnd, size: currentBatchCount, processed: processedInBatch } : null,
    currentCompany: active && run.currentCompanyId ? { companyId: String(run.currentCompanyId), companyName: run.currentCompanyName || null } : null,
    remaining: Math.max(0, companyTotal - processed),
    progressPercent: companyTotal ? Number((processed / companyTotal * 100).toFixed(2)) : 0,
    resolved,
    unresolved,
    failed,
    jobsAdded: jobsAdded[0]?.value || 0,
    jobsUpdated: jobsUpdated[0]?.value || 0,
    heartbeatAt: run?.heartbeatAt || null,
    checkedAt: new Date().toISOString()
  };
}

router.get('/dashboard', async (req, res) => {
  try {
    await connectMongo(); const runId = String(req.query.runId || process.env.GOLDEN_RUN_ID || 'golden-full-v1000');
    const [jobs, live, companies, applications, discovery] = await Promise.all([Job.countDocuments(), Job.countDocuments({ 'status.isLive': true }), Company.countDocuments({ enabled: true }), Application.find({ profileId: DEFAULT_PROFILE_ID }).select('status').lean(), discoveryStats(runId)]);
    const appCounts = applications.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {});
    return res.json({ jobs: { total: jobs, live }, companies, applications: appCounts, discovery });
  } catch (error) { return res.status(503).json({ error: 'Unable to load intelligence dashboard', message: error.message }); }
});

router.post('/job/:id', async (req, res) => {
  try {
    await connectMongo(); const job = await Job.findOne({ $or: [{ _id: req.params.id }, { fingerprint: req.params.id }, { externalId: req.params.id }] }).lean(); if (!job) return res.status(404).json({ error: 'Job not found' });
    const company = await Company.findOne({ companyId: String(job.companyId) }).lean(); const profile = await CandidateProfile.findOne({ profileId: String(req.body?.profileId || DEFAULT_PROFILE_ID) }).lean(); if (!profile) return res.status(404).json({ error: 'Candidate profile not found' });
    const payload = buildJobPayload(job, company); const deterministic = scoreCandidateAgainstJob({ cvSkills: profile.skills, yearsExperience: profile.yearsExperience, cvText: profile.cvText, job: payload });
    let semantic = null; const openai = getOpenAI();
    if (openai && req.body?.semantic !== false) {
      const completion = await openai.chat.completions.create({ model: 'gpt-4o-mini', temperature: 0.1, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: 'You are a UK recruitment matching assistant. Return strict JSON. Assess fit using only supplied evidence. Do not invent qualifications, sponsorship or experience.' },
        { role: 'user', content: JSON.stringify({ candidate: { skills: profile.skills, yearsExperience: profile.yearsExperience, summary: profile.summary, experience: profile.experience, education: profile.education, preferences: profile.preferences }, job: { title: payload.title, description: payload.description, location: payload.location, nation: payload.nation, employerType: payload.employerType, sponsorship: payload.sponsorship, technicalSkills: payload.technicalSkills, seniority: payload.seniority, criteria: payload.criteria } }) }
      ] });
      try { semantic = JSON.parse(completion.choices?.[0]?.message?.content || '{}'); } catch { semantic = { error: 'Invalid semantic response' }; }
    }
    return res.json({ job: payload, deterministic, semantic, openAIUsed: Boolean(semantic) });
  } catch (error) { return res.status(503).json({ error: 'Job intelligence failed', message: error.message }); }
});

router.post('/top-matches', async (req, res) => {
  try {
    await connectMongo(); const profileId = String(req.body?.profileId || DEFAULT_PROFILE_ID); const profile = await CandidateProfile.findOne({ profileId }).lean(); if (!profile) return res.status(404).json({ error: 'Candidate profile not found' });
    const limit = Math.min(50, Math.max(1, Number(req.body?.limit || 20))); const filter = { 'status.isLive': { $ne: false } }; const nations = list(req.body?.nation); const employers = list(req.body?.employerType);
    if (nations.length) filter.nation = { $in: nations }; if (employers.length) filter.employerType = { $in: employers };
    if (req.body?.sponsorship === 'verified') { const companies = await Company.find({ sponsorship: 'verified' }).select('companyId').lean(); filter.companyId = { $in: companies.map(x => String(x.companyId)) }; }
    const jobs = await Job.find(filter).sort({ 'dates.lastSeenAt': -1 }).limit(200).lean(); const companyIds = [...new Set(jobs.map(x => String(x.companyId)))]; const companies = await Company.find({ companyId: { $in: companyIds } }).lean(); const byId = new Map(companies.map(x => [String(x.companyId), x]));
    const matches = jobs.map(job => { const company = byId.get(String(job.companyId)); const payload = buildJobPayload(job, company); return { job: payload, match: scoreCandidateAgainstJob({ cvSkills: profile.skills, yearsExperience: profile.yearsExperience, cvText: profile.cvText, job: payload }) }; }).sort((a, b) => b.match.score - a.match.score).slice(0, limit);
    return res.json({ profileId, matches, totalConsidered: jobs.length });
  } catch (error) { return res.status(503).json({ error: 'Unable to calculate top matches', message: error.message }); }
});

export default router;
