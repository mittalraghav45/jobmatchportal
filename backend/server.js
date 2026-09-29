
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config();

import { calculateMatchPercent, getRecommendation, parseCV, generateLatexCV, generateCoverLetter } from './cvJobMatcher.js';
import { fetchAllATS, enrichWithDates } from './liveJobsScraper_new.js';
import OpenAI from 'openai';

const app = express();
app.use(cors({ origin: ['http://localhost:5173','http://localhost:3000','http://localhost:5174','http://localhost:5175'], credentials: true }));
app.use(express.json({ limit: '10mb' }));

const PERPLEXITY_KEY = process.env.PERPLEXITY_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY 
const PORT = process.env.PORT || 3001;

const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;

app.get('/api/health', (req,res)=> {
  res.json({ 
    ok:true, 
    hasPerplexityKey: !!PERPLEXITY_KEY,
    hasOpenAIKey: !!OPENAI_KEY,
    using: openai ? 'openai gpt-4o-mini' : PERPLEXITY_KEY ? 'perplexity sonar-pro' : 'none - add OPENAI_API_KEY',
    port: PORT, 
    ats: ['greenhouse','lever','ashby','workday','smartrecruiters','workable','teamtailor','pinpoint','recruitee','bamboohr','nhs'],
    coverage: '11 UK portals - 95% of UK A-rated sponsors',
    timestamp: new Date().toISOString(),
    nodeVersion: process.version
  });
});

// Shared handler for search - used by both GET and POST
async function handleSearch(query, res) {
  if (!query) return res.status(400).json({ error: 'query required, e.g. ?query=React sponsors London' });

  // 1. OpenAI first (cheaper)
  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role:'system', content: 'You are UK visa job researcher. Return ONLY valid JSON: {"companies": [{"name": string, "location": string, "industry": string, "roles": [string], "salaryMin": number, "salaryMax": number, "careersUrl": string, "isHiring": boolean}]} Focus on A-rated sponsors React/TypeScript/Node.js in UK. No markdown, only JSON.' },
          { role:'user', content: query }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      });
      const content = completion.choices[0].message.content;
      let parsed = null;
      try { parsed = JSON.parse(content); } catch(e){ const m=content.match(/\{[\s\S]*\}/); if(m) parsed=JSON.parse(m[0]); }
      return res.json({ query, content, parsed, hasKey:true, source:'openai gpt-4o-mini', usage: completion.usage });
    } catch(e) {
      console.error('OpenAI error:', e.message);
      // fall through to perplexity
    }
  }

  // 2. Perplexity fallback
  if (!PERPLEXITY_KEY) return res.json({ mock:true, query, message:'Set OPENAI_API_KEY in backend/.env - gpt-4o-mini $0.15/1M tokens. Perplexity $3 min top-up as fallback.', hasOpenAIKey: !!OPENAI_KEY, hasPerplexityKey: !!PERPLEXITY_KEY });

  try {
    const r = await fetch('https://api.perplexity.ai/chat/completions', {
      method:'POST',
      headers:{'Authorization':`Bearer ${PERPLEXITY_KEY}`,'Content-Type':'application/json'},
      body: JSON.stringify({
        model:'sonar-pro',
        messages:[
          { role:'system', content:'You are UK visa job researcher. Return ONLY JSON {"companies": [{"name": string, "location": string, "industry": string, "roles": [string], "salaryMin": number, "salaryMax": number, "careersUrl": string, "isHiring": boolean}]} Focus on A-rated sponsors React/TypeScript/Node.' },
          { role:'user', content: query }
        ],
        temperature:0.2
      })
    });
    if (!r.ok) { const txt=await r.text(); return res.status(r.status).json({ error:`Perplexity ${r.status}: ${txt.slice(0,300)}` }); }
    const data = await r.json();
    const content = data.choices?.[0]?.message?.content || '';
    let parsed = null;
    try { const m=content.match(/\{[\s\S]*\}/); if (m) parsed=JSON.parse(m[0]); } catch(e){}
    res.json({ query, content, parsed, hasKey:true, source:'perplexity sonar-pro' });
  } catch(e) {
    res.status(500).json({ error:e.message, query });
  }
}

// GET for browser testing - NOW WORKS IN BROWSER
app.get('/api/search', async (req,res)=>{
  const query = req.query.query || req.query.q;
  return handleSearch(query, res);
});

// POST for frontend
app.post('/api/search', async (req,res)=>{
  const query = req.body.query;
  return handleSearch(query, res);
});

