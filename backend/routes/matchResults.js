import express from 'express';
import { DEFAULT_PROFILE_ID } from '../models/CandidateProfile.js';
import { persistJobMatch, persistJobMatches, listPersistedMatches } from '../services/matchPersistence.js';
import { Job } from '../models/Job.js';
import { buildVerifiedLiveMatchFilter } from '../utils/matchFilters.js';

const router = express.Router();

router.post('/persist', async (req, res) => {
  try {
    const result = await persistJobMatch({ profileId: req.body?.profileId || DEFAULT_PROFILE_ID, jobId: req.body?.jobId });
    res.json({ ok: true, ...result });
  } catch (error) {
    if (error.code === 'PROFILE_NOT_FOUND' || error.code === 'JOB_NOT_FOUND') return res.status(404).json({ error: error.message });
    res.status(503).json({ error: 'Match persistence unavailable', detail: error.message });
  }
});

router.post('/persist-batch', async (req, res) => {
  try {
    const profileId = req.body?.profileId || DEFAULT_PROFILE_ID;
    const limit = Math.min(100, Math.max(1, Number(req.body?.limit || 50)));
    const skip = Math.max(0, Number(req.body?.skip || 0));
    const jobs = await Job.find(buildVerifiedLiveMatchFilter(null))
      .sort({ 'quality.score': -1, 'dates.lastSeenAt': -1 })
      .skip(skip).limit(limit).lean();
    const result = await persistJobMatches({ profileId, jobs });
    res.json({ ok: true, selected: jobs.length, skip, limit, ...result });
  } catch (error) {
    if (error.code === 'PROFILE_NOT_FOUND') return res.status(404).json({ error: error.message });
    res.status(503).json({ error: 'Batch match persistence unavailable', detail: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const applicationFit = req.query.applicationFit ? String(req.query.applicationFit).toLowerCase() : undefined;
    const validFits = ['strong', 'possible', 'weak', 'strong_unconfirmed_sponsorship'];
    if (applicationFit && !validFits.includes(applicationFit)) {
      return res.status(400).json({ error: `applicationFit must be one of: ${validFits.join(', ')}` });
    }
    const result = await listPersistedMatches({
      profileId: req.query.profileId || DEFAULT_PROFILE_ID,
      profileVersion: req.query.profileVersion,
      page: req.query.page,
      limit: req.query.limit,
      minimumScore: req.query.minimumScore,
      applicationFit
    });
    res.json({ profileId: req.query.profileId || DEFAULT_PROFILE_ID, ...result });
  } catch (error) {
    res.status(503).json({ error: 'Persisted match results unavailable', detail: error.message });
  }
});

export default router;
