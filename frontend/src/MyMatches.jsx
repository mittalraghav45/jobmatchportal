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
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const candidate = value.name || value.type || value.platform || value.provider || value.ats || value.slug || value.id;
    return candidate ? String(candidate) : 'Unknown ATS';
  }
  return String(value);
}

function normaliseMatches(payload) {
  const candidates = payload?.jobs || payload?.matches || payload?.data || payload?.results || [];
  return Array.isArray(candidates) ? candidates : [];
}

function MatchCard({ item }) {
  const job = item?.job || item;
  const score = pick(item, ['matchScore', 'score', 'matchPercentage'], pick(job, ['matchScore', 'score'], null));
  const title = pick(job, ['title', 'jobTitle'], 'Untitled role');
  const company = pick(job, ['companyName', 'employerName', 'company'], 'Company being resolved');
  const location = pick(job, ['location', 'city'], 'Location not specified');
  const nation = pick(job, ['nation'], '');
  const ats = displayAts(pick(job, ['ats', 'atsName'], pick(item?.company, ['ats'], '')));
  const applicationUrl = pick(job, ['applicationUrl', 'applyUrl', 'atsUrl', 'jobUrl', 'url'], '');
  const sponsorship = pick(item, ['sponsorship'], pick(job, ['sponsorship', 'sponsorshipStatus'], ''));
  const reasons = item?.explanation?.reasons || item?.reasons || item?.matchReasons || item?.analysis?.reasons || [];
  const skills = item?.explanation?.matchedSkills || item?.matchedSkills || item?.candidateScore?.matchedSkills || job?.matchedSkills || [];
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
        {ats && <span>ATS: {ats}</span>}
      </div>

      <div className="match-badges">
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
        {applicationUrl ? (
          <a href={applicationUrl} target="_blank" rel="noreferrer" className="match-primary">Apply</a>
        ) : (
          <button type="button" className="match-primary" disabled>No application link</button>
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
      if (!jobsButton) return;
      if (sidebar.querySelector('[data-my-matches-nav]')) return;

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
                {matches.map((item, index) => <MatchCard item={item} key={item?.job?._id || item?._id || item?.jobId || index} />)}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
