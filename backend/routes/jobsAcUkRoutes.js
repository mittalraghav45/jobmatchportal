import express from 'express';
import { searchJobsAcUk } from '../services/jobsAcUkSearch.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const keywords = String(req.query.q || req.query.keywords || '').trim();
    const location = String(req.query.location || '').trim();
    const page = Number.parseInt(req.query.page || '1', 10);
    const pageSize = Number.parseInt(req.query.pageSize || '25', 10);

    if (!keywords && !location) {
      return res.status(400).json({ error: 'Provide q/keywords or location.' });
    }

    const result = await searchJobsAcUk({ keywords, location, page, pageSize });
    return res.json(result);
  } catch (error) {
    console.error('jobs.ac.uk search error:', error.message);
    return res.status(502).json({
      error: 'Unable to query jobs.ac.uk',
      message: error.message,
      source: 'jobs.ac.uk'
    });
  }
});

export default router;
