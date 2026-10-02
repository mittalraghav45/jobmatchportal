import express from 'express';
import { JOBS_AC_UK_DISCIPLINES, searchJobsAcUk } from '../services/jobsAcUkSearch.js';

const router = express.Router();
const QUERY_MARKER = '__jobsacuk__';

function parseSearchQuery(raw) {
  const value = String(raw || '').trim();
  if (!value.startsWith(QUERY_MARKER)) return { keywords: value };
  try {
    const parsed = JSON.parse(decodeURIComponent(value.slice(QUERY_MARKER.length)));
    return {
      keywords: String(parsed.keywords || '').trim(),
      discipline: String(parsed.discipline || 'computer-sciences').trim().toLowerCase(),
      subDiscipline: String(parsed.subDiscipline || '').trim().toLowerCase(),
    };
  } catch {
    return { keywords: value.slice(QUERY_MARKER.length).trim() };
  }
}

router.get('/filters', (_req, res) => res.json({ source: 'jobs.ac.uk', disciplines: JOBS_AC_UK_DISCIPLINES }));

router.get('/', async (req, res) => {
  try {
    const parsed = parseSearchQuery(req.query.q || req.query.keywords || '');
    const keywords = parsed.keywords;
    const location = String(req.query.location || '').trim();
    const discipline = String(req.query.discipline || parsed.discipline || 'computer-sciences').trim().toLowerCase();
    const subDiscipline = String(req.query.subDiscipline || parsed.subDiscipline || '').trim().toLowerCase();
    const page = Number.parseInt(req.query.page || '1', 10);
    const pageSize = Number.parseInt(req.query.pageSize || '25', 10);

    if (!keywords && !location && !discipline && !subDiscipline) {
      return res.status(400).json({ error: 'Provide a discipline, q/keywords, or location.' });
    }

    const result = await searchJobsAcUk({ keywords, location, discipline, subDiscipline, page, pageSize });
    return res.json(result);
  } catch (error) {
    console.error('jobs.ac.uk search error:', error.message);
    return res.status(502).json({ error: 'Unable to query jobs.ac.uk', message: error.message, source: 'jobs.ac.uk' });
  }
});

export default router;
