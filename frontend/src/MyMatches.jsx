import { useEffect, useState } from 'react';
import ApplicationPreparation from './ApplicationPreparation.jsx';
import './my-matches.css';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

function pick(obj, keys, fallback = '') {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

function displayAts(value) {
  if (value === undefined || value === null || value === '' || value === '[object Object]') return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const candidate = value.name || value.type || value.platform || value.provider || value.ats || value.slug || value.id;
    if (candidate && candidate !== '[object Object]') return String(candidate);
  }
  return '';
}

function firstUrl(...values) {
  return values.find(value => typeof value === 'string' && /^https?:\/\//i.test(value.trim()))?.trim() || '';
}

function formatClosingDate(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function normaliseMatches(payload) {
  const candidates = payload?.matches || payload?.jobs || payload?.data || payload?.results || [];
  return Array.isArray(candidates) ? candidates : [];
}

function liveLabel(job) {
  if (job?.liveState === 'live') return 'Live';
  if (job?.liveState === 'closed') return 'Closed';
  return 'Status not available';
}

function liveClass(job) {
  if (job?.liveState === 'live') return 'match-badge match-badge-live';
  if (job?.liveState === 'closed') return 'match-badge match-badge-closed';
  return 'match-badge match-badge-unknown';
}

function safeText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
}

function JobDetails({ item, onClose, onSave, onPrepare, saving, saved }) {
  const job = item?.job || item;
  const title = pick(job, ['title', 'jobTitle'], 'Untitled role');
  const companyValue = pick(job, ['companyName', 'employerName', 'company'], pick(item?.company, ['name'], 'Company being resolved'));
  const company = typeof companyValue === 'object' ? pick(companyValue, ['name', 'companyName'], 'Company being resolved') : companyValue;
  const description = pick(job, ['description', 'jobDescription', 'summary'], 'No job description is available from the source data.');
  const applicationUrl = firstUrl(pick(job, ['applicationUrl', 'applyUrl', 'atsUrl', 'jobUrl', 'url'], ''), pick(job?.source, ['url'], ''), pick(job?.raw, ['applyUrl', 'applicationUrl', 'job_url', 'url'], ''));
  const ats = displayAts(pick(job, ['ats', 'atsName'], pick(job?.source, ['ats'], pick(item?.company, ['ats'], ''))));
  const closingAt = pick(job, ['closingAt', 'closingDate'], pick(job?.dates, ['closingAt', 'closingDate'], ''));
  const postedAt = pick(job, ['postedAt', 'postedDate'], pick(job?.dates, ['postedAt', 'postedDate'], ''));
  const liveState = job?.liveState || 'unknown';
  const verification = job?.liveVerification || {};
  const score = pick(item, ['matchScore', 'score', 'matchPercentage'], pick(item?.candidateScore, ['score', 'matchScore', 'matchPercentage'], null));
  const matchedSkills = item?.candidateScore?.matchedSkills || item?.match?.matchedSkills || item?.matchedSkills || [];
  const missingSkills = item?.candidateScore?.missingSkills || item?.match?.missingSkills || item?.missingSkills || [];
  const sponsorship = pick(item, ['sponsorship'], pick(job, ['sponsorship', 'sponsorshipStatus'], 'unknown'));
  const location = pick(job, ['location', 'city'], 'Location not specified');
  const employmentType = pick(job, ['employmentType', 'type'], 'Not available');

  return (
    <div className="job-details-overlay" role="dialog" aria-modal="true" aria-label={`Job details: ${title}`}>
      <section className="job-details-panel">
        <header className="job-details-header">
          <div><p className="eyebrow">JOB DETAILS</p><h2>{title}</h2><p>{company} · {location}</p></div>
          <button type="button" className="match-close" onClick={onClose}>Close</button>
        </header>
        <div className="job-details-status-row">
          <span className={liveClass(job)}>{liveLabel(job)}</span>
          <span className="match-badge">Closes: {formatClosingDate(closingAt)}</span>
          <span className="match-badge">Posted: {formatClosingDate(postedAt)}</span>
          {ats && <span className="match-badge">ATS: {ats}</span>}
          <span className="match-badge">Sponsorship: {safeText(sponsorship) || 'unknown'}</span>
        </div>
        <div className="job-details-grid">
          <main>
            <section className="job-details-section"><h3>Job description</h3><div className="job-description">{description}</div></section>
            <section className="job-details-section"><h3>Match evidence</h3><div className="job-detail-score">{Number.isFinite(Number(score)) ? `${Math.round(Number(score))}% match` : 'Match score not available'}</div><div className="detail-columns"><div><strong>Matched skills</strong>{Array.isArray(matchedSkills) && matchedSkills.length ? <ul>{matchedSkills.map((x, i) => <li key={`${x}-${i}`}>{String(x)}</li>)}</ul> : <p>Not available</p>}</div><div><strong>Missing / unmatched</strong>{Array.isArray(missingSkills) && missingSkills.length ? <ul>{missingSkills.map((x, i) => <li key={`${x}-${i}`}>{String(x)}</li>)}</ul> : <p>None reported</p>}</div></div></section>
          </main>
          <aside><section className="job-details-section evidence-card"><h3>Source evidence</h3><dl><dt>Employment type</dt><dd>{employmentType}</dd><dt>Live status</dt><dd>{liveLabel(job)}</dd><dt>Closing date</dt><dd>{formatClosingDate(closingAt)}</dd><dt>Last verification</dt><dd>{formatClosingDate(verification.checkedAt)}</dd><dt>Verification reason</dt><dd>{verification.reason || 'Not available'}</dd></dl>{liveState === 'unknown' && <p className="detail-warning">Live status could not be verified from the job source. Treat this listing as unverified.</p>}</section></aside>
        </div>
        <footer className="job-details-actions">
          {applicationUrl && liveState === 'live' ? <a href={applicationUrl} target="_blank" rel="noreferrer" className="match-primary">Open application</a> : <button type="button" className="match-primary" disabled>{liveState === 'closed' ? 'Job closed' : 'Application not verified'}</button>}
          <button type="button" className="match-secondary" onClick={() => onPrepare(item)} disabled={saving}>{saving ? 'Preparing…' : 'Prepare application'}</button>
          <button type="button" className="match-secondary" onClick={() => onSave(item)} disabled={saving || saved}>{saving ? 'Saving…' : saved ? 'Saved' : 'Save to applications'}</button>
        </footer>
      </section>
    </div>
  );
}

function MatchCard({ item, onSave, onPrepare, saving, saved, onDetails }) {
  const job = item?.job || item;
  const score = pick(item, ['matchScore', 'score', 'matchPercentage'], pick(item?.candidateScore, ['score', 'matchScore', 'matchPercentage'], pick(item?.match, ['score', 'matchScore', 'matchPercentage'], pick(job, ['matchScore', 'score'], null))));
  const title = pick(job, ['title', 'jobTitle'], 'Untitled role');
  const companyValue = pick(job, ['companyName', 'employerName', 'company'], pick(item?.company, ['name'], 'Company being resolved'));
  const company = typeof companyValue === 'object' ? pick(companyValue, ['name', 'companyName'], 'Company being resolved') : companyValue;
  const location = pick(job, ['location', 'city'], 'Location not specified');
  const nation = pick(job, ['nation'], '');
  const ats = displayAts(pick(job, ['ats', 'atsName'], pick(job?.source, ['ats'], pick(item?.company, ['ats'], ''))));
  const applicationUrl = firstUrl(pick(job, ['applicationUrl', 'applyUrl', 'atsUrl', 'jobUrl', 'url'], ''), pick(job?.source, ['url'], ''), pick(job?.raw, ['applyUrl', 'applicationUrl', 'job_url', 'url'], ''), pick(item?.company, ['careersUrl', 'website'], ''));
  const sponsorship = pick(item, ['sponsorship'], pick(job, ['sponsorship', 'sponsorshipStatus'], ''));
  const closingAt = pick(job, ['closingAt', 'closingDate'], pick(job?.dates, ['closingAt', 'closingDate'], ''));
  const postedAt = pick(job, ['postedAt', 'postedDate'], pick(job?.dates, ['postedAt', 'postedDate'], ''));
  const liveState = job?.liveState || 'unknown';
  const isLive = liveState === 'live';
  const isClosed = liveState === 'closed';
  const reasons = item?.explanation?.reasons || item?.reasons || item?.matchReasons || item?.analysis?.reasons || [];
  const skills = item?.explanation?.matchedSkills || item?.matchedSkills || item?.candidateScore?.matchedSkills || item?.match?.matchedSkills || job?.matchedSkills || [];
  const reasonList = Array.isArray(reasons) ? reasons.slice(0, 3) : [];
  const skillList = Array.isArray(skills) ? skills.slice(0, 6) : [];
  return <article className="match-card">
    <div className="match-card-top"><div><div className="match-company">{company}</div><h3>{title}</h3></div>{score !== null && score !== '' && Number.isFinite(Number(score)) && <div className="match-score" aria-label={`${Math.round(Number(score))}% match`}><strong>{Math.round(Number(score))}%</strong><span>match</span></div>}</div>
    <div className="match-meta"><span>{location}{nation ? ` · ${nation}` : ''}</span>{ats && ats !== 'unknown' && <span>ATS: {ats}</span>}</div>
    <div className="match-badges"><span className={liveClass(job)}>{liveLabel(job)}</span><span className="match-badge">Closes: {formatClosingDate(closingAt)}</span>{postedAt && <span className="match-badge">Posted: {formatClosingDate(postedAt)}</span>}{sponsorship && <span className="match-badge">Sponsorship: {String(sponsorship)}</span>}{skillList.map(skill => <span className="match-badge" key={skill}>{String(skill)}</span>)}</div>
    {liveState === 'unknown' && <div className="match-verification-note">Live status could not be verified from the job source. Treat this listing as unverified.</div>}
    {reasonList.length > 0 && <div className="match-reasons"><strong>Why this matches</strong><ul>{reasonList.map((reason, index) => <li key={`${reason}-${index}`}>{String(reason)}</li>)}</ul></div>}
    <div className="match-actions"><button type="button" className="match-primary" onClick={() => onDetails(item)}>View details</button>{applicationUrl && isLive ? <a href={applicationUrl} target="_blank" rel="noreferrer" className="match-secondary">Apply</a> : <button type="button" className="match-secondary" disabled>{isClosed ? 'Job closed' : 'Application not verified'}</button>}<button type="button" className="match-secondary" onClick={() => onPrepare(item)} disabled={saving}>{saving ? 'Preparing…' : 'Prepare'}</button><button type="button" className="match-secondary" onClick={() => onSave(item)} disabled={saving || saved}>{saving ? 'Saving…' : saved ? 'Saved' : 'Save'}</button></div>
  </article>;
}

export default function MyMatches({ profileId = 'default', limit = 20, initiallyOpen = false, onClose }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(initiallyOpen);
  const [savingId, setSavingId] = useState('');
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [selectedApplication, setSelectedApplication] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError('');
      try {
        const response = await fetch(`${API_BASE}/api/match/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId, page: 1, limit }), signal: controller.signal });
        if (!response.ok) throw new Error(`Matching API returned ${response.status}`);
        const payload = await response.json();
        setMatches(normaliseMatches(payload));
      } catch (err) { if (err.name !== 'AbortError') setError(err.message || 'Unable to load matches'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [profileId, limit]);

  async function saveMatch(item) {
    const job = item?.job || item;
    const jobId = String(job?.id || job?._id || job?.externalId || '');
    if (!jobId || savingId) return null;
    setSavingId(jobId); setError('');
    try {
      const score = pick(item, ['matchScore', 'score', 'matchPercentage'], pick(item?.candidateScore, ['score', 'matchScore', 'matchPercentage'], pick(item?.match, ['score', 'matchScore', 'matchPercentage'], null)));
      const body = { profileId, job: { id: jobId, title: job?.title || 'Untitled role', company: job?.companyName || 'Unknown company', companyId: job?.companyId || null, url: firstUrl(job?.applicationUrl, job?.applyUrl, job?.url, job?.source?.url) }, match: { score: Number.isFinite(Number(score)) ? Number(score) : null, matchedSkills: item?.candidateScore?.matchedSkills || item?.match?.matchedSkills || item?.matchedSkills || [], missingSkills: item?.candidateScore?.missingSkills || item?.match?.missingSkills || item?.missingSkills || [], sponsorship: item?.sponsorship || job?.sponsorship || 'unknown' } };
      const response = await fetch(`${API_BASE}/api/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (response.status === 409) {
        const existingResponse = await fetch(`${API_BASE}/api/applications?profileId=${encodeURIComponent(profileId)}`);
        const existingPayload = await existingResponse.json().catch(() => ({}));
        const existing = (existingPayload.applications || []).find(app => String(app?.job?.id || '') === jobId);
        if (!existing) throw new Error('Application already exists but could not be loaded');
        setSavedIds(current => new Set(current).add(jobId));
        return existing;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Unable to save application (${response.status})`);
      setSavedIds(current => new Set(current).add(jobId));
      return payload.application || null;
    } catch (err) { setError(err.message || 'Unable to save application'); return null; }
    finally { setSavingId(''); }
  }

  async function prepareMatch(item) {
    const application = await saveMatch(item);
    if (application) {
      setSelectedMatch(null);
      setSelectedApplication(application);
    }
  }

  const close = () => { setOpen(false); onClose?.(); };

  return <>
    {open && <div className="my-matches-overlay" role="dialog" aria-modal="true" aria-label="My Matches"><section className="my-matches my-matches-page"><div className="my-matches-header"><div><p className="eyebrow">PERSONALISED DISCOVERY</p><h2>My Matches</h2><p>Jobs ranked against your candidate profile using the global matching pipeline.</p></div><div className="my-matches-header-actions">{!loading && !error && <span className="match-count">{matches.length} matches</span>}<button type="button" className="match-close" onClick={close}>Close</button></div></div>
      {loading && <div className="matches-state">Loading your matches…</div>}
      {!loading && error && <div className="matches-state matches-error">{error}</div>}
      {!loading && !error && matches.length === 0 && <div className="matches-state">No matches were returned for this profile.</div>}
      {!loading && !error && matches.length > 0 && <div className="matches-grid">{matches.map((item, index) => { const job = item?.job || item; const jobId = String(job?.id || job?._id || job?.externalId || index); return <MatchCard item={item} key={jobId} onSave={saveMatch} onPrepare={prepareMatch} saving={savingId === jobId} saved={savedIds.has(jobId)} onDetails={setSelectedMatch} />; })}</div>}
    </section></div>}
    {selectedMatch && <JobDetails item={selectedMatch} onClose={() => setSelectedMatch(null)} onPrepare={prepareMatch} onSave={saveMatch} saving={savingId === String(selectedMatch?.job?.id || selectedMatch?.job?._id || selectedMatch?.job?.externalId || '')} saved={savedIds.has(String(selectedMatch?.job?.id || selectedMatch?.job?._id || selectedMatch?.job?.externalId || ''))} />}
    {selectedApplication && <ApplicationPreparation application={selectedApplication} onClose={() => setSelectedApplication(null)} onUpdated={updated => setSelectedApplication(updated)} />}
  </>;
}
