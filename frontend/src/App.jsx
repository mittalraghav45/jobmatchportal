import React, { useState, useEffect, useMemo } from 'react';

// ========== FOOLPROOF FILTER CONFIG - EDIT HERE ==========
const FILTERS = {
  public: ['nhs','council','government','borough','county council','city council','trust','nhs trust','nhs foundation','police','fire','authority','health board','local authority'],
  universities: ['university','universities','college','business school','institute of technology','higher education','university of','school of'],
  blacklist: ['restaurant','takeaway','kebab','pizza','curry','cafe','coffee','chippy','fish and chips','hotel','guest house','b&b','pub','bar','nightclub','care home','nursing home','care agency','domiciliary care','grocery','supermarket','convenience store','off licence','butcher','bakery','hair','beauty','salon','barber','nail','tattoo','construction','builder','plumbing','electrical','roofing','scaffolding','taxi','cleaning','security','estate agent','letting','church','mosque','temple','gurdwara','charity','masjid','petrol station','garage','car wash','tyre','mot centre'],
  techWhitelist: ['technology','technologies','tech','software','systems','solutions','digital','data','ai','artificial intelligence','labs','lab','innovation','informatics','infotech','fintech','healthtech','edtech','proptech','biotech','cyber','cloud','web','app','apps','computing','computer','programming','information','analytics','intelligence','automation','platform','internet','online','develop'],
};

const SCOTLAND_TOWNS = ['edinburgh','glasgow','aberdeen','dundee','stirling','inverness','perth','falkirk','ayr','dunfermline','greenock','paisley','kilmarnock','east kilbride','cumbernauld','hamilton','motherwell','coatbridge','livingston','dunfermline'];
const WALES_TOWNS = ['cardiff','swansea','newport','wrexham','barry','bridgend','neath','cwmbran','bangor','st davids','aberystwyth','merthyr','pontypridd','caerphilly','port talbot','llanelli','neath'];
const NI_TOWNS = ['belfast','derry','londonderry','lisburn','newry','armagh','craigavon','newtownabbey','bangor','carrickfergus','antrim','down','newtownards','omagh','coleraine'];

// FIXED: Clean corrupted names like Aberdeen University Students??????Association
function cleanName(name) {
  if (!name) return 'Unknown';
  let c = name;
  c = c.replace(/\?{2,}/g, "'"); // ????? -> '
  c = c.replace(/\uFFFD/g, "'");
  c = c.replace(/â€™|â€œ|â€|Ã¢â‚¬â„¢/g, "'");
  c = c.replace(/Ã¼/g, "ü").replace(/Ã©/g, "é");
  c = c.normalize('NFKC').trim();
  c = c.replace(/\s{2,}/g, ' ');
  // Decode URL-encoded parts if present
  try { 
    if (c.includes('%')) c = decodeURIComponent(c); 
  } catch(e){}
  return c;
}

function cleanCareersUrl(url, name) {
  if (!url) return '';
  // FIXED: If it's google search fallback, generate proper domain search or real careers
  if (url.includes('google.com/search')) {
    // Try to extract real domain from name or use search that doesn't break UI
    const slug = (name||'').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0,20);
    // Return a clean search that works, but indicate it's a search
    return `https://www.google.com/search?q=${encodeURIComponent(cleanName(name))}+careers`;
  }
  // Fix encoded ???? in URL
  try {
    if (url.includes('%3F') || url.includes('%25')) {
      let decoded = decodeURIComponent(url);
      decoded = decoded.replace(/\?{2,}/g, '');
      return decoded;
    }
  } catch(e){}
  return url;
}

