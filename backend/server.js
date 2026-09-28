
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { calculateMatchPercent, getRecommendation, parseCV, generateLatexCV, generateCoverLetter } from './cvJobMatcher.js';
import { fetchAllATS, enrichWithDates } from './liveJobsScraper_new.js';
dotenv.config();

const app = express();
app.use(cors({ origin: ['http://localhost:5173','http://localhost:3000','http://localhost:5174','http://localhost:5175'], credentials: true }));
app.use(express.json({ limit: '10mb' }));

const PERPLEXITY_KEY = process.env.PERPLEXITY_API_KEY;
const PORT = process.env.PORT || 3001;

app.get('/api/health', (req,res)=> {
  res.json({ 
    ok:true, 
    hasPerplexityKey: !!PERPLEXITY_KEY, 
    port: PORT, 
    ats: ['greenhouse','lever','ashby','workday','smartrecruiters','workable','teamtailor','pinpoint','recruitee','bamboohr','nhs'],
    coverage: '11 UK portals - 95% of UK A-rated sponsors',
    timestamp: new Date().toISOString() 
  });
});

// REAL ATS - ALL UK PORTALS - Own logic > Perplexity for dates
// GET /api/live-jobs/ocado?skills=react,typescript,node.js&careersUrl=https://boards.greenhouse.io/ocado&name=Ocado%20Technology
app.get('/api/live-jobs/:company', async (req,res)=>{
  const slug = req.params.company.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const companyName = req.query.name || req.params.company;
  const careersUrl = req.query.careersUrl || '';
  const cvSkills = (req.query.skills ? req.query.skills.split(',') : ['react','typescript','node.js','javascript','next.js']);
  
  console.log(`🔍 Live jobs: ${slug} (${companyName}) via ${careersUrl || 'auto-detect'} | skills: ${cvSkills.join(',')}`);
  
  try {
    const jobs = await fetchAllATS(slug, companyName, careersUrl);
    
    if (jobs.length === 0) {
      return res.json({ 
        company: slug, 
        companyName,
        jobs: [], 
        count: 0, 
        message: 'No ATS found - use Perplexity fallback or provide careersUrl',
        ats_tried: ['greenhouse','lever','ashby','workday','smartrecruiters','workable','teamtailor','pinpoint','recruitee','bamboohr','nhs'],
        suggestion: 'Add ?careersUrl= to help detect Workday/NHS. Example: ?careersUrl=https://myworkdayjobs.com/company'
      });
    }
    
    const enriched = enrichWithDates(jobs).map(job => {
      const matchPercent = calculateMatchPercent(cvSkills, job.description, job.title);
      const rec = getRecommendation(matchPercent, true, job.closing_date, true);
      return {
        ...job,
        matchPercent,
        recommendation: rec,
        shouldApply: rec.shouldApply,
        matchReason: rec.reason,
        postingDate: job.posting_date,
        closingDate: job.closing_date
      };
    })
    .filter(j => j.isTech || j.matchPercent >= 15)
    .sort((a,b) => b.matchPercent - a.matchPercent)
    .slice(0, 20);

    res.json({ 
      company: slug,
      companyName,
      jobs: enriched, 
      count: enriched.length,
      totalFound: jobs.length,
      fetched_at: new Date().toISOString(),
      source: 'own_logic_11_ats_uk',
      dates_real: true,
      ats_used: [...new Set(enriched.map(j=>j.ats))]
    });
  } catch(e) {
    console.error('Live jobs error', e);
    res.status(500).json({ error: e.message, company: slug });
  }
});

// POST /api/live-jobs/batch - For 5000 sponsors bulk check
app.post('/api/live-jobs/batch', async (req,res)=>{
  const { companies, cvSkills } = req.body;
  if (!companies || !Array.isArray(companies)) return res.status(400).json({ error: 'companies array required' });
  if (companies.length > 50) return res.status(400).json({ error: 'Max 50 companies per batch to avoid rate limits' });
  
  const skills = cvSkills || ['react','typescript','node.js'];
  const results = [];
  
  for (const comp of companies) {
    const slug = (comp.slug || comp.name || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    try {
      const jobs = await fetchAllATS(slug, comp.name, comp.careersUrl);
      const enriched = enrichWithDates(jobs).map(j=>({
        ...j,
        matchPercent: calculateMatchPercent(skills, j.description, j.title),
        companySlug: slug,
        companyName: comp.name
      })).filter(j=>j.isTech || j.matchPercent>=20).sort((a,b)=>b.matchPercent-a.matchPercent).slice(0,5);
      
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
  const parsed = parseCV(cvText);
  res.json(parsed);
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

app.post('/api/search', async (req,res)=>{
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });
  if (!PERPLEXITY_KEY) return res.json({ mock:true, message:'Set PERPLEXITY_API_KEY in backend/.env - $3 min top-up' });
  const controller = new AbortController();
  const timeout = setTimeout(()=> controller.abort(), 15000);
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
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (r.status===402) return res.status(402).json({ error:'Insufficient Perplexity credits', code:402, mock:true });
    if (!r.ok) { const txt=await r.text(); return res.status(r.status).json({ error:`Perplexity ${r.status}: ${txt.slice(0,200)}` }); }
    const data = await r.json();
    const content = data.choices?.[0]?.message?.content || '';
    let parsed = null;
    try { const m=content.match(/\{[\s\S]*\}/); if (m) parsed=JSON.parse(m[0]); } catch(e){ parsed=null; }
    res.json({ raw:data, content, parsed, hasKey:true, source:'perplexity_fallback' });
  } catch(e) {
    clearTimeout(timeout);
    if (e.name==='AbortError') return res.status(504).json({ error:'Timeout 15s', timeout:true });
    res.status(500).json({ error:e.message });
  }
});

app.use((err, req, res, next)=>{ console.error(err); res.status(500).json({ error:'Server error', message:err.message }); });

function startServer(port) {
  app.listen(port, ()=> console.log(`✅ Backend http://localhost:${port} | 11 ATS: Greenhouse, Lever, Ashby, Workday (NHS/Uni), SmartRecruiters, Workable, Teamtailor, Pinpoint, Recruitee, BambooHR, NHS | CV Matcher + LaTeX/DOCX`))
  .on('error', (err)=>{ if (err.code==='EADDRINUSE'){ console.log(`Port ${port} in use, trying ${port+1}`); startServer(port+1); } else { console.error(err); } });
}
startServer(PORT);
