import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

import { calculateMatchPercent, getRecommendation, parseCV, generateLatexCV, generateCoverLetter, getMatchBreakdown } from './cvJobMatcher.js';
import { fetchAllATS, enrichWithDates } from './liveJobsScraper_new.js';
import { buildStructuredApplicationMessages } from './applicationEngine.js';
import { validateApplicationOutput, stripUnsupportedFields } from './applicationValidator.js';
import { evaluateSponsorship } from './sponsorRegistry.js';
import { analyseJob, scoreCandidateAgainstJob } from './jobIntelligence.js';
import profileRoutes from './routes/profileRoutes.js';
import matchRoutes from './routes/matchRoutes.js';

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

app.get('/api/health', (req, res) => res.json({
  ok: true,
  hasPerplexityKey: Boolean(PERPLEXITY_KEY),
  hasOpenAIKey: Boolean(OPENAI_KEY),
  using: openai ? 'openai' : PERPLEXITY_KEY ? 'perplexity' : 'none',
  port: PORT,
  ats: ATS_LIST,
  timestamp: new Date().toISOString(),
  nodeVersion: process.version
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
      const candidateScore = scoreCandidateAgainstJob({
        cvSkills: skills,
        cvText,
        yearsExperience,
        job: analysis
      });
      const matchPercent = cvText || yearsExperience
        ? candidateScore.score
        : calculateMatchPercent(skills, job.description, job.title);
      const breakdown = getMatchBreakdown(skills, job.description, job.title);
      const recommendation = getRecommendation(matchPercent, job.isLive, job.closing_date, visaSponsors);

      return {
        ...job,
        jobIntelligence: analysis,
        matchPercent,
        matchBreakdown: breakdown,
        candidateScore,
        sponsorship: sponsorship.sponsor,
        sponsorshipDecision: sponsorship.decision,
        recommendation,
        shouldApply: recommendation.shouldApply,
        matchReason: recommendation.reason
      };
    })
    .filter(job => job.isLive !== false && (job.isTech || job.matchPercent >= 15))
    .sort((a, b) => b.matchPercent - a.matchPercent);
}

app.post('/api/sponsorship/evaluate', (req, res) => {
  res.json(evaluateSponsorship(req.body?.sponsorship || req.body || {}));
});

app.post('/api/job-intelligence/analyse', (req, res) => {
  const {
    title, description, location, employmentType, source, ats,
    postedAt, closingAt, cvSkills, cvText, yearsExperience
  } = req.body || {};

  if (!title || !description) {
    return res.status(400).json({ error: 'title and description are required' });
  }

  const analysis = analyseJob({ title, description, location, employmentType, source, ats, postedAt, closingAt });
  const candidateScore = scoreCandidateAgainstJob({
    cvSkills: Array.isArray(cvSkills) ? cvSkills : [],
    cvText: cvText || '',
    yearsExperience: Number(yearsExperience || 0),
    job: analysis
  });

  res.json({ analysis, candidateScore });
});

async function handleSearch(query, res) {
  if (!query) {
    return res.status(400).json({ error: 'query required, e.g. ?query=React sponsors London' });
  }

  if (openai) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Return only valid JSON: {"companies":[{"name":string,"location":string,"industry":string,"roles":[string],"salaryMin":number|null,"salaryMax":number|null,"careersUrl":string,"isHiring":boolean}]}. Do not invent live vacancies, sponsorship status, salary or URLs. If uncertain, use null/false.'
          },
          { role: 'user', content: query }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      }, { signal: controller.signal });

      const content = completion.choices?.[0]?.message?.content || '{}';
      let parsed = null;
      try { parsed = JSON.parse(content); } catch { parsed = null; }
      return res.json({ query, content, parsed, hasKey: true, source: 'openai_gpt-4o-mini', usage: completion.usage || null });
    } catch (error) {
      console.error('OpenAI search error:', error.message);
    } finally {
      clearTimeout(timeout);
    }
  }

  if (!PERPLEXITY_KEY) {
    return res.status(503).json({
      error: 'No AI search provider configured',
      hasOpenAIKey: Boolean(OPENAI_KEY),
      hasPerplexityKey: false
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PERPLEXITY_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content: 'Return only valid JSON with a companies array. Do not invent live vacancies, sponsorship status, salary or URLs. If uncertain use null/false.'
          },
          { role: 'user', content: query }
        ],
        temperature: 0.1
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `Perplexity ${response.status}: ${text.slice(0, 300)}` });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    let parsed = null;
    try {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch { parsed = null; }

    return res.json({ query, content, parsed, hasKey: true, source: 'perplexity_fallback' });
  } catch (error) {
    return res.status(error.name === 'AbortError' ? 504 : 500).json({ error: error.message, query });
  } finally {
    clearTimeout(timeout);
  }
}

app.get('/api/search', async (req, res) => {
  return handleSearch(req.query.query || req.query.q, res);
});

app.post('/api/search', async (req, res) => {
  return handleSearch(req.body?.query, res);
});

app.get('/api/live-jobs/:company', async (req, res) => {
  const rawCompany = String(req.params.company || '').trim();
  const slug = rawCompany.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
  if (!slug) return res.status(400).json({ error: 'company slug required' });

  const companyName = String(req.query.name || rawCompany).trim();
  let careersUrl = String(req.query.careersUrl || '').trim();
  if (/google\.com\/search/i.test(careersUrl)) careersUrl = '';
  const sponsorshipRecord = getSponsorshipRecord(req.query.sponsorship);

  try {
    const jobs = await fetchAllATS(slug, companyName, careersUrl);
    const enriched = enrichJobs(jobs, getSkills(req), sponsorshipRecord).slice(0, 50);

    return res.json({
      company: slug,
      companyName,
      jobs: enriched,
      count: enriched.length,
      totalFound: jobs.length,
      fetched_at: new Date().toISOString(),
      source: 'ats',
      dates_real: true,
      ats_used: [...new Set(enriched.map(job => job.ats).filter(Boolean))]
    });
  } catch (error) {
    return res.status(500).json({ error: error.message, company: slug });
  }
});

app.post('/api/live-jobs/batch', async (req, res) => {
  const { companies, cvSkills, cvText, yearsExperience } = req.body || {};
  if (!Array.isArray(companies)) return res.status(400).json({ error: 'companies array required' });
  if (companies.length > 50) return res.status(400).json({ error: 'Max 50 per batch' });
