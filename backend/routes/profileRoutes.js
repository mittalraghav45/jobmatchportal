import express from 'express';
import { connectMongo, mongoHealth } from '../db/mongoose.js';
import { CandidateProfile, DEFAULT_PROFILE_ID, sanitiseCandidateProfile } from '../models/CandidateProfile.js';
import { matchJobToProfile } from '../profileMatching.js';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, mongo: mongoHealth() });
});

router.get('/:profileId', async (req, res) => {
  try {
    await connectMongo();
    const profileId = String(req.params.profileId || DEFAULT_PROFILE_ID).trim() || DEFAULT_PROFILE_ID;
    const profile = await CandidateProfile.findOne({ profileId }).lean();
    if (!profile) return res.status(404).json({ error: 'Candidate profile not found', profileId });
    return res.json({ profile });
  } catch (error) {
    return res.status(503).json({ error: 'MongoDB profile service unavailable', detail: error.message });
  }
});

router.put('/:profileId', async (req, res) => {
  try {
    await connectMongo();
    const profileId = String(req.params.profileId || DEFAULT_PROFILE_ID).trim() || DEFAULT_PROFILE_ID;
    const updates = sanitiseCandidateProfile(req.body || {});
    const profile = await CandidateProfile.findOneAndUpdate(
      { profileId },
      { $set: updates, $setOnInsert: { profileId } },
      { new: true, upsert: true, runValidators: true }
    ).lean();
    return res.json({ profile });
  } catch (error) {
    const status = error.name === 'ValidationError' || /must be|array|number/i.test(error.message) ? 400 : 503;
    return res.status(status).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    await connectMongo();
    const profile = await CandidateProfile.findOne({ profileId: DEFAULT_PROFILE_ID }).lean();
    if (!profile) return res.status(404).json({ error: 'Candidate profile not found', profileId: DEFAULT_PROFILE_ID });
    return res.json({ profile });
  } catch (error) {
    return res.status(503).json({ error: 'MongoDB profile service unavailable', detail: error.message });
  }
});

router.put('/', async (req, res) => {
  try {
    await connectMongo();
    const updates = sanitiseCandidateProfile(req.body || {});
    const profile = await CandidateProfile.findOneAndUpdate(
      { profileId: DEFAULT_PROFILE_ID },
      { $set: updates, $setOnInsert: { profileId: DEFAULT_PROFILE_ID } },
      { new: true, upsert: true, runValidators: true }
    ).lean();
    return res.json({ profile });
  } catch (error) {
    const status = error.name === 'ValidationError' || /must be|array|number/i.test(error.message) ? 400 : 503;
    return res.status(status).json({ error: error.message });
  }
});

router.post('/match', async (req, res) => {
  try {
    const result = await matchJobToProfile({
      profileId: DEFAULT_PROFILE_ID,
      job: req.body?.job || req.body
    });
    return res.json(result);
  } catch (error) {
    if (error.code === 'PROFILE_NOT_FOUND') return res.status(404).json({ error: error.message });
    return res.status(503).json({ error: 'Profile matching unavailable', detail: error.message });
  }
});

router.post('/:profileId/match', async (req, res) => {
  try {
    const result = await matchJobToProfile({
      profileId: req.params.profileId,
      job: req.body?.job || req.body
    });
    return res.json(result);
  } catch (error) {
    if (error.code === 'PROFILE_NOT_FOUND') return res.status(404).json({ error: error.message });
    return res.status(503).json({ error: 'Profile matching unavailable', detail: error.message });
  }
});

export default router;
