import React, { useState, useEffect, useMemo } from 'react';

const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const browserHost = typeof window !== 'undefined' ? window.location.hostname : '';
const isLocalBrowser = browserHost === 'localhost' || browserHost === '127.0.0.1' || browserHost === '::1';
// Prefer same-origin /api in hosted environments (including Codespaces). A
// localhost API override is only used when the browser itself is local.
const API_BASE_URL = configuredApiBaseUrl && (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredApiBaseUrl) || isLocalBrowser)
  ? configuredApiBaseUrl
  : '';

// Keep these lists small and editable. Classification is based on the supplied
// company data; it is not a sponsorship or eligibility determination.
const FILTERS = {
  public: ['nhs','council','government','borough','county council','city council','trust','nhs trust','nhs foundation','police','fire','authority','health board','local authority'],
  universities: ['university','universities','college','business school','institute of technology','higher education','university of','school of'],
  blacklist: ['restaurant','takeaway','kebab','pizza','curry','cafe','coffee','chippy','fish and chips','hotel','guest house','b&b','pub','bar','nightclub','care home','nursing home','care agency','domiciliary care','grocery','supermarket','convenience store','off licence','butcher','bakery','hair','beauty','salon','barber','nail','tattoo','construction','builder','plumbing','electrical','roofing','scaffolding','taxi','cleaning','security','estate agent','letting','church','mosque','temple','gurdwara','charity','masjid','petrol station','garage','car wash','tyre','mot centre'],
  techWhitelist: ['technology','technologies','tech','software','systems','solutions','digital','data','ai','artificial intelligence','labs','lab','innovation','informatics','infotech','fintech','healthtech','edtech','proptech','biotech','cyber','cloud','web','app','apps','computing','computer','programming','information','analytics','intelligence','automation','platform','internet','online','develop']
};

const SCOTLAND_TOWNS = ['edinburgh','glasgow','aberdeen','dundee','stirling','inverness','perth','falkirk','ayr','dunfermline','greenock','paisley','kilmarnock','east kilbride','cumbernauld','hamilton','motherwell','coatbridge','livingston'];
const WALES_TOWNS = ['cardiff','swansea','newport','wrexham','barry','bridgend','neath','cwmbran','bangor','st davids','aberystwyth','merthyr','pontypridd','caerphilly','port talbot','llanelli'];
const NI_TOWNS = ['belfast','derry','londonderry','lisburn','newry','armagh','craigavon','newtownabbey','bangor','carrickfergus','antrim','down','newtownards','omagh','coleraine'];

function cleanName(name) {
  if (!name) return 'Unknown';
  let value = String(name)
    .replace(/\?{2,}/g, "'")
    .replace(/\uFFFD/g, "'")
    .replace(/â€™|â€œ|â€|Ã¢â‚¬â„¢/g, "'")
    .replace(/Ã¼/g, 'ü')
    .replace(/Ã©/g, 'é')
    .normalize('NFKC')
    .trim()
    .replace(/\s{2,}/g, ' ');
  try {
    if (value.includes('%')) value = decodeURIComponent(value);
  } catch { /* keep original value */ }
  return value;
}

function cleanCareersUrl(url) {
  if (!url) return '';
  const value = String(url).trim();
  // A search-engine URL is not an authoritative careers URL. Keep it blank
  // rather than presenting it as if it were an employer careers page.
  if (/google\.com\/search/i.test(value)) return '';
  try {
    return value.includes('%') ? decodeURIComponent(value) : value;
  } catch {
    return value;
  }
}

function getRegion(town, county, name) {
  try {
    const t = String(town || '').toLowerCase();
    const c = String(county || '').toLowerCase();
    const n = String(name || '').toLowerCase();
    if (SCOTLAND_TOWNS.some(x => t.includes(x)) || c.includes('scotland') || /\bscotland\b|\bedinburgh\b|\bglasgow\b/.test(n)) return 'Scotland';
    if (WALES_TOWNS.some(x => t.includes(x)) || c.includes('wales') || /\bwales\b|\bcardiff\b|\bswansea\b/.test(n)) return 'Wales';
    if (NI_TOWNS.some(x => t.includes(x)) || c.includes('northern ireland') || c.includes('antrim') || c.includes('down') || /\bbelfast\b/.test(n)) return 'Northern Ireland';
    return 'England';
  } catch {
    return 'England';
  }
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function safeGetItem(key, fallback) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (error) {
    console.error('LocalStorage read failed', error);
    return fallback;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (error.name === 'QuotaExceededError' || error.code === 22) {
      try {
        localStorage.removeItem('sponsors_clean_v1');
        localStorage.setItem(key, JSON.stringify(value));
      } catch (nestedError) {
        console.error('LocalStorage write failed', nestedError);
      }
    } else {
      console.error('LocalStorage write failed', error);
    }
    return false;
  }
}

