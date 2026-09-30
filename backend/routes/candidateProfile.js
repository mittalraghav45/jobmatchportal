import express from 'express';
import { connectMongo } from '../db/mongoose.js';
import { CandidateProfile } from '../models/CandidateProfile.js';

const router = express.Router();

router.get('/:profileId', async (req, res) => {
  try {
    await connectMongo();
    const profile = await CandidateProfile.findOne({ profileId: String(req.params.profileId) }).lean();
    if (!profile) return res.status(404).json({ error: 'Candidate profile not found' });
    res.json({ profile });
  } catch (error) {
    res.status(503).json({ error: 'Unable to query candidate profile', message: error.message });
  }
});

router.put('/:profileId', async (req, res) => {
  try {
    await connectMongo();
    const body = { ...req.body, profileId: String(req.params.profileId) };
    delete body._id;
    const profile = await CandidateProfile.findOneAndUpdate(
      { profileId: body.profileId },
      { $set: body },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ profile });
  } catch (error) {
    res.status(400).json({ error: 'Unable to save candidate profile', message: error.message });
  }
});

export default router;
