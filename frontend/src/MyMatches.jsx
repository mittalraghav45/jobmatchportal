import { useEffect, useState } from 'react';
import './my-matches.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

function pick(obj, keys, fallback = '') {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}

function normaliseMatches(payload) {
  const candidates = payload?.jobs || payload?.matches || payload?.data || payload?.results || [];
  return Array.isArray(candidates) ? candidates : [];
}

function MatchCard({ item }) {
  const job = item?.job || item;
  const score = pick(item, ['matchScore', 'score', 'matchPercentage'], pick(job, ['matchScore', 'score'], null));
  const title = pick(job, ['title', 'jobTitle'], 'Untitled role');
  const company = pick(job, ['companyName', 'employerName', 'company'], 'Unknown company');
  const location = pick(job, ['location', 'city'], 'Location not specified');
  const nation = pick(job, ['nation'], '');
  const ats = pick(job, ['ats', 'atsName'], '');
  const applicationUrl = pick(job, ['applicationUrl', 'applyUrl', 'atsUrl', 'jobUrl', 'url'], '');
  const sponsorship = pick(job, ['sponsorship', 'sponsorshipStatus'], '');
  const reasons = item?.explanation?.reasons || item?.reasons || item?.matchReasons || [];
  const skills = item?.explanation?.matchedSkills || item?.matchedSkills || job?.matchedSkills || [];
  const reasonList = Array.isArray(reasons) ? reasons.slice(0, 3) : [];
  const skillList = Array.isArray(skills) ? skills.slice(0, 6) : [];

  return (
    <article className="match-card">
      <div className="match-card-top">
        <div>
          <div className="match-company">{company}</div>
          <h3>{title}</h3>
        </div>
        {score !== null && (
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
        {skillList.map((skill) => <span className="match-badge" key={skill}>{skill}</span>)}
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

  return (
    <section className="my-matches">
      <div className="my-matches-header">
        <div>
          <p className="eyebrow">PERSONALISED DISCOVERY</p>
          <h2>My Matches</h2>
          <p>Jobs ranked against your candidate profile.</p>
        </div>
        {!loading && !error && <span className="match-count">{matches.length} matches</span>}
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
  );
}