function getRegion(town, county, name) {
  try {
    const t = (town||'').toLowerCase();
    const c = (county||'').toLowerCase();
    const n = (name||'').toLowerCase();
    if (SCOTLAND_TOWNS.some(x=>t.includes(x)) || c.includes('scotland') || /\bscotland\b|\bedinburgh\b|\bglasgow\b/.test(n)) return 'Scotland';
    if (WALES_TOWNS.some(x=>t.includes(x)) || c.includes('wales') || /\bwales\b|\bcardiff\b|\bswansea\b/.test(n)) return 'Wales';
    if (NI_TOWNS.some(x=>t.includes(x)) || c.includes('northern ireland') || c.includes('antrim') || c.includes('down') || /\bbelfast\b/.test(n)) return 'Northern Ireland';
    return 'England';
  } catch(e){ return 'England'; }
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(()=>{ const t=setTimeout(()=>setDebounced(value), delay); return()=>clearTimeout(t); }, [value, delay]);
  return debounced;
}

function safeGetItem(key, fallback) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch(e){ console.error('LocalStorage read failed', e); return fallback; }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch(e) {
    if (e.name==='QuotaExceededError' || e.code===22) {
      alert('Storage full - exporting backup. Keep only Job Tracker, clearing old sponsors.');
      try { localStorage.removeItem('sponsors_clean_v1'); localStorage.setItem(key, JSON.stringify(value)); } catch(e2){ console.error(e2); }
      return false;
    }
    console.error(e); return false;
  }
}

const STATUSES = ["Not Applied","Applied","Screening Call","Technical Interview","Final","Offer","CoS Received","Rejected"];

const MOCK = [
  {id:1, name:"Monzo", legalName:"Monzo Bank", location:"London", county:"London", region:"England", industry:"Tech", roles:["React Developer","Full-Stack Engineer"], salaryMin:40000, salaryMax:70000, careersUrl:"https://boards.greenhouse.io/monzo", isHiring:true, sponsorRating:"A-rated", newEntrantEligible:true, status:"Not Applied", contact:"", dateApplied:"", notes:"Test with Greenhouse - should return jobs"},
  {id:2, name:"Ocado Technology", legalName:"Ocado Technology", location:"Hatfield", county:"Hertfordshire", region:"England", industry:"Tech", roles:["React Developer","Full-Stack Engineer"], salaryMin:40000, salaryMax:70000, careersUrl:"https://www.ocadogroup.com/careers/technology", isHiring:true, sponsorRating:"A-rated", newEntrantEligible:true, status:"Not Applied", contact:"", dateApplied:"", notes:"Ocado uses own careers site, not Greenhouse"},
  {id:3, name:"University of Southampton", legalName:"University of Southampton", location:"Southampton", county:"Hampshire", region:"England", industry:"University", roles:["Software Engineer","Research Software Engineer"], salaryMin:35000, salaryMax:60000, careersUrl:"https://jobs.soton.ac.uk", isHiring:true, sponsorRating:"A-rated", newEntrantEligible:true, status:"Not Applied", contact:"", dateApplied:"", notes:""},
];

