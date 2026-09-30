import express from 'express';
import { connectMongo } from '../db/mongoose.js';
import { Application } from '../models/Application.js';
import { transitionApplication } from '../applicationWorkflow.js';

const router = express.Router();

function idFromRequest(req) {
  const id = String(req.params.applicationId || '').trim();
  if (!id) throw new Error('applicationId is required');
  return id;
}

router.get('/', async (req, res) => {
  try {
    await connectMongo();
    const filter = {};
    if (req.query.profileId) filter.profileId = String(req.query.profileId);
    if (req.query.status) filter.status = String(req.query.status);
    const applications = await Application.find(filter).sort({ updatedAt: -1 }).lean();
    return res.json({ applications, count: applications.length });
  } catch (error) {
    return res.status(503).json({ error: 'MongoDB application service unavailable', detail: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    await connectMongo();
    const body = req.body || {};
    if (!body.job?.title || !body.job?.company) {
      return res.status(400).json({ error: 'job.title and job.company are required' });
    }
    const application = await Application.create({
      applicationId: body.applicationId || `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      profileId: body.profileId || 'default',
      job: {
        id: body.job.id || null,
        title: String(body.job.title),
        company: String(body.job.company),
        companyId: body.job.companyId || null,
        url: body.job.url || null
      },
      match: body.match || {},
      specialist: body.specialist || 'all-in-one',
      materials: body.materials || {},
      notes: String(body.notes || '')
    });
    return res.status(201).json({ application: application.toObject() });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'Application already exists', detail: error.message });
    return res.status(503).json({ error: error.message });
  }
});

router.patch('/:applicationId/status', async (req, res) => {
  try {
    await connectMongo();
    const applicationId = idFromRequest(req);
    const current = await Application.findOne({ applicationId }).lean();
    if (!current) return res.status(404).json({ error: 'Application not found', applicationId });
    const updated = transitionApplication(current, String(req.body?.status || ''));
    const saved = await Application.findOneAndUpdate(
      { applicationId },
      { $set: { status: updated.status, appliedAt: updated.appliedAt, updatedAt: new Date(updated.updatedAt) } },
      { new: true, runValidators: true }
    ).lean();
    return res.json({ application: saved });
  } catch (error) {
    const status = /Invalid|Unknown|required/.test(error.message) ? 400 : 503;
    return res.status(status).json({ error: error.message });
  }
});

router.patch('/:applicationId', async (req, res) => {
  try {
    await connectMongo();
    const applicationId = idFromRequest(req);
    const allowed = ['match', 'specialist', 'materials', 'notes'];
    const updates = {};
    for (const key of allowed) if (req.body?.[key] !== undefined) updates[key] = req.body[key];
    const application = await Application.findOneAndUpdate(
      { applicationId },
      { $set: updates, $currentDate: { updatedAt: true } },
      { new: true, runValidators: true }
    ).lean();
    if (!application) return res.status(404).json({ error: 'Application not found', applicationId });
    return res.json({ application });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/:applicationId', async (req, res) => {
  try {
    await connectMongo();
    const applicationId = idFromRequest(req);
    const application = await Application.findOne({ applicationId }).lean();
    if (!application) return res.status(404).json({ error: 'Application not found', applicationId });
    return res.json({ application });
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
});

export default router;
