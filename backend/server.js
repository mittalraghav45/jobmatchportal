import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors({ origin: ['http://localhost:5173','http://localhost:3000','http://localhost:5174'], credentials: true }));
app.use(express.json({ limit: '10mb' }));

const PERPLEXITY_KEY = process.env.PERPLEXITY_API_KEY;
const PORT = process.env.PORT || 3001;

app.get('/api/health', (req,res)=> {
  res.json({ ok:true, hasPerplexityKey: !!PERPLEXITY_KEY, port: PORT, timestamp: new Date().toISOString() });
});

app.post('/api/search', async (req,res)=>{
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });
  if (!PERPLEXITY_KEY) return res.json({ mock:true, message:'Set PERPLEXITY_API_KEY in backend/.env - get from https://www.perplexity.ai/settings/api - min top-up $3 card / $5 bank' });

  const controller = new AbortController();
  const timeout = setTimeout(()=> controller.abort(), 15000);

  try {
    const r = await fetch('https://api.perplexity.ai/chat/completions', {
      method:'POST',
      headers:{'Authorization':`Bearer ${PERPLEXITY_KEY}`,'Content-Type':'application/json'},
      body: JSON.stringify({
        model:'sonar-pro',
        messages:[
          { role:'system', content:'You are a UK visa job researcher. Return ONLY valid JSON with shape: {"companies": [{"name": string, "location": string, "industry": string, "roles": [string], "salaryMin": number, "salaryMax": number, "careersUrl": string, "isHiring": boolean}]} Focus on A-rated Skilled Worker sponsors in UK for React/TypeScript/Node.' },
          { role:'user', content: query }
        ],
        temperature:0.2
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (r.status===402) return res.status(402).json({ error:'Insufficient Perplexity credits - top up at https://www.perplexity.ai/settings/api', code:402, mock:true });
    if (r.status===401) return res.status(401).json({ error:'Invalid Perplexity API key - check backend/.env', code:401 });
    if (r.status===429) return res.status(429).json({ error:'Perplexity rate limit - wait 60s and retry', code:429 });
    if (!r.ok) { const txt=await r.text(); return res.status(r.status).json({ error:`Perplexity API error ${r.status}: ${txt.slice(0,200)}` }); }

    const data = await r.json();
    const content = data.choices?.[0]?.message?.content || '';
    let parsed = null;
    try { const m=content.match(/\{[\s\S]*\}/); if (m) parsed=JSON.parse(m[0]); } catch(e){ parsed=null; }
    res.json({ raw:data, content, parsed, hasKey:true });

  } catch(e) {
    clearTimeout(timeout);
    if (e.name==='AbortError') return res.status(504).json({ error:'Perplexity timeout after 15s - check internet or try again', timeout:true });
    res.status(500).json({ error:e.message });
  }
});

app.use((err, req, res, next)=>{ console.error(err); res.status(500).json({ error:'Server error', message:err.message }); });

let serverPort = PORT;
function startServer(port) {
  app.listen(port, ()=> console.log(`✅ Backend running on http://localhost:${port} - Foolproof - Perplexity key: ${PERPLEXITY_KEY?'SET':'NOT SET - add to .env'}`))
  .on('error', (err)=>{ if (err.code==='EADDRINUSE'){ console.log(`Port ${port} in use, trying ${port+1}`); startServer(port+1); } else { console.error(err); } });
}
startServer(serverPort);
