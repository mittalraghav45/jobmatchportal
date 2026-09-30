import express from 'express';
import { connectMongo } from '../db/mongoose.js';
import { Application } from '../models/Application.js';
import { createApplication, transitionApplication, updateApplicationDocuments, summariseApplications } from '../applicationStore.js';

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
    const document = new Application({
      ...application,
      applicationId: application.id,
      profileId: payload.profileId || null,
      job: {
        id: payload.job?.id || null,
        title: payload.job?.title || '',
        company: payload.job?.company || payload.job?.companyName || '',
        companyId: payload.job?.companyId || null,
        url: payload.job?.url || null
      },
      match: payload.match || {},
      specialist: payload.specialist || 'all-in-one',
      materials: payload.materials || payload.documents || {}
    });
    await connectMongo();
    const saved = await document.save();
    return res.status(201).json(saved.toObject());
  } catch (error) {
    return res.status(400).json({ error: 'Unable to create application', message: error.message });
  }
});

router.patch('/:applicationId/status', async (req, res) => {
  try {
    await connectMongo();
    const existing = await Application.findOne({ applicationId: String(req.params.applicationId) }).lean();
    if (!existing) return res.status(404).json({ error: 'Application not found' });
    const updated = transitionApplication(existing, String(req.body?.status));
    const saved = await Application.findOneAndUpdate(
      { applicationId: existing.applicationId },
      { $set: { status: updated.status, updatedAt: updated.updatedAt, appliedAt: updated.appliedAt } },
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
    const updated = updateApplicationDocuments(existing, req.body?.materials || req.body || {});
    const saved = await Application.findOneAndUpdate(
      { applicationId: existing.applicationId },
      { $set: { materials: updated.documents || updated.materials, updatedAt: updated.updatedAt } },
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
