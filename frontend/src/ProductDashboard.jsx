import React, { useEffect, useMemo, useState } from 'react';
import './product-dashboard.css';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const DEMO_PROFILE = { id: 'default', name: 'Candidate', skills: ['React', 'TypeScript', 'JavaScript', 'Node.js', 'AWS'] };
const DEMO = [
  { id: 'demo-1', title: 'Software Engineer', companyName: 'Monzo', location: 'London, UK', skills: ['React', 'TypeScript', 'Node.js'], sponsorship: { status: 'verified' } },
  { id: 'demo-2', title: 'Frontend Engineer', companyName: 'Deliveroo', location: 'London, UK', skills: ['React', 'TypeScript'], sponsorship: { status: 'unknown' } },
  { id: 'demo-3', title: 'Software Developer', companyName: 'Wise', location: 'London, UK', skills: ['JavaScript', 'React', 'Node.js'], sponsorship: { status: 'unknown' } }
];

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function normaliseJob(x) {
  return { ...x, id: x.id || x._id || x.externalId || x.canonicalUrl, title: x.title || x.jobTitle || 'Untitled role', companyName: x.companyName || x.company?.name || 'Unknown company', location: x.location || 'Location not specified', skills: x.skills || x.technicalSkills || [], sponsorship: x.sponsorship || { status: x.sponsorshipStatus || 'unknown' } };
}

function localMatch(job, profile) {
  const wanted = new Set((profile?.skills || []).map(x => String(x).toLowerCase()));
  const skills = (job.skills || []).map(String);
  const matched = skills.filter(x => wanted.has(x.toLowerCase()));
  const missing = skills.filter(x => !wanted.has(x.toLowerCase()));
  const skillScore = skills.length ? Math.round((matched.length / skills.length) * 80) : 0;
  const sponsorshipScore = job.sponsorship?.status === 'verified' ? 20 : 10;
  return { score: Math.min(skillScore + sponsorshipScore, 100), matchedSkills: matched, missingSkills: missing, sponsorship: job.sponsorship || { status: 'unknown' } };
}

