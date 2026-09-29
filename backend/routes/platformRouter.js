import express from 'express';
import { candidateProfile } from '../config/candidateProfile.js';
import { getEnabledCompanies } from '../config/companies.js';
import { discoverCompanies } from '../services/discoveryPipeline.js';
import { scoreJobAgainstCandidate } from '../services/candidateMatcher.js';
import { listApplications, upsertApplication, deleteApplication } from '../repositories/applicationRepository.js';
import { connectMongo, mongoHealth } from '../db/mongoose.js';
import { Job } from '../models/Job.js';

const router = express.Router();
router.get('/platform/candidate', (req, res) => res.json(candidateProfile));
router.get('/platform/mongo-health', (req, res) => res.json({ configured: Boolean(process.env.MONGODB_URI), ...mongoHealth() }));

router.post('/platform/discover', async (req, res) => {
  const companies = Array.isArray(req.body?.companies) ? req.body.companies : getEnabledCompanies();
  const persist = req.body?.persist === true;
  try {
    if (persist) await connectMongo();
    res.json(await discoverCompanies(companies, { persist }));
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/platform/match', (req, res) => {
  const jobs = Array.isArray(req.body?.jobs) ? req.body.jobs : [];
  const candidate = req.body?.candidate || candidateProfile.candidate;
  const results = jobs.map(job => ({ ...job, match: scoreJobAgainstCandidate(job, candidate) })).sort((a, b) => b.match.score - a.match.score);
  res.json({ candidate, results });
});

router.get('/platform/jobs', async (req, res) => {
  if (!process.env.MONGODB_URI) return res.status(503).json({ error: 'MongoDB is not configured.' });
  try {
    await connectMongo(); const query = {};
    if (req.query.companyId) query.companyId = String(req.query.companyId);
    if (req.query.ats) query['source.ats'] = String(req.query.ats);
    if (req.query.live !== undefined) query['status.isLive'] = String(req.query.live) !== 'false';
    const jobs = await Job.find(query).sort({ 'dates.lastSeenAt': -1 }).limit(Math.min(Number(req.query.limit) || 100, 500)).lean();
    res.json({ count: jobs.length, jobs });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/platform/applications', async (req, res) => {
  if (!process.env.MONGODB_URI) return res.status(503).json({ error: 'MongoDB is not configured.' });
  try { await connectMongo(); res.json({ applications: await listApplications({ status: req.query.status, limit: req.query.limit }) }); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/platform/applications', async (req, res) => {
  if (!process.env.MONGODB_URI) return res.status(503).json({ error: 'MongoDB is not configured.' });
  try { await connectMongo(); res.status(201).json(await upsertApplication(req.body || {})); }
  catch (error) { res.status(400).json({ error: error.message }); }
});

router.delete('/platform/applications/:companyId/:jobId', async (req, res) => {
  if (!process.env.MONGODB_URI) return res.status(503).json({ error: 'MongoDB is not configured.' });
  try { await connectMongo(); await deleteApplication(req.params.jobId, req.params.companyId); res.status(204).end(); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

export default router;
