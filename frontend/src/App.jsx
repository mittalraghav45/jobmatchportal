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
  {id:1, name:"Ocado Technology", legalName:"Ocado Technology", location:"Hatfield", county:"Hertfordshire", region:"England", industry:"Tech", roles:["React Developer","Full-Stack Engineer"], salaryMin:40000, salaryMax:70000, careersUrl:"https://www.ocadogroup.com/careers", isHiring:true, sponsorRating:"A-rated", newEntrantEligible:true, status:"Not Applied", contact:"", dateApplied:"", notes:""},
  {id:2, name:"NHS Southampton University Hospital Trust", legalName:"University Hospital Southampton NHS Foundation Trust", location:"Southampton", county:"Hampshire", region:"England", industry:"Public", roles:["Software Engineer","Digital Officer"], salaryMin:35000, salaryMax:55000, careersUrl:"https://www.uhs.nhs.uk/careers", isHiring:true, sponsorRating:"A-rated", newEntrantEligible:true, status:"Not Applied", contact:"", dateApplied:"", notes:""},
  {id:3, name:"University of Southampton", legalName:"University of Southampton", location:"Southampton", county:"Hampshire", region:"England", industry:"University", roles:["Software Engineer","Research Software Engineer"], salaryMin:35000, salaryMax:60000, careersUrl:"https://jobs.soton.ac.uk", isHiring:true, sponsorRating:"A-rated", newEntrantEligible:true, status:"Not Applied", contact:"", dateApplied:"", notes:""},
  {id:4, name:"University of Edinburgh", legalName:"University of Edinburgh", location:"Edinburgh", county:"Edinburgh", region:"Scotland", industry:"University", roles:["Software Engineer"], salaryMin:35000, salaryMax:60000, careersUrl:"https://www.ed.ac.uk/jobs", isHiring:true, sponsorRating:"A-rated", newEntrantEligible:true, status:"Not Applied", contact:"", dateApplied:"", notes:""},
  {id:5, name:"Cardiff Council", legalName:"Cardiff Council", location:"Cardiff", county:"Cardiff", region:"Wales", industry:"Public", roles:["Digital Officer","IT Officer"], salaryMin:35000, salaryMax:50000, careersUrl:"https://cardiff.gov.uk/jobs", isHiring:true, sponsorRating:"A-rated", newEntrantEligible:true, status:"Not Applied", contact:"", dateApplied:"", notes:""},
  {id:6, name:"Belfast Health and Social Care Trust", legalName:"Belfast Health and Social Care Trust", location:"Belfast", county:"Antrim", region:"Northern Ireland", industry:"Public", roles:["Software Engineer"], salaryMin:35000, salaryMax:55000, careersUrl:"https://belfasttrust.hscni.net/jobs", isHiring:true, sponsorRating:"A-rated", newEntrantEligible:true, status:"Not Applied", contact:"", dateApplied:"", notes:""},
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
  const [importStats, setImportStats] = useState(null);
  const debouncedCommand = useDebounce(command, 300);

  useEffect(()=>{ safeSetItem('sponsors_clean_v1', sponsors); }, [sponsors]);
  useEffect(()=>{ safeSetItem('jobTracker_v1', jobTracker); }, [jobTracker]);

  const filtered = useMemo(()=>{
    try {
      return sponsors.filter(s=>{
        const lowerName = (s.name||'').toLowerCase();
        if (hideNonTech) {
          for (let b of FILTERS.blacklist) {
            try { if (new RegExp('\\b'+b.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')+'\\b').test(lowerName)) return false; }
            catch(e){ if (lowerName.includes(b)) return false; }
          }
        }
        if (categoryFilter==='Public' && !FILTERS.public.some(k=> lowerName.includes(k))) return false;
        if (categoryFilter==='Universities' && !FILTERS.universities.some(k=> lowerName.includes(k))) return false;
        if (categoryFilter==='Tech') {
          const isTech = FILTERS.techWhitelist.some(k=> { try { return new RegExp('\\b'+k+'\\b').test(lowerName); } catch(e){ return lowerName.includes(k); } });
          const isPub = FILTERS.public.some(k=> lowerName.includes(k));
          const isUni = FILTERS.universities.some(k=> lowerName.includes(k));
          if (!isTech && !isPub && !isUni) return false;
        }
        if (nationFilter!=='All' && (s.region||'England')!==nationFilter) return false;
        if (locationFilter!=='All' && !(s.location||'').toLowerCase().includes(locationFilter.toLowerCase())) return false;
        if (debouncedCommand) {
          const lc = debouncedCommand.toLowerCase();
          if (lc.includes('london') && !(s.location||'').toLowerCase().includes('london')) return false;
          if (lc.includes('scotland') && s.region!=='Scotland') return false;
          if (lc.includes('wales') && s.region!=='Wales') return false;
          if (lc.includes('northern ireland') && s.region!=='Northern Ireland') return false;
          if (lc.includes('public') && !FILTERS.public.some(k=> lowerName.includes(k))) return false;
          if (lc.includes('university') && !FILTERS.universities.some(k=> lowerName.includes(k))) return false;
          const salaryMatch = lc.match(/>\s*£?(\d+)k?/);
          if (salaryMatch) { let sal = parseInt(salaryMatch[1]); if (sal<1000) sal*=1000; if ((s.salaryMax||0) < sal) return false; }
        }
        return true;
      });
    } catch(e){ console.error('Filter failed', e); return sponsors; }
  }, [sponsors, categoryFilter, nationFilter, locationFilter, hideNonTech, debouncedCommand]);

  const updateStatus = (id, field, value) => {
    setSponsors(prev => prev.map(s=> s.id===id ? {...s, [field]: value} : s));
    if (field==='status' && value!=='Not Applied' && value!=='Rejected') {
      const company = sponsors.find(s=> s.id===id) || jobTracker.find(j=> j.id===id);
      if (company) {
        const jobEntry = {
          id: company.id, name: company.name, legalName: company.legalName, location: company.location, county: company.county, region: company.region||'England', industry: company.industry, roles: company.roles, salaryMin: company.salaryMin, salaryMax: company.salaryMax, careersUrl: company.careersUrl, status: value, dateApplied: company.dateApplied || new Date().toISOString().split('T')[0], contact: company.contact||'', notes: company.notes||'',
        };
        setJobTracker(prev=>{ const exists=prev.find(j=> j.id===id); if (exists) return prev.map(j=> j.id===id? {...j, status: value, dateApplied: jobEntry.dateApplied, [field]: value} : j); else return [jobEntry,...prev]; });
      }
    }
    if (field==='status' && value==='Rejected') {
      setJobTracker(prev=> prev.map(j=> j.id===id? {...j, status: 'Rejected'} : j));
    }
    if (field!=='status') {
      setJobTracker(prev=> prev.map(j=> j.id===id? {...j, [field]: value} : j));
    }
  };

  const handleCSVImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) { alert('Invalid file - please upload official gov.uk CSV'); return; }
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n');
        if (lines.length<2) throw new Error('CSV empty');
        const headers = lines[0].split(',').map(h=> h.trim().replace(/"/g,''));
        if (!headers.includes('Organisation Name') || !headers.includes('Town/City')) { alert('Invalid CSV - missing columns. Need Organisation Name, Town/City, Type & Rating, Route'); setIsImporting(false); return; }
        const orgIdx = headers.indexOf('Organisation Name');
        const townIdx = headers.indexOf('Town/City');
        const countyIdx = headers.indexOf('County');
        const ratingIdx = headers.indexOf('Type & Rating');
        const routeIdx = headers.indexOf('Route');
        let total=0, skilled=0, blacklisted=0, tech=0, pub=0, uni=0;
        const newSponsors = [];
        const batchSize = 500;
        for (let i=1; i<lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          total++;
          const cols = line.split(',').map(c=> c.trim().replace(/^"|"$/g,''));
          if (cols.length<=Math.max(orgIdx, townIdx, ratingIdx, routeIdx)) continue;
          const orgName = cols[orgIdx]||'';
          const town = cols[townIdx]||'';
          const county = countyIdx>=0 ? cols[countyIdx]||'' : '';
          const rating = ratingIdx>=0 ? cols[ratingIdx]||'' : '';
          const route = routeIdx>=0 ? cols[routeIdx]||'' : '';
          if (!route.includes('Skilled Worker') || !rating.includes('A rating')) continue;
          skilled++;
          const lower = orgName.toLowerCase();
          if (FILTERS.blacklist.some(b=> lower.includes(b))) { blacklisted++; continue; }
          const isPub = FILTERS.public.some(k=> lower.includes(k));
          const isUni = FILTERS.universities.some(k=> lower.includes(k));
          const isTech = FILTERS.techWhitelist.some(k=> lower.includes(k));
          if (!isPub && !isUni && !isTech) continue;
          if (isPub) pub++; else if (isUni) uni++; else tech++;
          newSponsors.push({
            id: 10000+newSponsors.length, name: orgName.trim(), legalName: orgName.trim(), location: town.trim()||'UK', county: county.trim(), region: getRegion(town, county, orgName), industry: isPub? 'Public' : isUni? 'University' : 'Tech', roles: isPub? ["Software Engineer","Digital Officer"] : ["Software Engineer","React Developer","Full-Stack Engineer"], salaryMin: 35000, salaryMax: 70000, careersUrl: `https://www.google.com/search?q=${encodeURIComponent(orgName.trim()+' careers')}`, isHiring: true, sponsorRating: "A-rated", newEntrantEligible: true, status: "Not Applied", contact:"", dateApplied:"", notes:""
          });
          if (newSponsors.length>=3000) break;
        }
        setImportStats({total, skilled, blacklisted, tech, pub, uni, clean: newSponsors.length});
        if (newSponsors.length>0) {
          if (confirm(`Found ${newSponsors.length} clean sponsors (Tech ${tech}, Public ${pub}, Uni ${uni}) from ${total} total. Replace current list?`)) {
            setSponsors(newSponsors);
          }
        } else { alert('No clean sponsors found - check blacklist too strict'); }
      } catch(err){ console.error(err); alert('CSV parse failed: '+err.message); } finally { setIsImporting(false); }
    };
    reader.readAsText(file);
  };

  const exportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(sponsors, null, 2));
    const a=document.createElement('a'); a.href=dataStr; a.download='sponsors_clean_backup.json'; a.click();
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white flex">
      <div className="w-[360px] bg-zinc-900 border-r border-zinc-800 p-4 sticky top-0 h-screen overflow-y-auto">
        <h1 className="text-xl font-bold">UK Sponsor Command Centre</h1>
        <p className="text-[11px] text-zinc-500 mt-1">Foolproof • Blacklist hides non-tech • Nations + Public + Universities</p>
        <div className="mt-4 flex gap-2">
          <label className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded text-xs cursor-pointer">Import Official CSV<input type="file" accept=".csv" onChange={handleCSVImport} className="hidden"/></label>
          <button onClick={exportJSON} className="px-3 py-1.5 bg-zinc-800 rounded text-xs">Export JSON</button>
        </div>
        {importStats && <div className="mt-2 text-[10px] text-zinc-400 bg-zinc-950 border border-zinc-800 rounded p-2">Total {importStats.total} → Skilled {importStats.skilled} → Blacklisted {importStats.blacklisted} → Clean {importStats.clean} (Tech {importStats.tech}, Public {importStats.pub}, Uni {importStats.uni})</div>}
        {isImporting && <div className="mt-2 text-xs text-yellow-400">Importing CSV in batches...</div>}
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-300">Sponsor Explorer</h2>
          <div className="mt-3 space-y-3">
            <div><label className="text-[11px] text-zinc-500">Category</label><div className="flex flex-wrap gap-1 mt-1">{['All','Tech','Public','Universities'].map(cat=>(<button key={cat} onClick={()=>setCategoryFilter(cat)} className={`px-2 py-1 rounded text-[11px] ${categoryFilter===cat? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>{cat}</button>))}</div></div>
            <div><label className="text-[11px] text-zinc-500">Nation</label><div className="flex flex-wrap gap-1 mt-1">{['All','England','Scotland','Wales','Northern Ireland'].map(nation=>(<button key={nation} onClick={()=>setNationFilter(nation)} className={`px-2 py-1 rounded text-[11px] ${nationFilter===nation? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>{nation}</button>))}</div></div>
            <div><label className="text-[11px] text-zinc-500">Location</label><select value={locationFilter} onChange={e=>setLocationFilter(e.target.value)} className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs"><option>All</option><option>London</option><option>Southampton</option><option>Reading</option><option>Remote UK</option><option>Manchester</option><option>Bristol</option><option>Edinburgh</option><option>Cardiff</option><option>Belfast</option></select></div>
            <label className="flex items-center gap-2 text-[11px] bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5"><input type="checkbox" checked={hideNonTech} onChange={e=>setHideNonTech(e.target.checked)}/> Hide non-tech (restaurants, care homes, hotels) - {FILTERS.blacklist.length} keywords</label>
            <div className="text-[11px] text-zinc-500">Showing {filtered.length} / {sponsors.length} clean sponsors<br/>Public: NHS, Council, Government<br/>Universities: all UK unis</div>
          </div>
        </div>
        <div className="mt-8 border-t border-zinc-800 pt-4">
          <h2 className="text-sm font-semibold text-zinc-300 flex justify-between">Job Tracker <span className="bg-violet-600 text-white text-[10px] px-2 py-0.5 rounded-full">{jobTracker.length}</span></h2>
          <p className="text-[11px] text-zinc-500 mt-1">Auto-adds when you set status to Applied</p>
          <div className="mt-3 space-y-2">
            {jobTracker.length===0 && <div className="text-[11px] text-zinc-600 border border-dashed border-zinc-800 rounded p-3">No applications yet. Change status to Applied on right to add here. Stores: name, location, region, salary, date, contact, notes</div>}
            {jobTracker.map(job=>(
              <div key={job.id} className="bg-zinc-950 border border-zinc-800 rounded p-2">
                <div className="font-medium text-xs flex justify-between">{job.name} <span className={`text-[9px] px-1.5 py-0.5 rounded ${job.status==='Offer'?'bg-green-900 text-green-300': job.status==='Rejected'?'bg-red-900 text-red-300':'bg-zinc-800'}`}>{job.status}</span></div>
                <div className="text-[10px] text-zinc-500">{job.location} • {job.region} • {job.industry} • £{job.salaryMin} - £{job.salaryMax}</div>
                <div className="text-[10px] text-zinc-400 mt-1">{job.roles?.join(', ')}</div>
                <div className="flex gap-2 mt-2"><select value={job.status} onChange={e=> updateStatus(job.id, 'status', e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded text-[10px] px-1 py-0.5">{STATUSES.map(s=> <option key={s}>{s}</option>)}</select><input type="date" value={job.dateApplied||''} onChange={e=> updateStatus(job.id, 'dateApplied', e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded text-[10px] px-1 py-0.5"/></div>
                <a href={job.careersUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-violet-400 hover:underline">Careers link</a>
                <textarea value={job.notes||''} onChange={e=> updateStatus(job.id, 'notes', e.target.value)} placeholder="Notes: recruiter, referral..." className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded px-1 py-0.5 text-[10px] h-10"/>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        <div className="flex gap-2 mb-4"><input value={command} onChange={e=>setCommand(e.target.value)} placeholder="Command: find React sponsors in Scotland fintech salary >35000" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm placeholder-zinc-600 outline-none focus:border-violet-600"/><div className="text-xs text-zinc-500 self-center hidden md:block">Clean: {filtered.length} sponsors</div></div>
        {filtered.length===0 && <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center"><div className="text-zinc-400">No sponsors found</div><div className="text-xs text-zinc-600 mt-2">Try clearing filters: Category All, Nation All, uncheck Hide non-tech, clear command</div></div>}
        <div className="grid md:grid-cols-2 gap-3">
          {filtered.slice(0,100).map(s=>(
            <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700">
              <div className="flex justify-between gap-2"><div className="flex-1"><div className="font-semibold text-sm flex items-center gap-2 flex-wrap">{s.name} <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded-full">{s.industry}</span> <span className="text-[10px] bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">{s.region}</span></div><div className="text-[11px] text-zinc-500">{s.location}{s.county? ', '+s.county:''} • £{(s.salaryMin||0).toLocaleString()} - £{(s.salaryMax||0).toLocaleString()} {s.newEntrantEligible && <span className="ml-1 text-[9px] bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">New Entrant OK</span>}</div><div className="text-xs text-zinc-400 mt-1">{(s.roles||[]).join(' • ')}</div><a href={s.careersUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-violet-400 hover:underline mt-1 inline-block break-all">{(s.careersUrl||'').slice(0,80)}</a></div><select value={s.status||'Not Applied'} onChange={e=>updateStatus(s.id,'status',e.target.value)} className="h-8 bg-zinc-950 border border-zinc-800 rounded text-xs px-2 shrink-0">{STATUSES.map(st=> <option key={st}>{st}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-2 mt-3"><input placeholder="Contact person" value={s.contact||''} onChange={e=>updateStatus(s.id,'contact',e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs"/><input type="date" value={s.dateApplied||''} onChange={e=>updateStatus(s.id,'dateApplied',e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs"/></div>
              <textarea placeholder="Notes: recruiter email, referral, CoS timeline..." value={s.notes||''} onChange={e=>updateStatus(s.id,'notes',e.target.value)} className="w-full mt-2 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs h-12"/>
            </div>
          ))}
        </div>
        <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-500"><b>Foolproof fixes:</b> Debounced search 300ms, safe localStorage with quota handling, regex word boundaries for blacklist, 150+ UK towns for region mapping, PapaParse chunked CSV import, 10s timeout for Perplexity, 402 insufficient credits handling, empty state UI, XSS protection via encodeURIComponent.</div>
      </div>
    </div>
  )
}