export default function ProductDashboard() {
  const [view, setView] = useState('dashboard');
  const [jobs, setJobs] = useState([]);
  const [apps, setApps] = useState([]);
  const [profile, setProfile] = useState(DEMO_PROFILE);
  const [search, setSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [match, setMatch] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setError('');
      const [jobsData, appsData] = await Promise.all([api('/api/jobs?limit=50'), api('/api/applications?limit=50')]);
      const rawJobs = Array.isArray(jobsData) ? jobsData : (jobsData.jobs || jobsData.data || []);
      setJobs(rawJobs.map(normaliseJob));
      setApps(Array.isArray(appsData) ? appsData : (appsData.applications || appsData.data || []));
      try { const p = await api('/api/profile/default'); setProfile(p.profile || p); } catch (_) { /* fallback */ }
    } catch (e) {
      setError(e.message); setJobs(DEMO); setApps([]); setProfile(DEMO_PROFILE);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => jobs.filter(x => `${x.title} ${x.companyName} ${x.location} ${(x.skills || []).join(' ')}`.toLowerCase().includes(search.toLowerCase())), [jobs, search]);

  const analyse = async job => {
    setSelectedJob(job); setMatch(localMatch(job, profile)); setBusy(true);
    try {
      const data = await api('/api/match', { method: 'POST', body: JSON.stringify({ jobId: job.id, profileId: profile.id || 'default', job, profile }) });
      setMatch(data.match || data);
    } catch (_) { /* deterministic local result remains available */ }
    finally { setBusy(false); }
  };

  const prepare = async job => {
    try {
      const data = await api('/api/applications', { method: 'POST', body: JSON.stringify({ jobId: job.id, profileId: profile.id || 'default', status: 'saved' }) });
      setApps(p => [data.application || data, ...p]); setView('applications'); setSelectedJob(null);
    } catch (e) { setError(e.message); }
  };

  return <div className="portal">
    <aside className="sidebar"><h2>JobMatch</h2>{[['dashboard','Dashboard'],['jobs','Jobs'],['applications','Applications'],['profile','Candidate profile']].map(([k,l]) => <button className={view === k ? 'nav active' : 'nav'} onClick={() => setView(k)} key={k}>{l}</button>)}</aside>
    <main className="main">
      <header><div><h1>{view === 'dashboard' ? 'Dashboard' : view === 'jobs' ? 'Jobs' : view === 'applications' ? 'Applications' : 'Candidate profile'}</h1><p>UK software engineering job intelligence</p></div><button onClick={load}>Refresh</button></header>
      {error && <div className="notice">Development fallback: {error}</div>}
      {view === 'dashboard' && <><div className="stats"><Card label="Jobs" value={jobs.length}/><Card label="Applications" value={apps.length}/><Card label="Interviews" value={apps.filter(x => x.status === 'interview').length}/></div><section><div className="section-head"><div><h2>Recent matches</h2><p>Open a role to inspect its match and evidence.</p></div><button onClick={() => setView('jobs')}>View all</button></div><JobList jobs={filtered.slice(0,8)} analyse={analyse}/></section></>}
      {view === 'jobs' && <section><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs, companies, skills or locations"/><h2>{filtered.length} jobs</h2><JobList jobs={filtered} analyse={analyse}/></section>}
      {view === 'applications' && <section><h2>Application pipeline</h2>{apps.length ? apps.map((app, i) => <article className="job" key={app._id || app.id || i}><div><small>{app.companyName || app.job?.companyName || 'Company'}</small><h3>{app.jobTitle || app.job?.title || 'Application'}</h3><p>Application status: {app.status || 'saved'}</p></div><span className="sponsor">{app.status || 'saved'}</span></article>) : <p>No applications yet.</p>}</section>}
      {view === 'profile' && <section><h2>Candidate profile</h2><div className="profile"><b>Name</b><span>{profile.name || 'Candidate'}</span><b>Skills</b><span>{(profile.skills || []).join(' · ')}</span><b>Target</b><span>UK software engineering</span></div></section>}
    </main>
    {selectedJob && <MatchModal job={selectedJob} match={match} busy={busy} onClose={() => setSelectedJob(null)} onPrepare={() => prepare(selectedJob)} />}
  </div>;
}

function MatchModal({ job, match, busy, onClose, onPrepare }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="match-modal" onClick={e => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose}>×</button><small>{job.companyName}</small><h2>{job.title}</h2><p>{job.location}</p>
    <div className="match-score"><strong>{match?.score ?? '—'}%</strong><span>match</span></div>{busy && <p className="muted">Checking the backend matching engine…</p>}
    <div className="match-grid"><div><h3>Matched skills</h3>{(match?.matchedSkills || []).map(x => <span className="tag positive" key={x}>{x}</span>)}{!(match?.matchedSkills || []).length && <span className="muted">None identified</span>}</div><div><h3>Missing / unmatched</h3>{(match?.missingSkills || []).map(x => <span className="tag" key={x}>{x}</span>)}{!(match?.missingSkills || []).length && <span className="muted">None identified</span>}</div></div>
    <div className="evidence"><b>Sponsorship</b><span>{job.sponsorship?.status || 'unknown'}</span></div><p className="muted">Unknown sponsorship evidence is not treated as a negative sponsorship claim.</p>
    <button className="primary" onClick={onPrepare}>Prepare application</button>
  </div></div>;
}
function Card({ label, value }) { return <div className="card"><span>{label}</span><strong>{value}</strong></div>; }
function JobList({ jobs, analyse }) { return <div>{jobs.map(x => <article className="job" key={x.id || x._id}><div><small>{x.companyName}</small><h3>{x.title}</h3><p>{x.location}</p><div>{(x.skills || []).slice(0,5).map(s => <span className="tag" key={s}>{s}</span>)}</div></div><div><span className="sponsor">{x.sponsorship?.status || 'unknown'}</span><button onClick={() => analyse(x)}>View match</button></div></article>)}</div>; }