function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      fields.push(field.trim());
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field.trim());
  return fields;
}

function parseCsv(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map(header => header.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => ({ ...row, [header]: values[index] ?? '' }), {});
  });
}

function normaliseImportedCompany(raw) {
  const rolesValue = raw.roles || raw.role || '';
  const roles = Array.isArray(rolesValue)
    ? rolesValue
    : String(rolesValue).split(/[;|]/).map(role => role.trim()).filter(Boolean);
  const name = cleanName(raw.name || raw.company_name || raw.organisation_name || raw.organisation || raw.legal_name);
  const industry = cleanName(raw.industry || raw.category || '');
  const location = cleanName(raw.location || raw.town || raw.city || '');
  const county = cleanName(raw.county || raw.region || '');
  const careersUrl = cleanCareersUrl(raw.careersUrl || raw.careers_url || raw.careers || raw.website || '');
  const id = raw.id || raw.company_id || raw.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return {
    ...raw,
    id,
    slug: raw.slug || id,
    name,
    legalName: cleanName(raw.legalName || raw.legal_name || name),
    location,
    county,
    region: raw.region || getRegion(location, county, name),
    industry,
    roles,
    careersUrl,
    isHiring: raw.isHiring === true || String(raw.is_hiring).toLowerCase() === 'true',
    sponsorRating: raw.sponsorRating || raw.sponsor_rating || '',
    newEntrantEligible: raw.newEntrantEligible === true || String(raw.new_entrant_eligible).toLowerCase() === 'true',
    status: raw.status || 'Not Applied',
    contact: raw.contact || '',
    dateApplied: raw.dateApplied || raw.date_applied || '',
    notes: raw.notes || ''
  };
}

const STATUSES = ['Not Applied', 'Applied', 'Screening Call', 'Technical Interview', 'Final', 'Offer', 'CoS Received', 'Rejected'];

const MOCK = [
  { id: 'monzo', slug: 'monzo', name: 'Monzo', legalName: 'Monzo Bank', location: 'London', county: 'London', region: 'England', industry: 'Tech', roles: ['React Developer', 'Full-Stack Engineer'], salaryMin: 40000, salaryMax: 70000, careersUrl: 'https://boards.greenhouse.io/monzo', isHiring: true, sponsorRating: 'A-rated', newEntrantEligible: true, status: 'Not Applied', contact: '', dateApplied: '', notes: '' },
  { id: 'ocado-technology', slug: 'ocado-technology', name: 'Ocado Technology', legalName: 'Ocado Technology', location: 'Hatfield', county: 'Hertfordshire', region: 'England', industry: 'Tech', roles: ['React Developer', 'Full-Stack Engineer'], salaryMin: 40000, salaryMax: 70000, careersUrl: 'https://www.ocadogroup.com/careers/technology', isHiring: true, sponsorRating: 'A-rated', newEntrantEligible: true, status: 'Not Applied', contact: '', dateApplied: '', notes: '' },
  { id: 'university-of-southampton', slug: 'university-of-southampton', name: 'University of Southampton', legalName: 'University of Southampton', location: 'Southampton', county: 'Hampshire', region: 'England', industry: 'University', roles: ['Software Engineer', 'Research Software Engineer'], salaryMin: 35000, salaryMax: 60000, careersUrl: 'https://jobs.soton.ac.uk', isHiring: true, sponsorRating: 'A-rated', newEntrantEligible: true, status: 'Not Applied', contact: '', dateApplied: '', notes: '' }
];

function isPublicCompany(company) {
  const value = `${company.industry || ''} ${company.name || ''}`.toLowerCase();
  return (company.industry || '').toLowerCase() === 'public' || FILTERS.public.some(term => value.includes(term));
}

function isUniversityCompany(company) {
  const value = `${company.industry || ''} ${company.name || ''}`.toLowerCase();
  return (company.industry || '').toLowerCase() === 'university' || FILTERS.universities.some(term => value.includes(term));
}