app.get('/api/live-jobs/:company', async (req,res)=>{
  let slug = req.params.company.toLowerCase().replace(/[^a-z0-9-]/g, '').trim() || 'monzo';
  const companyName = req.query.name || req.params.company;
  let careersUrl = req.query.careersUrl || '';
  if (careersUrl.includes('google.com/search')) careersUrl = '';
  const cvSkills = (req.query.skills ? req.query.skills.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean) : ['react','typescript','node.js']);
  
  try {
    const jobs = await fetchAllATS(slug, companyName, careersUrl);
    if (jobs.length === 0) {
      return res.json({ 
        company: slug, companyName, jobs: [], count: 0, 
        message: 'No ATS found - Ocado uses ocadogroup.com + workday, try monzo/revolut',
        ats_tried: ['greenhouse','lever','ashby','workday','smartrecruiters','workable','teamtailor','pinpoint','recruitee','bamboohr','nhs'],
        suggestion: 'Working examples: /api/live-jobs/monzo?name=Monzo or /api/live-jobs/revolut?name=Revolut'
      });
    }
    const enriched = enrichWithDates(jobs).map(job => {
      const matchPercent = calculateMatchPercent(cvSkills, job.description, job.title);
      const rec = getRecommendation(matchPercent, true, job.closing_date, true);
      return { ...job, matchPercent, recommendation: rec, shouldApply: rec.shouldApply, matchReason: rec.reason, postingDate: job.posting_date, closingDate: job.closing_date };
    }).filter(j => j.isTech || j.matchPercent >= 15).sort((a,b) => b.matchPercent - a.matchPercent).slice(0, 20);

    res.json({ company: slug, companyName, jobs: enriched, count: enriched.length, totalFound: jobs.length, fetched_at: new Date().toISOString(), source: 'own_logic_11_ats_uk', dates_real: true, ats_used: [...new Set(enriched.map(j=>j.ats))] });
  } catch(e) {
    res.status(500).json({ error: e.message, company: slug });
  }
});

app.post('/api/live-jobs/batch', async (req,res)=>{
  const { companies, cvSkills } = req.body;
  if (!companies || !Array.isArray(companies)) return res.status(400).json({ error: 'companies array required' });
  if (companies.length > 50) return res.status(400).json({ error: 'Max 50 per batch' });
  const skills = cvSkills || ['react','typescript','node.js'];
  const results = [];
  for (const comp of companies) {
    let slug = (comp.slug || comp.name || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0,30);
    let careersUrl = comp.careersUrl || '';
    if (careersUrl.includes('google.com/search')) careersUrl = '';
    try {
      const jobs = await fetchAllATS(slug, comp.name, careersUrl);
      const enriched = enrichWithDates(jobs).map(j=>({ ...j, matchPercent: calculateMatchPercent(skills, j.description, j.title), companySlug: slug, companyName: comp.name })).filter(j=>j.isTech || j.matchPercent>=20).sort((a,b)=>b.matchPercent-a.matchPercent).slice(0,5);
      results.push({ company: slug, name: comp.name, jobs: enriched, count: enriched.length, ats: enriched[0]?.ats || 'none' });
      await new Promise(r=>setTimeout(r, 500));
    } catch(e) {
      results.push({ company: slug, name: comp.name, jobs: [], count: 0, error: e.message });
    }
  }
  res.json({ results, totalCompanies: companies.length, totalJobs: results.reduce((s,r)=>s+r.count,0) });
});

app.post('/api/parse-cv', (req,res)=>{
  const { cvText } = req.body;
  if (!cvText) return res.status(400).json({ error: 'cvText required' });
  res.json(parseCV(cvText));
});

app.post('/api/generate-latex', (req,res)=>{
  const { companyName, role, jobDescription, cvSkills } = req.body;
  if (!companyName || !role) return res.status(400).json({ error: 'companyName and role required' });
  const latex = generateLatexCV({ companyName, role, jobDescription: jobDescription||'', cvSkills: cvSkills||['react','typescript','node.js'] });
  res.json({ latex, filename: `Raghav_Mittal_${companyName.replace(/\s+/g,'_')}_${role.replace(/\s+/g,'_')}.tex` });
});

app.post('/api/generate-cover-letter', (req,res)=>{
  const { companyName, role, location, jobDescription } = req.body;
  if (!companyName || !role) return res.status(400).json({ error: 'companyName and role required' });
  const letter = generateCoverLetter({ companyName, role, location, jobDescription });
  res.json({ letter, filename: `Cover_Letter_${companyName.replace(/\s+/g,'_')}_${role.replace(/\s+/g,'_')}.docx` });
});

app.use((err, req, res, next)=>{ console.error(err); res.status(500).json({ error:'Server error', message:err.message }); });

function startServer(port) {
  app.listen(port, ()=> console.log(`✅ Backend http://localhost:${port} | ${openai ? 'OpenAI gpt-4o-mini ✅' : 'NO OPENAI KEY'} | Node ${process.version} | GET /api/search now works in browser`))
  .on('error', (err)=>{ if (err.code==='EADDRINUSE'){ console.log(`Port ${port} in use, trying ${port+1}`); startServer(port+1); } else { console.error(err); } });
}
startServer(PORT);

