import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { connectMongo } from './db/mongoose.js';

import { calculateMatchPercent, getRecommendation, parseCV, generateLatexCV, generateCoverLetter, getMatchBreakdown } from './cvJobMatcher.js';
import { fetchAllATS, enrichWithDates } from './liveJobsScraper_new.js';
import { buildStructuredApplicationMessages } from './applicationEngine.js';
import { validateApplicationOutput, stripUnsupportedFields } from './applicationValidator.js';
import { evaluateSponsorship } from './sponsorRegistry.js';
import { analyseJob, scoreCandidateAgainstJob } from './jobIntelligence.js';
import profileRoutes from './routes/profileRoutes.js';
import matchRoutes from './routes/matchRoutes.js';
import jobsRoutes from './routes/jobs.js';
import companiesRoutes from './routes/companies.js';
import applicationRoutes from './routes/applicationRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const PERPLEXITY_KEY = process.env.PERPLEXITY_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;
const ATS_LIST = ['greenhouse','lever','ashby','workday','smartrecruiters','workable','teamtailor','pinpoint','recruitee','bamboohr','nhs'];

const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://localhost:5174,http://localhost:5175')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use('/api/profile', profileRoutes);
app.use('/api/match', matchRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/applications', applicationRoutes);

app.get('/api/health', (req, res) => res.json({
  ok: true,
  hasPerplexityKey: Boolean(PERPLEXITY_KEY),
  hasOpenAIKey: Boolean(OPENAI_KEY),
  using: openai ? 'openai' : PERPLEXITY_KEY ? 'perplexity' : 'none',
  port: PORT,
  ats: ATS_LIST,
  timestamp: new Date().toISOString(),
  nodeVersion: process.version,
  routes: { jobs: true, companies: true, profile: true, match: true, applications: true }
}));

function getSkills(req) {
  return req.query.skills
    ? String(req.query.skills).split(',').map(skill => skill.trim().toLowerCase()).filter(Boolean)
    : ['react', 'typescript', 'node.js'];
}

function getSponsorshipRecord(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return { status: String(value) }; }
}

function enrichJobs(jobs, skills, sponsorshipRecord = {}, cvText = '', yearsExperience = 0) {
  const sponsorship = evaluateSponsorship(sponsorshipRecord);
  const visaSponsors = sponsorship.decision === 'not-sponsor'
    ? false
    : sponsorship.decision === 'verified'
      ? true
      : null;

  return enrichWithDates(jobs)
    .map(job => {
      const analysis = analyseJob({
        title: job.title,
        description: job.description || '',
        location: job.location,
        employmentType: job.employment_type || job.employmentType,
        source: job.source,
        ats: job.ats,
        postedAt: job.posted_date || job.postedAt,
        closingAt: job.closing_date || job.closingAt
      });
      const match = scoreCandidateAgainstJob({
        job: { ...job, ...analysis },
        skills,
        cvText,
        yearsExperience
      });
      return { ...job, ...analysis, match, sponsorship: sponsorship.decision, visaSponsors };
    });
}

app.get('/api/live-jobs/:slug', async (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
  if (!slug) return res.status(400).json({ error: 'Invalid company slug' });
  try {
    const companyName = req.query.name || slug;
    let careersUrl = String(req.query.careersUrl || '').trim();
    if (/google\.com\/search/i.test(careersUrl)) careersUrl = '';
    const jobs = await fetchAllATS(slug, companyName, careersUrl);
    const sponsorshipRecord = getSponsorshipRecord(req.query.sponsorship);
    const enriched = enrichJobs(jobs, getSkills(req), sponsorshipRecord).slice(0, 50);
    return res.json({ company: slug, companyName, jobs: enriched, count: enriched.length, totalFound: jobs.length, fetched_at: new Date().toISOString(), source: 'ats', dates_real: true, ats_used: [...new Set(enriched.map(job => job.ats).filter(Boolean))] });
  } catch (error) {
    return res.status(500).json({ error: error.message, company: slug });
  }
});

