import express from 'express';
import { connectMongo } from '../db/mongoose.js';
import { Application } from '../models/Application.js';
import { CandidateProfile } from '../models/CandidateProfile.js';
import { createApplication, transitionApplication, summariseApplications } from '../applicationStore.js';
import { generateApplicationPack } from '../applicationPackGenerator.js';
import { buildFollowUpQueue } from '../utils/applicationFollowUp.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    await connectMongo();
    const filter = {};
    if (req.query.profileId) filter.profileId = String(req.query.profileId);
    if (req.query.status) filter.status = String(req.query.status);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const applications = await Application.find(filter).sort({ updatedAt: -1 }).limit(limit).lean();
    return res.json({ applications, summary: summariseApplications(applications) });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to load applications', message: error.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    await connectMongo();
    const filter = req.query.profileId ? { profileId: String(req.query.profileId) } : {};
    const applications = await Application.find(filter).select('status').lean();
    return res.json(summariseApplications(applications));
  } catch (error) {
    return res.status(500).json({ error: 'Unable to load application summary', message: error.message });
  }
});

router.get('/follow-ups', async (req, res) => {
  try {
    await connectMongo();
    const filter = req.query.profileId ? { profileId: String(req.query.profileId) } : {};
    const applications = await Application.find(filter).sort({ appliedAt: 1, updatedAt: 1 }).lean();
    const queue = buildFollowUpQueue(applications);
    return res.json({ count: queue.length, applications: queue });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to load follow-ups', message: error.message });
  }
});

router.patch('/:applicationId/follow-up', async (req, res) => {
  try {
    await connectMongo();
    const application = await Application.findOne({ applicationId: String(req.params.applicationId) }).lean();
    if (!application) return res.status(404).json({ error: 'Application not found' });
    const raw = req.body?.followUpAt;
    const followUpAt = raw ? new Date(raw) : null;
    if (raw && !Number.isFinite(followUpAt.getTime())) return res.status(400).json({ error: 'followUpAt must be a valid date' });
    const saved = await Application.findOneAndUpdate(
      { applicationId: application.applicationId },
      { $set: { followUpAt, updatedAt: new Date() } },
      { new: true, runValidators: true }
    ).lean();
    return res.json(saved);
  } catch (error) {
    return res.status(400).json({ error: 'Unable to update follow-up date', message: error.message });
  }
});

router.get('/:applicationId', async (req, res) => {
  try {
    await connectMongo();
    const application = await Application.findOne({ applicationId: String(req.params.applicationId) }).lean();
    if (!application) return res.status(404).json({ error: 'Application not found' });
    return res.json(application);
  } catch (error) {
    return res.status(500).json({ error: 'Unable to load application', message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const application = createApplication(payload);
    const job = payload.job || {};
    if (!job.title || !(job.company || job.companyName)) {
      return res.status(400).json({ error: 'Job title and company are required.' });
    }
    const document = new Application({
      applicationId: application.id,
      profileId: payload.profileId || null,
      job: { id: job.id || null, title: job.title, company: job.company || job.companyName, companyId: job.companyId || null, url: job.url || null },
      match: payload.match || {},
      specialist: payload.specialist || 'all-in-one',
      status: 'saved',
      materials: payload.materials || payload.documents || {},
      notes: String(payload.notes || ''),
      createdAt: application.createdAt,
      updatedAt: application.updatedAt
    });
    await connectMongo();
    const saved = await document.save();
    return res.status(201).json(saved.toObject());
  } catch (error) {
    return res.status(400).json({ error: 'Unable to create application', message: error.message });
  }
});

router.post('/:applicationId/generate-pack', async (req, res) => {
  try {
    await connectMongo();
    const application = await Application.findOne({ applicationId: String(req.params.applicationId) }).lean();
    if (!application) return res.status(404).json({ error: 'Application not found' });

    const profileId = req.body?.profileId || application.profileId;
    const candidate = profileId
      ? await CandidateProfile.findOne({ profileId: String(profileId) }).lean()
      : req.body?.candidate;
    if (!candidate) return res.status(400).json({ error: 'Candidate profile/evidence is required.' });

    const job = req.body?.job || application.job;
    const result = await generateApplicationPack({ job, candidate, task: req.body?.task || 'full' });

    if (result.pack) {
      const materials = { ...(application.materials || {}), applicationPack: result.pack };
      const saved = await Application.findOneAndUpdate(
        { applicationId: application.applicationId },
        { $set: { materials, status: 'tailoring', updatedAt: new Date() } },
        { new: true, runValidators: true }
      ).lean();
      return res.json({ application: saved, generation: result });
    }

    return res.json({ application, generation: result });
  } catch (error) {
    return res.status(400).json({ error: 'Unable to generate application pack', message: error.message });
  }
});

router.patch('/:applicationId/status', async (req, res) => {
  try {
    await connectMongo();
    const existing = await Application.findOne({ applicationId: String(req.params.applicationId) }).lean();
    if (!existing) return res.status(404).json({ error: 'Application not found' });
    const nextStatus = String(req.body?.status);
    const updated = transitionApplication(existing, nextStatus);
    const statusHistory = [...(existing.statusHistory || []), { status: updated.status, at: new Date(updated.updatedAt) }];
    const changes = {
      status: updated.status,
      updatedAt: updated.updatedAt,
      appliedAt: updated.appliedAt,
      statusHistory
    };
    if (nextStatus === 'rejected' && req.body?.rejectionReason !== undefined) {
      changes.rejectionReason = String(req.body.rejectionReason || '');
    }
    const saved = await Application.findOneAndUpdate(
      { applicationId: existing.applicationId },
      { $set: changes },
      { new: true, runValidators: true }
    ).lean();
    return res.json(saved);
  } catch (error) {
    return res.status(400).json({ error: 'Unable to change application status', message: error.message });
  }
});

router.patch('/:applicationId/materials', async (req, res) => {
  try {
    await connectMongo();
    const existing = await Application.findOne({ applicationId: String(req.params.applicationId) }).lean();
    if (!existing) return res.status(404).json({ error: 'Application not found' });
    const materials = { ...(existing.materials || {}), ...(req.body?.materials || req.body || {}) };
    const saved = await Application.findOneAndUpdate(
      { applicationId: existing.applicationId },
      { $set: { materials, updatedAt: new Date() } },
      { new: true, runValidators: true }
    ).lean();
    return res.json(saved);
  } catch (error) {
    return res.status(400).json({ error: 'Unable to update application materials', message: error.message });
  }
});

router.patch('/:applicationId', async (req, res) => {
  try {
    await connectMongo();
    const existing = await Application.findOne({ applicationId: String(req.params.applicationId) }).lean();
    if (!existing) return res.status(404).json({ error: 'Application not found' });
    const allowed = ['notes', 'specialist', 'match', 'profileId'];
    const changes = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
    changes.updatedAt = new Date();
    const saved = await Application.findOneAndUpdate(
      { applicationId: existing.applicationId },
      { $set: changes },
      { new: true, runValidators: true }
    ).lean();
    return res.json(saved);
  } catch (error) {
    return res.status(400).json({ error: 'Unable to update application', message: error.message });
  }
});

export default router;
