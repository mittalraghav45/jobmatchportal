import express from 'express';
import mongoose from 'mongoose';
import { connectMongo } from '../db/mongoose.js';
import { Company } from '../models/Company.js';
import { discoverCompanyJobs } from '../services/companyDiscovery.js';
import { resolveCareerSource } from '../services/careerSourceResolver.js';
import { resolveATSConfig } from '../ats/detector.js';

const router = express.Router();
const CHECKPOINT_COLLECTION = 'golden_discovery_checkpoints';

router.get('/status', async (req, res) => {
  try {
    await connectMongo();
    const runId = String(req.query.runId || process.env.GOLDEN_RUN_ID || 'golden-full-v1').trim();
    if (!runId) return res.status(400).json({ error: 'runId is required' });
    const collection = mongoose.connection.db.collection(CHECKPOINT_COLLECTION);
    const [companyTotal, processed, grouped] = await Promise.all([
      Company.countDocuments({ enabled: true }), collection.countDocuments({ runId }),
      collection.aggregate([{ $match: { runId } }, { $group: { _id: '$status', companies: { $sum: 1 }, jobsDiscovered: { $sum: { $ifNull: ['$jobsDiscovered', 0] } }, jobsAdded: { $sum: { $ifNull: ['$jobsAdded', 0] } }, jobsUpdated: { $sum: { $ifNull: ['$jobsUpdated', 0] } }, duplicatesRemoved: { $sum: { $ifNull: ['$duplicatesRemoved', 0] } }, rejected: { $sum: { $ifNull: ['$rejected', 0] } } } }]).toArray()
    ]);
    const byStatus = Object.fromEntries(grouped.map(row => [row._id || 'unknown', { companies: row.companies, jobsDiscovered: row.jobsDiscovered, jobsAdded: row.jobsAdded, jobsUpdated: row.jobsUpdated, duplicatesRemoved: row.duplicatesRemoved, rejected: row.rejected }]));
    const completed = Number(byStatus.completed?.companies || 0); const unresolved = Number(byStatus.unresolved?.companies || 0); const invalid = Number(byStatus.invalid?.companies || 0); const failed = Number(byStatus.failed?.companies || 0);
    return res.json({ runId, companyTotal, processed, remaining: Math.max(companyTotal - processed, 0), progressPercent: companyTotal ? Number(((processed / companyTotal) * 100).toFixed(2)) : 0, resolvedSuccessful: completed, unresolved, invalid, failed, jobsDiscovered: grouped.reduce((sum, row) => sum + Number(row.jobsDiscovered || 0), 0), jobsAdded: grouped.reduce((sum, row) => sum + Number(row.jobsAdded || 0), 0), jobsUpdated: grouped.reduce((sum, row) => sum + Number(row.jobsUpdated || 0), 0), duplicatesRemoved: grouped.reduce((sum, row) => sum + Number(row.duplicatesRemoved || 0), 0), rejected: grouped.reduce((sum, row) => sum + Number(row.rejected || 0), 0), byStatus, checkpointCollection: CHECKPOINT_COLLECTION, checkedAt: new Date().toISOString() });
  } catch (error) { console.error('Discovery status error:', error.message); return res.status(503).json({ error: 'Unable to read discovery status', message: error.message }); }
});

router.get('/unresolved', async (req, res) => {
  try {
    await connectMongo();
    const runId = String(req.query.runId || process.env.GOLDEN_RUN_ID || 'golden-full-v1').trim();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const rows = await mongoose.connection.db.collection(CHECKPOINT_COLLECTION).find({ runId, status: { $in: ['unresolved', 'failed', 'invalid'] } }, { projection: { _id: 0, companyId: 1, companyName: 1, status: 1, sourceStatus: 1, source: 1, careersUrl: 1, ats: 1, error: 1, processedAt: 1 } }).sort({ processedAt: -1 }).limit(limit).toArray();
    return res.json({ runId, count: rows.length, companies: rows });
  } catch (error) { return res.status(503).json({ error: 'Unable to load unresolved companies', message: error.message }); }
});

router.post('/retry/:companyId', async (req, res) => {
  try {
    await connectMongo();
    const runId = String(req.body?.runId || process.env.GOLDEN_RUN_ID || 'golden-full-v1').trim();
    const companyId = String(req.params.companyId).trim();
    const company = await Company.findOne({ companyId, enabled: true }).lean();
    if (!company) return res.status(404).json({ error: 'Company not found or disabled' });
    const source = await resolveCareerSource(company);
    const detected = resolveATSConfig({ ats: source.ats || company.ats, atsSlug: source.atsSlug || company.metadata?.atsSlug, careersUrl: source.careersUrl || company.careersUrl || '' });
    const prepared = { ...company, careersUrl: source.careersUrl || company.careersUrl || '', ats: detected.ats || source.ats || 'custom', atsSlug: detected.slug || source.atsSlug || company.metadata?.atsSlug || company.companyId, atsSite: detected.site || null };
    if (source.status !== 'resolved' || (!prepared.careersUrl && !prepared.ats)) return res.json({ companyId, status: 'unresolved', source });
    const result = await discoverCompanyJobs(prepared, { persist: true, now: new Date() });
    await mongoose.connection.db.collection(CHECKPOINT_COLLECTION).updateOne({ runId, companyId }, { $set: { runId, companyId, companyName: company.companyName, status: result.status === 'ok' ? 'completed' : 'failed', sourceStatus: source.status, source: source.source, careersUrl: prepared.careersUrl, ats: prepared.ats, atsSlug: prepared.atsSlug, jobsDiscovered: result.jobs?.length || 0, jobsAdded: result.added || 0, jobsUpdated: result.updated || 0, duplicatesRemoved: result.duplicatesRemoved || 0, rejected: result.rejected?.length || 0, error: result.status === 'error' ? result.rejected?.[0]?.message || 'Discovery failed' : null, processedAt: new Date() } }, { upsert: true });
    return res.json({ companyId, status: result.status, jobsDiscovered: result.jobs?.length || 0, jobsAdded: result.added || 0, jobsUpdated: result.updated || 0 });
  } catch (error) { return res.status(503).json({ error: 'Unable to retry company discovery', message: error.message }); }
});

export default router;
