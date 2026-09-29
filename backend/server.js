
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config();

import { calculateMatchPercent, getRecommendation, parseCV, generateLatexCV, generateCoverLetter, getMatchBreakdown } from './cvJobMatcher.js';
import { fetchAllATS, enrichWithDates } from './liveJobsScraper_new.js';
import { buildStructuredApplicationMessages } from './applicationEngine.js';
import { validateApplicationOutput, stripUnsupportedFields } from './applicationValidator.js';
import { evaluateSponsorship } from './sponsorRegistry.js';
import { analyseJob, scoreCandidateAgainstJob } from './jobIntelligence.js';
import OpenAI from 'openai';

const app = express();
app.use(cors({ origin: ['http://localhost:5173','http://localhost:3000','http://localhost:5174','http://localhost:5175'], credentials: true }));
app.use(express.json({ limit: '10mb' }));

const PERPLEXITY_KEY = process.env.PERPLEXITY_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY  
const PORT = process.env.PORT || 3001;
const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;
const ATS_LIST = ['greenhouse','lever','ashby','workday','smartrecruiters','workable','teamtailor','pinpoint','recruitee','bamboohr','nhs'];

app.get('/api/health', (req,res)=> res.json({ ok:true, hasPerplexityKey:!!PERPLEXITY_KEY, hasOpenAIKey:!!OPENAI_KEY, using:openai?'openai':PERPLEXITY_KEY?'perplexity':'none', port:PORT, ats:ATS_LIST, timestamp:new Date().toISOString(), nodeVersion:process.version }));

function getSkills(req) { return req.query.skills ? req.query.skills.split(',').map(s=>s.trim()).filter(Boolean) : ['react','typescript','node.js']; }
function getSponsorshipRecord(value) { if (!value) return {}; if (typeof value === 'object') return value; try { return JSON.parse(value); } catch { return { status: String(value) }; } }

function enrichJobs(jobs, skills, sponsorshipRecord = {}, cvText = '', yearsExperience = 0) {
  const sponsorship = evaluateSponsorship(sponsorshipRecord);
  const visaSponsors = sponsorship.decision === 'not-sponsor' ? false : sponsorship.decision === 'verified' ? true : null;
  return enrichWithDates(jobs).map(job => {
    const analysis = analyseJob({ title: job.title, description: job.description || '', location: job.location, employmentType: job.employment_type || job.employmentType, source: job.source, ats: job.ats, postedAt: job.posted_date || job.postedAt, closingAt: job.closing_date || job.closingAt });
    const candidateScore = scoreCandidateAgainstJob({ cvSkills: skills, cvText, yearsExperience, job: analysis });
    const matchPercent = cvText || yearsExperience ? candidateScore.score : calculateMatchPercent(skills, job.description, job.title);
    const breakdown = getMatchBreakdown(skills, job.description, job.title);
    const rec = getRecommendation(matchPercent, job.isLive, job.closing_date, visaSponsors);
    return { ...job, jobIntelligence: analysis, matchPercent, matchBreakdown:breakdown, candidateScore, sponsorship:sponsorship.sponsor, sponsorshipDecision:sponsorship.decision, recommendation:rec, shouldApply:rec.shouldApply, matchReason:rec.reason };
  }).filter(j => j.isLive !== false && (j.isTech || j.matchPercent >= 15)).sort((a,b)=>b.matchPercent-a.matchPercent);
}

app.post('/api/sponsorship/evaluate',(req,res)=> res.json(evaluateSponsorship(req.body?.sponsorship || req.body || {})));

