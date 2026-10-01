import { useEffect, useState } from 'react';
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
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function normaliseMatches(payload) {
  const candidates = payload?.matches || payload?.jobs || payload?.data || payload?.results || [];
  return Array.isArray(candidates) ? candidates : [];
}

function MatchCard({ item }) {
  const job = item?.job || item;
  const score = pick(item, ['matchScore', 'score', 'matchPercentage'], pick(job, ['matchScore', 'score'], null));
  const title = pick(job, ['title', 'jobTitle'], 'Untitled role');
  const companyValue = pick(job, ['companyName', 'employerName', 'company'], pick(item?.company, ['name'], 'Company being resolved'));
  const company = typeof companyValue === 'object' ? pick(companyValue, ['name', 'companyName'], 'Company being resolved') : companyValue;
  const location = pick(job, ['location', 'city'], 'Location not specified');
  const nation = pick(job, ['nation'], '');
  const atsValue = pick(job, ['ats', 'atsName'], pick(job?.source, ['ats'], pick(item?.company, ['ats'], '')));
  const ats = displayAts(atsValue);
  const applicationUrl = firstUrl(
    pick(job, ['applicationUrl', 'applyUrl', 'atsUrl', 'jobUrl', 'url'], ''),
    pick(job?.source, ['url'], ''),
    pick(job?.raw, ['applyUrl', 'applicationUrl', 'job_url', 'url'], ''),
    pick(item?.company, ['careersUrl', 'website'], '')
  );
  const sponsorship = pick(item, ['sponsorship'], pick(job, ['sponsorship', 'sponsorshipStatus'], ''));
  const closingAt = pick(job, ['closingAt', 'closingDate'], pick(job?.dates, ['closingAt', 'closingDate'], ''));
  const postedAt = pick(job, ['postedAt', 'postedDate'], pick(job?.dates, ['postedAt', 'postedDate'], ''));
  const isLive = job?.isLive !== false && job?.status?.isLive !== false;
  const reasons = item?.explanation?.reasons || item?.reasons || item?.matchReasons || item?.analysis?.reasons || [];
  const skills = item?.explanation?.matchedSkills || item?.matchedSkills || item?.candidateScore?.matchedSkills || item?.match?.matchedSkills || job?.matchedSkills || [];
  const reasonList = Array.isArray(reasons) ? reasons.slice(0, 3) : [];
  const skillList = Array.isArray(skills) ? skills.slice(0, 6) : [];

  return (
    <article className="match-card">
      <div className="match-card-top">
        <div>
          <div className="match-company">{company}</div>
          <h3>{title}</h3>
        </div>
        {score !== null && score !== '' && (
          <div className="match-score" aria-label={`${score}% match`}>
            <strong>{Math.round(Number(score))}%</strong>
            <span>match</span>
          </div>
        )}
      </div>

      <div className="match-meta">
        <span>{location}{nation ? ` · ${nation}` : ''}</span>
        {ats && ats !== 'unknown' && <span>ATS: {ats}</span>}
      </div>

      <div className="match-badges">
        <span className="match-badge">{isLive ? 'Live' : 'Closed'}</span>
        {closingAt && <span className="match-badge">Closes: {formatClosingDate(closingAt)}</span>}
        {postedAt && <span className="match-badge">Posted: {formatClosingDate(postedAt)}</span>}
        {sponsorship && <span className="match-badge">Sponsorship: {String(sponsorship)}</span>}
        {skillList.map((skill) => <span className="match-badge" key={skill}>{String(skill)}</span>)}
      </div>

      {reasonList.length > 0 && (
        <div className="match-reasons">
          <strong>Why this matches</strong>
          <ul>{reasonList.map((reason, index) => <li key={`${reason}-${index}`}>{String(reason)}</li>)}</ul>
        </div>
      )}

      <div className="match-actions">
        {applicationUrl && isLive ? (
          <a href={applicationUrl} target="_blank" rel="noreferrer" className="match-primary">Apply</a>
        ) : (
          <button type="button" className="match-primary" disabled>{isLive ? 'No application link' : 'Job closed'}</button>
        )}
        <button type="button" className="match-secondary">Save</button>
      </div>
    </article>
  );
}

export default function MyMatches({ profileId = 'default', limit = 20 }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE}/api/match/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId, page: 1, limit }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Matching API returned ${response.status}`);
        const payload = await response.json();
        setMatches(normaliseMatches(payload));
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message || 'Unable to load matches');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [profileId, limit]);

  useEffect(() => {
    let observer;
    const installNavigation = () => {
      const sidebar = document.querySelector('.sidebar');
      if (!sidebar) return;
      const jobsButton = [...sidebar.querySelectorAll('.nav')].find((button) => button.textContent?.trim() === 'Jobs');
      if (!jobsButton || sidebar.querySelector('[data-my-matches-nav]')) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav';
      button.dataset.myMatchesNav = 'true';
      button.textContent = 'My Matches';
      button.setAttribute('aria-label', 'My Matches');
      button.addEventListener('click', () => setOpen(true));
      jobsButton.insertAdjacentElement('afterend', button);
    };

    installNavigation();
    observer = new MutationObserver(installNavigation);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer?.disconnect();
  }, []);

  return (
    <>
      {open && (
        <div className="my-matches-overlay" role="dialog" aria-modal="true" aria-label="My Matches">
          <section className="my-matches my-matches-page">
            <div className="my-matches-header">
              <div>
                <p className="eyebrow">PERSONALISED DISCOVERY</p>
                <h2>My Matches</h2>
                <p>Jobs ranked against your candidate profile using the global matching pipeline.</p>
              </div>
              <div className="my-matches-header-actions">
                {!loading && !error && <span className="match-count">{matches.length} matches</span>}
                <button type="button" className="match-close" onClick={() => setOpen(false)}>Close</button>
              </div>
            </div>

            {loading && <div className="matches-state">Loading your matches…</div>}
            {!loading && error && <div className="matches-state matches-error">{error}</div>}
            {!loading && !error && matches.length === 0 && (
              <div className="matches-state">No matches were returned for this profile.</div>
            )}
            {!loading && !error && matches.length > 0 && (
              <div className="matches-grid">
                {matches.map((item, index) => <MatchCard item={item} key={item?.job?.id || item?.job?._id || item?._id || item?.jobId || index} />)}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