app.post('/api/live-jobs/batch', async (req, res) => {
  const { companies, cvSkills, cvText, yearsExperience } = req.body || {};
  if (!Array.isArray(companies)) return res.status(400).json({ error: 'companies array required' });
  if (companies.length > 50) return res.status(400).json({ error: 'Max 50 per batch' });
  const skills = Array.isArray(cvSkills) && cvSkills.length ? cvSkills : ['react', 'typescript', 'node.js'];
  const results = [];
  for (const company of companies) {
    const rawSlug = company?.slug || company?.name || '';
    const slug = String(rawSlug).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
    if (!slug) { results.push({ name: company?.name, jobs: [], count: 0, error: 'Invalid company' }); continue; }
    let careersUrl = String(company?.careersUrl || '').trim();
    if (/google\.com\/search/i.test(careersUrl)) careersUrl = '';
    try {
      const jobs = await fetchAllATS(slug, company.name, careersUrl);
      const enriched = enrichJobs(jobs, skills, company.sponsorship || {}, cvText || '', Number(yearsExperience || 0)).slice(0, 20);
      results.push({ company: slug, name: company.name, jobs: enriched, count: enriched.length, ats: [...new Set(enriched.map(job => job.ats).filter(Boolean))] });
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) { results.push({ company: slug, name: company.name, jobs: [], count: 0, error: error.message }); }
  }
  res.json({ results, totalCompanies: companies.length, totalJobs: results.reduce((sum, result) => sum + result.count, 0) });
});

app.post('/api/parse-cv', (req, res) => {
  const { cvText } = req.body || {};
  if (!cvText) return res.status(400).json({ error: 'cvText required' });
  res.json(parseCV(cvText));
});

app.post('/api/generate-latex', (req, res) => {
  const { companyName, role, jobDescription, cvSkills } = req.body || {};
  if (!companyName || !role) return res.status(400).json({ error: 'companyName and role required' });
  const latex = generateLatexCV({ companyName, role, jobDescription: jobDescription || '', cvSkills: cvSkills || ['react', 'typescript', 'node.js'] });
  res.json({ latex, filename: `Raghav_Mittal_${companyName.replace(/\s+/g, '_')}_${role.replace(/\s+/g, '_')}.tex` });
});

app.post('/api/generate-cover-letter', (req, res) => {
  const { companyName, role, location, jobDescription } = req.body || {};
  if (!companyName || !role) return res.status(400).json({ error: 'companyName and role required' });
  res.json({ letter: generateCoverLetter({ companyName, role, location, jobDescription }), filename: `Cover_Letter_${companyName.replace(/\s+/g, '_')}_${role.replace(/\s+/g, '_')}.txt` });
});

app.post('/api/optimise-application', async (req, res) => {
  const { companyName, role, jobDescription, candidateEvidence, candidatePack, companyMaterial, recipient, task } = req.body || {};
  if (!companyName || !role || !jobDescription || !(candidateEvidence || candidatePack)) return res.status(400).json({ error: 'companyName, role, jobDescription and candidateEvidence/candidatePack are required' });
  if (!openai) return res.status(503).json({ error: 'OpenAI is required for application optimisation', hasOpenAIKey: false });
  const requestInput = { companyName, role, jobDescription, candidateEvidence, candidatePack, companyMaterial, recipient, task: task || 'full' };
  const { classification, keywords, messages } = buildStructuredApplicationMessages(requestInput);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const completion = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages, temperature: 0.1, response_format: { type: 'json_object' } }, { signal: controller.signal });
    const content = completion.choices?.[0]?.message?.content || '{}';
    let parsed = null;
    try { parsed = JSON.parse(content); } catch { parsed = null; }
    if (!parsed || typeof parsed !== 'object') return res.status(502).json({ error: 'Model returned invalid JSON', raw: content });
    const cleaned = stripUnsupportedFields(parsed);
    const validation = validateApplicationOutput(cleaned, { publicSector: classification.isPublicSector, candidateEvidence: candidateEvidence || candidatePack || '' });
    return res.json({ classification, extractedKeywords: keywords, result: cleaned, validation, source: 'openai', usage: completion.usage || null });
  } catch (error) {
    console.error('Application optimisation error:', error.message);
    return res.status(error.name === 'AbortError' ? 504 : 502).json({ error: 'Application optimisation failed', message: error.message });
  } finally { clearTimeout(timeout); }
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Server error', message: error.message });
});

export { app };

export async function startServer(port = PORT) {
  try {
    const connection = await connectMongo();
    console.log(`MongoDB connected: ${connection.name}`);
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    process.exitCode = 1;
    return null;
  }
  const server = app.listen(port, () => console.log(`Backend http://localhost:${port}`));
  server.on('error', error => {
    if (error.code === 'EADDRINUSE') { console.log(`Port ${port} in use, trying ${port + 1}`); startServer(port + 1); }
    else console.error(error);
  });
  return server;
}

if (process.env.NODE_ENV !== 'test') startServer(PORT);