app.post('/api/job-intelligence/analyse',(req,res)=>{
  const {title, description, location, employmentType, source, ats, postedAt, closingAt, cvSkills, cvText, yearsExperience} = req.body || {};
  if (!title || !description) return res.status(400).json({error:'title and description are required'});
  const analysis = analyseJob({title, description, location, employmentType, source, ats, postedAt, closingAt});
  const candidateScore = scoreCandidateAgainstJob({cvSkills:Array.isArray(cvSkills) ? cvSkills : [], cvText:cvText || '', yearsExperience:Number(yearsExperience || 0), job:analysis});
  res.json({analysis, candidateScore});
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
  const rawCompany = req.params.company || ''; const slug = rawCompany.toLowerCase().replace(/[^a-z0-9-]/g, '').trim();
  if (!slug) return res.status(400).json({error:'company slug required'});
  const companyName = req.query.name || rawCompany; let careersUrl = req.query.careersUrl || '';
  if (/google\.com\/search/i.test(careersUrl)) careersUrl = '';
  const sponsorshipRecord = getSponsorshipRecord(req.query.sponsorship);
  try { const jobs = await fetchAllATS(slug, companyName, careersUrl); const enriched = enrichJobs(jobs, getSkills(req), sponsorshipRecord).slice(0, 50); res.json({ company:slug, companyName, jobs:enriched, count:enriched.length, totalFound:jobs.length, fetched_at:new Date().toISOString(), source:'ats', dates_real:true, ats_used:[...new Set(enriched.map(j=>j.ats))] }); }
  catch(e) { res.status(500).json({error:e.message,company:slug}); }
});

app.post('/api/live-jobs/batch', async (req,res)=>{
  const { companies, cvSkills, cvText, yearsExperience } = req.body;
  if (!Array.isArray(companies)) return res.status(400).json({error:'companies array required'});
  if (companies.length > 50) return res.status(400).json({error:'Max 50 per batch'});
  const skills = Array.isArray(cvSkills) && cvSkills.length ? cvSkills : ['react','typescript','node.js']; const results=[];
  for (const comp of companies) {
    const slug=(comp.slug||comp.name||'').toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,60);
    if (!slug) { results.push({name:comp.name,jobs:[],count:0,error:'Invalid company'}); continue; }
    let careersUrl=comp.careersUrl||''; if (/google\.com\/search/i.test(careersUrl)) careersUrl='';
    try { const jobs=await fetchAllATS(slug,comp.name,careersUrl); const enriched=enrichJobs(jobs,skills,comp.sponsorship || {},cvText || '',Number(yearsExperience || 0)).slice(0,20); results.push({company:slug,name:comp.name,jobs:enriched,count:enriched.length,ats:[...new Set(enriched.map(j=>j.ats))]}); await new Promise(r=>setTimeout(r,500)); }
    catch(e) { results.push({company:slug,name:comp.name,jobs:[],count:0,error:e.message}); }
  }
  res.json({results,totalCompanies:companies.length,totalJobs:results.reduce((s,r)=>s+r.count,0)});
});

app.post('/api/parse-cv',(req,res)=>{ const {cvText}=req.body; if (!cvText) return res.status(400).json({error:'cvText required'}); res.json(parseCV(cvText)); });
app.post('/api/generate-latex',(req,res)=>{ const {companyName,role,jobDescription,cvSkills}=req.body; if (!companyName||!role) return res.status(400).json({error:'companyName and role required'}); const latex=generateLatexCV({companyName,role,jobDescription:jobDescription||'',cvSkills:cvSkills||['react','typescript','node.js']}); res.json({latex,filename:`Raghav_Mittal_${companyName.replace(/\s+/g,'_')}_${role.replace(/\s+/g,'_')}.tex`}); });
app.post('/api/generate-cover-letter',(req,res)=>{ const {companyName,role,location,jobDescription}=req.body; if (!companyName||!role) return res.status(400).json({error:'companyName and role required'}); res.json({letter:generateCoverLetter({companyName,role,location,jobDescription}),filename:`Cover_Letter_${companyName.replace(/\s+/g,'_')}_${role.replace(/\s+/g,'_')}.txt`}); });