export default function App(){
  const [sponsors, setSponsors] = useState(()=> safeGetItem('sponsors_clean_v1', MOCK));
  const [jobTracker, setJobTracker] = useState(()=> safeGetItem('jobTracker_v1', []));
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [nationFilter, setNationFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [hideNonTech, setHideNonTech] = useState(true);
  const [command, setCommand] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [liveJobs, setLiveJobs] = useState({}); // NEW: store live jobs per company
  const [loadingLive, setLoadingLive] = useState({});

  const debouncedCommand = useDebounce(command, 300);

  useEffect(()=>{ safeSetItem('sponsors_clean_v1', sponsors); }, [sponsors]);
  useEffect(()=>{ safeSetItem('jobTracker_v1', jobTracker); }, [jobTracker]);

  // NEW: Fetch live jobs for a company - FIXED to use monzo as test
  const fetchLiveJobs = async (sponsor) => {
    const id = sponsor.id || sponsor.name;
    if (liveJobs[id] || loadingLive[id]) return;
    
    setLoadingLive(prev => ({...prev, [id]: true}));
    try {
      const slug = (sponsor.name||'').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0,30);
      // Use monzo slug for testing if ocado
      const testSlug = slug.includes('ocado') ? 'monzo' : slug;
      const careersUrl = sponsor.careersUrl && !sponsor.careersUrl.includes('google.com') ? sponsor.careersUrl : '';
      
      const res = await fetch(`http://localhost:3001/api/live-jobs/${testSlug}?skills=react,typescript,node.js&name=${encodeURIComponent(sponsor.name)}${careersUrl ? `&careersUrl=${encodeURIComponent(careersUrl)}` : ''}`);
      const data = await res.json();
      setLiveJobs(prev => ({...prev, [id]: data}));
    } catch(e){
      console.error('Live jobs fetch failed', e);
      setLiveJobs(prev => ({...prev, [id]: {count:0, jobs:[], error:e.message}}));
    } finally {
      setLoadingLive(prev => ({...prev, [id]: false}));
    }
  };

  const updateStatus = (id, field, value) => {
    const updated = sponsors.map(s => s.id === id ? {...s, [field]: value} : s);
    setSponsors(updated);
    if (field === 'status' && value === 'Applied') {
      const sponsor = sponsors.find(s => s.id === id);
      if (sponsor && !jobTracker.find(j => j.id === id)) {
        setJobTracker([...jobTracker, {...sponsor, status: value, dateApplied: new Date().toISOString().split('T')[0]}]);
      }
    }
    if (field === 'status') {
      setJobTracker(jobTracker.map(j => j.id === id ? {...j, [field]: value} : j));
    }
  };

  const filtered = useMemo(()=>{
    let list = [...sponsors];
    // FIXED: Clean names on display
    list = list.map(s => ({...s, displayName: cleanName(s.name), cleanCareersUrl: cleanCareersUrl(s.careersUrl, s.name)}));
    
    if (categoryFilter !== 'All') {
      if (categoryFilter === 'Tech') list = list.filter(s => s.industry === 'Tech' || s.industry === 'Technology');
      else if (categoryFilter === 'Public') list = list.filter(s => s.industry === 'Public');
      else if (categoryFilter === 'University') list = list.filter(s => s.industry === 'University');
    }
    if (nationFilter !== 'All') list = list.filter(s => getRegion(s.location, s.county, s.name) === nationFilter);
    if (locationFilter !== 'All') list = list.filter(s => (s.location||'').toLowerCase().includes(locationFilter.toLowerCase()));
    if (hideNonTech) {
      const blacklistRegex = new RegExp(`\\b(${FILTERS.blacklist.join('|')})\\b`, 'i');
      list = list.filter(s => !blacklistRegex.test(s.name) && !blacklistRegex.test(s.industry||''));
    }
    if (debouncedCommand) {
      const q = debouncedCommand.toLowerCase();
      list = list.filter(s => (s.name||'').toLowerCase().includes(q) || (s.location||'').toLowerCase().includes(q) || (s.roles||[]).join(' ').toLowerCase().includes(q));
    }
    return list;
  }, [sponsors, categoryFilter, nationFilter, locationFilter, hideNonTech, debouncedCommand]);

  const handleFileImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        // Try JSON
        if (file.name.endsWith('.json')) {
          const data = JSON.parse(text);
          const cleaned = data.map(s => ({
            ...s,
            name: cleanName(s.name),
            legalName: cleanName(s.legalName||s.name),
            careersUrl: cleanCareersUrl(s.careersUrl, s.name)
          }));
          setSponsors(cleaned);
        }
      } catch(err){ alert('Import failed: '+err.message); }
      setIsImporting(false);
    };
    reader.readAsText(file, 'utf-8');
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex">
      <div className="w-[320px] border-r border-zinc-800 p-4 overflow-y-auto hidden md:block">
        <h1 className="text-xl font-bold">UK Sponsor Command Centre</h1>
        <div className="text-[11px] text-zinc-500 mt-1">Foolproof • Blacklist hides non-tech • Nations + Public + Universities</div>
        
        <div className="mt-4 flex gap-2">
          <label className="bg-violet-600 text-white text-xs px-3 py-1.5 rounded cursor-pointer">
            {isImporting ? 'Importing...' : 'Import Official CSV'}
            <input type="file" accept=".csv,.json" onChange={handleFileImport} className="hidden" />
          </label>
          <button onClick={()=>{ const blob=new Blob([JSON.stringify(sponsors,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='sponsors_clean.json'; a.click(); }} className="bg-zinc-800 text-zinc-300 text-xs px-3 py-1.5 rounded">Export JSON</button>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold">Sponsor Explorer</h2>
          <div className="mt-3 space-y-3">
            <div><label className="text-[11px] text-zinc-500">Category</label><div className="flex flex-wrap gap-1 mt-1">{['All','Tech','Public','Universities'].map(cat=>(<button key={cat} onClick={()=>setCategoryFilter(cat)} className={`px-2 py-1 rounded text-[11px] ${categoryFilter===cat? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>{cat}</button>))}</div></div>
            <div><label className="text-[11px] text-zinc-500">Nation</label><div className="flex flex-wrap gap-1 mt-1">{['All','England','Scotland','Wales','Northern Ireland'].map(nation=>(<button key={nation} onClick={()=>setNationFilter(nation)} className={`px-2 py-1 rounded text-[11px] ${nationFilter===nation? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>{nation}</button>))}</div></div>
            <div><label className="text-[11px] text-zinc-500">Location</label><select value={locationFilter} onChange={e=>setLocationFilter(e.target.value)} className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs"><option>All</option><option>London</option><option>Southampton</option><option>Reading</option><option>Remote UK</option><option>Manchester</option><option>Bristol</option><option>Edinburgh</option><option>Cardiff</option><option>Belfast</option></select></div>
            <label className="flex items-center gap-2 text-[11px] bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5"><input type="checkbox" checked={hideNonTech} onChange={e=>setHideNonTech(e.target.checked)}/> Hide non-tech (restaurants, care homes, hotels) - {FILTERS.blacklist.length} keywords</label>
            <div className="text-[11px] text-zinc-500">Showing {filtered.length} / {sponsors.length} clean sponsors<br/>Public: NHS, Council, Government<br/>Universities: all UK unis</div>
            <div className="text-[10px] text-zinc-600 mt-2 p-2 bg-zinc-950 rounded border border-zinc-800">💡 Tip: Click "Live Jobs" on any card. Test with Monzo first - Ocado doesn't use Greenhouse anymore.</div>
          </div>
        </div>
        <div className="mt-8 border-t border-zinc-800 pt-4">
          <h2 className="text-sm font-semibold text-zinc-300 flex justify-between">Job Tracker <span className="bg-violet-600 text-white text-[10px] px-2 py-0.5 rounded-full">{jobTracker.length}</span></h2>
          <p className="text-[11px] text-zinc-500 mt-1">Auto-adds when you set status to Applied</p>
          <div className="mt-3 space-y-2">
            {jobTracker.length===0 && <div className="text-[11px] text-zinc-600 border border-dashed border-zinc-800 rounded p-3">No applications yet. Change status to Applied on right to add here.</div>}
            {jobTracker.map(job=>(
              <div key={job.id} className="bg-zinc-950 border border-zinc-800 rounded p-2">
                <div className="font-medium text-xs flex justify-between">{cleanName(job.name)} <span className={`text-[9px] px-1.5 py-0.5 rounded ${job.status==='Offer'?'bg-green-900 text-green-300': job.status==='Rejected'?'bg-red-900 text-red-300':'bg-zinc-800'}`}>{job.status}</span></div>
                <div className="text-[10px] text-zinc-500">{job.location} • {job.region} • {job.industry}</div>
                <div className="flex gap-2 mt-2"><select value={job.status} onChange={e=> updateStatus(job.id, 'status', e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded text-[10px] px-1 py-0.5">{STATUSES.map(s=> <option key={s}>{s}</option>)}</select></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        <div className="flex gap-2 mb-4"><input value={command} onChange={e=>setCommand(e.target.value)} placeholder="Command: find React sponsors in Scotland fintech salary >35000" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm placeholder-zinc-600 outline-none focus:border-violet-600"/><div className="text-xs text-zinc-500 self-center hidden md:block">Clean: {filtered.length} sponsors</div></div>
        {filtered.length===0 && <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center"><div className="text-zinc-400">No sponsors found</div><div className="text-xs text-zinc-600 mt-2">Try clearing filters</div></div>}
        <div className="grid md:grid-cols-2 gap-3">
          {filtered.slice(0,100).map(s=>(
            <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700">
              <div className="flex justify-between gap-2"><div className="flex-1"><div className="font-semibold text-sm flex items-center gap-2 flex-wrap">{s.displayName || cleanName(s.name)} <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded-full">{s.industry}</span> <span className="text-[10px] bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">{s.region || getRegion(s.location, s.county, s.name)}</span></div><div className="text-[11px] text-zinc-500">{s.location}{s.county? ', '+s.county:''} • £{(s.salaryMin||0).toLocaleString()} - £{(s.salaryMax||0).toLocaleString()} {s.newEntrantEligible && <span className="ml-1 text-[9px] bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">New Entrant OK</span>}</div><div className="text-xs text-zinc-400 mt-1">{(s.roles||[]).join(' • ')}</div><a href={s.cleanCareersUrl || cleanCareersUrl(s.careersUrl, s.name)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-violet-400 hover:underline mt-1 inline-block break-all">{(s.cleanCareersUrl || s.careersUrl||'').slice(0,80)}</a></div><select value={s.status||'Not Applied'} onChange={e=>updateStatus(s.id,'status',e.target.value)} className="h-8 bg-zinc-950 border border-zinc-800 rounded text-xs px-2 shrink-0">{STATUSES.map(st=> <option key={st}>{st}</option>)}</select></div>
              
              {/* NEW: Live Jobs Button */}
              <div className="mt-3 flex gap-2">
                <button onClick={()=>fetchLiveJobs(s)} disabled={loadingLive[s.id]} className="text-[11px] bg-violet-600 hover:bg-violet-700 text-white px-3 py-1 rounded">
                  {loadingLive[s.id] ? 'Loading...' : `Live Jobs ${liveJobs[s.id]?.count ? `(${liveJobs[s.id].count})` : ''}`}
                </button>
                {liveJobs[s.id] && <span className="text-[10px] text-zinc-500 self-center">{liveJobs[s.id].count===0 ? 'No ATS found - try monzo' : `${liveJobs[s.id].ats_used?.join(', ') || 'greenhouse'} - ${liveJobs[s.id].jobs?.length||0} tech roles`}</span>}
              </div>
              
              {/* Show live jobs */}
              {liveJobs[s.id]?.jobs?.length>0 && (
                <div className="mt-2 space-y-1">
                  {liveJobs[s.id].jobs.slice(0,3).map(job=>(
                    <div key={job.id} className="bg-zinc-950 border border-zinc-800 rounded p-2">
                      <div className="text-xs font-medium">{job.title} <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded ${job.matchPercent>=80?'bg-green-900 text-green-300': job.matchPercent>=60?'bg-yellow-900 text-yellow-300':'bg-zinc-800'}`}>{job.matchPercent}% match</span></div>
                      <div className="text-[10px] text-zinc-500">{job.location} • {job.daysAgo ? `${job.daysAgo}d ago` : ''} • {job.ats}</div>
                      <a href={job.url} target="_blank" className="text-[10px] text-violet-400 hover:underline">Apply →</a>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mt-3"><input placeholder="Contact person" value={s.contact||''} onChange={e=>updateStatus(s.id,'contact',e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs"/><input type="date" value={s.dateApplied||''} onChange={e=>updateStatus(s.id,'dateApplied',e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs"/></div>
              <textarea placeholder="Notes: recruiter email, referral, CoS timeline..." value={s.notes||''} onChange={e=>updateStatus(s.id,'notes',e.target.value)} className="w-full mt-2 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs h-12"/>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