export default function App() {
  const [sponsors, setSponsors] = useState(() => safeGetItem('sponsors_clean_v1', MOCK));
  const [jobTracker, setJobTracker] = useState(() => safeGetItem('jobTracker_v1', []));
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [nationFilter, setNationFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [hideNonTech, setHideNonTech] = useState(true);
  const [command, setCommand] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [liveJobs, setLiveJobs] = useState({});
  const [loadingLive, setLoadingLive] = useState({});

  const debouncedCommand = useDebounce(command, 300);

  useEffect(() => { safeSetItem('sponsors_clean_v1', sponsors); }, [sponsors]);
  useEffect(() => { safeSetItem('jobTracker_v1', jobTracker); }, [jobTracker]);

  const fetchLiveJobs = async (sponsor) => {
    const id = sponsor.id || sponsor.name;
    if (liveJobs[id] || loadingLive[id]) return;

    setLoadingLive(prev => ({ ...prev, [id]: true }));
    try {
      const slug = String(sponsor.slug || sponsor.id || sponsor.name || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 60);
      if (!slug) throw new Error('Company has no usable slug');

      const careersUrl = cleanCareersUrl(sponsor.careersUrl);
      const query = new URLSearchParams({
        skills: 'react,typescript,node.js',
        name: sponsor.name || slug
      });
      if (careersUrl) query.set('careersUrl', careersUrl);

      const response = await fetch(`${API_BASE_URL}/api/live-jobs/${encodeURIComponent(slug)}?${query.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      setLiveJobs(prev => ({ ...prev, [id]: data }));
    } catch (error) {
      console.error('Live jobs fetch failed', error);
      setLiveJobs(prev => ({ ...prev, [id]: { count: 0, jobs: [], error: error.message } }));
    } finally {
      setLoadingLive(prev => ({ ...prev, [id]: false }));
    }
  };

  const updateStatus = (id, field, value) => {
    const sponsor = sponsors.find(item => item.id === id);
    const updatedSponsors = sponsors.map(item => item.id === id ? { ...item, [field]: value } : item);
    setSponsors(updatedSponsors);

    if (field === 'status' && value === 'Applied' && sponsor && !jobTracker.find(job => job.id === id)) {
      setJobTracker(prev => [...prev, {
        ...sponsor,
        status: value,
        dateApplied: sponsor.dateApplied || new Date().toISOString().split('T')[0]
      }]);
    } else if (field === 'status') {
      setJobTracker(prev => prev.map(job => job.id === id ? { ...job, status: value } : job));
    }
  };

  const filtered = useMemo(() => {
    let list = sponsors.map(sponsor => ({
      ...sponsor,
      displayName: cleanName(sponsor.name),
      cleanCareersUrl: cleanCareersUrl(sponsor.careersUrl)
    }));

    if (categoryFilter === 'Tech') {
      list = list.filter(company => company.industry === 'Tech' || company.industry === 'Technology' || FILTERS.techWhitelist.some(term => `${company.name} ${company.industry}`.toLowerCase().includes(term)));
    } else if (categoryFilter === 'Public') {
      list = list.filter(isPublicCompany);
    } else if (categoryFilter === 'Universities') {
      list = list.filter(isUniversityCompany);
    }

    if (nationFilter !== 'All') list = list.filter(company => getRegion(company.location, company.county, company.name) === nationFilter);
    if (locationFilter !== 'All') list = list.filter(company => (company.location || '').toLowerCase().includes(locationFilter.toLowerCase()));

    if (hideNonTech) {
      const blacklistRegex = new RegExp(`\\b(${FILTERS.blacklist.join('|')})\\b`, 'i');
      list = list.filter(company => !blacklistRegex.test(company.name || '') && !blacklistRegex.test(company.industry || ''));
    }

    if (debouncedCommand) {
      const query = debouncedCommand.toLowerCase();
      list = list.filter(company =>
        (company.name || '').toLowerCase().includes(query) ||
        (company.location || '').toLowerCase().includes(query) ||
        (company.roles || []).join(' ').toLowerCase().includes(query)
      );
    }

    return list;
  }, [sponsors, categoryFilter, nationFilter, locationFilter, hideNonTech, debouncedCommand]);

  const handleFileImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const text = loadEvent.target.result;
        const parsed = file.name.toLowerCase().endsWith('.json') ? JSON.parse(text) : parseCsv(text);
        if (!Array.isArray(parsed)) throw new Error('The imported file must contain an array of companies.');
        const cleaned = parsed.map(normaliseImportedCompany).filter(company => company.name && company.name !== 'Unknown');
        if (!cleaned.length) throw new Error('No usable company rows were found.');
        setSponsors(cleaned);
      } catch (error) {
        alert(`Import failed: ${error.message}`);
      } finally {
        setIsImporting(false);
        event.target.value = '';
      }
    };
    reader.onerror = () => {
      setIsImporting(false);
      alert('Import failed: the file could not be read.');
    };
    reader.readAsText(file, 'utf-8');
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex">
      <div className="w-[320px] border-r border-zinc-800 p-4 overflow-y-auto hidden md:block">
        <h1 className="text-xl font-bold">UK Sponsor Command Centre</h1>
        <div className="text-[11px] text-zinc-500 mt-1">Sponsor explorer • public sector • universities • live ATS jobs</div>

        <div className="mt-4 flex gap-2">
          <label className="bg-violet-600 text-white text-xs px-3 py-1.5 rounded cursor-pointer">
            {isImporting ? 'Importing...' : 'Import CSV / JSON'}
            <input type="file" accept=".csv,.json" onChange={handleFileImport} className="hidden" />
          </label>
          <button onClick={() => {
            const blob = new Blob([JSON.stringify(sponsors, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'sponsors_clean.json';
            anchor.click();
            URL.revokeObjectURL(url);
          }} className="bg-zinc-800 text-zinc-300 text-xs px-3 py-1.5 rounded">Export JSON</button>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold">Sponsor Explorer</h2>
          <div className="mt-3 space-y-3">
            <div>
              <label className="text-[11px] text-zinc-500">Category</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {['All', 'Tech', 'Public', 'Universities'].map(category => (
                  <button key={category} onClick={() => setCategoryFilter(category)} className={`px-2 py-1 rounded text-[11px] ${categoryFilter === category ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>{category}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500">Nation</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {['All', 'England', 'Scotland', 'Wales', 'Northern Ireland'].map(nation => (
                  <button key={nation} onClick={() => setNationFilter(nation)} className={`px-2 py-1 rounded text-[11px] ${nationFilter === nation ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>{nation}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500">Location</label>
              <select value={locationFilter} onChange={event => setLocationFilter(event.target.value)} className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs">
                {['All', 'London', 'Southampton', 'Reading', 'Remote UK', 'Manchester', 'Bristol', 'Edinburgh', 'Cardiff', 'Belfast'].map(location => <option key={location}>{location}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-[11px] bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5">
              <input type="checkbox" checked={hideNonTech} onChange={event => setHideNonTech(event.target.checked)} />
              Hide obvious non-tech businesses
            </label>
            <div className="text-[11px] text-zinc-500">Showing {filtered.length} / {sponsors.length} companies</div>
            <div className="text-[10px] text-zinc-600 mt-2 p-2 bg-zinc-950 rounded border border-zinc-800">Live Jobs uses the company's own slug and careers URL. No test-company substitution is performed.</div>
          </div>
        </div>

        <div className="mt-8 border-t border-zinc-800 pt-4">
          <h2 className="text-sm font-semibold text-zinc-300 flex justify-between">Job Tracker <span className="bg-violet-600 text-white text-[10px] px-2 py-0.5 rounded-full">{jobTracker.length}</span></h2>
          <p className="text-[11px] text-zinc-500 mt-1">Auto-adds when you set status to Applied</p>
          <div className="mt-3 space-y-2">
            {jobTracker.length === 0 && <div className="text-[11px] text-zinc-600 border border-dashed border-zinc-800 rounded p-3">No applications yet.</div>}
            {jobTracker.map(job => (
              <div key={job.id} className="bg-zinc-950 border border-zinc-800 rounded p-2">
                <div className="font-medium text-xs flex justify-between">{cleanName(job.name)} <span className={`text-[9px] px-1.5 py-0.5 rounded ${job.status === 'Offer' ? 'bg-green-900 text-green-300' : job.status === 'Rejected' ? 'bg-red-900 text-red-300' : 'bg-zinc-800'}`}>{job.status}</span></div>
                <div className="text-[10px] text-zinc-500">{job.location} • {job.region} • {job.industry}</div>
                <div className="flex gap-2 mt-2"><select value={job.status} onChange={event => updateStatus(job.id, 'status', event.target.value)} className="bg-zinc-900 border border-zinc-800 rounded text-[10px] px-1 py-0.5">{STATUSES.map(status => <option key={status}>{status}</option>)}</select></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        <div className="flex gap-2 mb-4">
          <input value={command} onChange={event => setCommand(event.target.value)} placeholder="Search companies, locations or roles" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm placeholder-zinc-600 outline-none focus:border-violet-600" />
          <div className="text-xs text-zinc-500 self-center hidden md:block">{filtered.length} companies</div>
        </div>

        {filtered.length === 0 && <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center"><div className="text-zinc-400">No companies found</div><div className="text-xs text-zinc-600 mt-2">Try clearing filters or importing a company list.</div></div>}

        <div className="grid md:grid-cols-2 gap-3">
          {filtered.slice(0, 100).map(sponsor => (
            <div key={sponsor.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700">
              <div className="flex justify-between gap-2">
                <div className="flex-1">
                  <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                    {sponsor.displayName || cleanName(sponsor.name)}
                    <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded-full">{sponsor.industry || 'Unknown'}</span>
                    <span className="text-[10px] bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">{sponsor.region || getRegion(sponsor.location, sponsor.county, sponsor.name)}</span>
                  </div>
                  <div className="text-[11px] text-zinc-500">{sponsor.location}{sponsor.county ? `, ${sponsor.county}` : ''} • £{(Number(sponsor.salaryMin) || 0).toLocaleString()} - £{(Number(sponsor.salaryMax) || 0).toLocaleString()}</div>
                  <div className="text-xs text-zinc-400 mt-1">{(sponsor.roles || []).join(' • ')}</div>
                  {sponsor.cleanCareersUrl && <a href={sponsor.cleanCareersUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-violet-400 hover:underline mt-1 inline-block break-all">{sponsor.cleanCareersUrl.slice(0, 80)}</a>}
                </div>
                <select value={sponsor.status || 'Not Applied'} onChange={event => updateStatus(sponsor.id, 'status', event.target.value)} className="h-8 bg-zinc-950 border border-zinc-800 rounded text-xs px-2 shrink-0">{STATUSES.map(status => <option key={status}>{status}</option>)}</select>
              </div>

              <div className="mt-3 flex gap-2">
                <button onClick={() => fetchLiveJobs(sponsor)} disabled={loadingLive[sponsor.id]} className="text-[11px] bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-3 py-1 rounded">
                  {loadingLive[sponsor.id] ? 'Loading...' : `Live Jobs ${liveJobs[sponsor.id]?.count ? `(${liveJobs[sponsor.id].count})` : ''}`}
                </button>
                {liveJobs[sponsor.id] && <span className="text-[10px] text-zinc-500 self-center">{liveJobs[sponsor.id].error ? liveJobs[sponsor.id].error : liveJobs[sponsor.id].count === 0 ? 'No matching live jobs found' : `${liveJobs[sponsor.id].ats_used?.join(', ') || 'ATS'} - ${liveJobs[sponsor.id].jobs?.length || 0} roles`}</span>}
              </div>

              {liveJobs[sponsor.id]?.jobs?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {liveJobs[sponsor.id].jobs.slice(0, 3).map(job => (
                    <div key={job.id || job.externalId || job.url} className="bg-zinc-950 border border-zinc-800 rounded p-2">
                      <div className="text-xs font-medium">{job.title} <span className={`ml-2 text-[9px] px-1.5 py-0.5 rounded ${job.matchPercent >= 80 ? 'bg-green-900 text-green-300' : job.matchPercent >= 60 ? 'bg-yellow-900 text-yellow-300' : 'bg-zinc-800'}`}>{job.matchPercent}% match</span></div>
                      <div className="text-[10px] text-zinc-500">{job.location} • {job.daysAgo ? `${job.daysAgo}d ago` : ''} • {job.ats || job.source?.ats || ''}</div>
                      {job.url && <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-violet-400 hover:underline">Apply →</a>}
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mt-3">
                <input placeholder="Contact person" value={sponsor.contact || ''} onChange={event => updateStatus(sponsor.id, 'contact', event.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs" />
                <input type="date" value={sponsor.dateApplied || ''} onChange={event => updateStatus(sponsor.id, 'dateApplied', event.target.value)} className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs" />
              </div>
              <textarea placeholder="Notes: recruiter email, referral, CoS timeline..." value={sponsor.notes || ''} onChange={event => updateStatus(sponsor.id, 'notes', event.target.value)} className="w-full mt-2 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs h-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