app.post('/api/optimise-application', async (req,res)=>{
  const {companyName, role, jobDescription, candidateEvidence, candidatePack, companyMaterial, recipient, task} = req.body || {};
  if (!companyName || !role || !jobDescription || !(candidateEvidence || candidatePack)) return res.status(400).json({error:'companyName, role, jobDescription and candidateEvidence/candidatePack are required'});
  if (!openai) return res.status(503).json({error:'OpenAI is required for application optimisation',hasOpenAIKey:false});
  const requestInput = { companyName, role, jobDescription, candidateEvidence, candidatePack, companyMaterial, recipient, task: task || 'full' };
  const {classification, keywords, messages} = buildStructuredApplicationMessages(requestInput);
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const completion = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages, temperature: 0.1, response_format: {type:'json_object'} }, {signal: controller.signal});
    const content = completion.choices?.[0]?.message?.content || '{}';
    let parsed; try { parsed = JSON.parse(content); } catch { parsed = null; }
    if (!parsed || typeof parsed !== 'object') return res.status(502).json({error:'Model returned invalid JSON',raw:content});
    const cleaned = stripUnsupportedFields(parsed);
    const validation = validateApplicationOutput(cleaned, { publicSector: classification.isPublicSector, candidateEvidence: candidateEvidence || candidatePack || '' });
    return res.json({classification, extractedKeywords:keywords, result:cleaned, validation, source:'openai', usage:completion.usage || null});
  } catch (e) {
    console.error('Application optimisation error:', e.message);
    return res.status(e.name === 'AbortError' ? 504 : 502).json({error:'Application optimisation failed',message:e.message});
  } finally { clearTimeout(timeout); }
});

app.post('/api/search',async(req,res)=>{
  const {query}=req.body; if (!query) return res.status(400).json({error:'query required'});
  if (openai) {
    const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),15000);
    try { const completion=await openai.chat.completions.create({model:'gpt-4o-mini',messages:[{role:'system',content:'Return only JSON: {"companies":[{"name":string,"location":string,"industry":string,"roles":[string],"salaryMin":number|null,"salaryMax":number|null,"careersUrl":string,"isHiring":boolean}]}. Do not invent live vacancies, sponsorship status, salary or URLs. If uncertain, use null/false.'},{role:'user',content:query}],temperature:0.1,response_format:{type:'json_object'}} ,{signal:controller.signal}); clearTimeout(timeout); const content=completion.choices[0].message.content||'{}'; let parsed=null; try { parsed=JSON.parse(content); } catch {} return res.json({content,parsed,hasKey:true,source:'openai_gpt-4o-mini',usage:completion.usage}); }
    catch(e) { clearTimeout(timeout); console.error('OpenAI error:',e.message); }
  }
  if (!PERPLEXITY_KEY) return res.status(503).json({error:'No AI search provider configured',hasOpenAIKey:!!OPENAI_KEY,hasPerplexityKey:false});
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),15000);
  try { const r=await fetch('https://api.perplexity.ai/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${PERPLEXITY_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:'sonar-pro',messages:[{role:'system',content:'Return only JSON with companies. Do not invent live vacancies, sponsorship status, salary or URLs. If uncertain use null/false.'},{role:'user',content:query}],temperature:0.1}),signal:controller.signal}); clearTimeout(timeout); if (!r.ok) return res.status(r.status).json({error:`Perplexity ${r.status}`}); const data=await r.json(); const content=data.choices?.[0]?.message?.content||''; let parsed=null; try { const m=content.match(/\{[\s\S]*\}/); if(m) parsed=JSON.parse(m[0]); } catch {} return res.json({raw:data,content,parsed,hasKey:true,source:'perplexity_fallback'}); }
  catch(e) { clearTimeout(timeout); res.status(500).json({error:e.message}); }
});

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Server error',message:err.message});});
function startServer(port) { const server=app.listen(port,()=>console.log(`Backend http://localhost:${port}`)); server.on('error',err=>{if(err.code==='EADDRINUSE'){console.log(`Port ${port} in use, trying ${port+1}`);startServer(port+1);}else console.error(err);}); }
app.use((err, req, res, next)=>{ console.error(err); res.status(500).json({ error:'Server error', message:err.message }); });

function startServer(port) {
  app.listen(port, ()=> console.log(`✅ Backend http://localhost:${port} | ${openai ? 'OpenAI gpt-4o-mini ✅' : 'NO OPENAI KEY'} | Node ${process.version} | GET /api/search now works in browser`))
  .on('error', (err)=>{ if (err.code==='EADDRINUSE'){ console.log(`Port ${port} in use, trying ${port+1}`); startServer(port+1); } else { console.error(err); } });
}
startServer(PORT);

