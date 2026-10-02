import React, { useEffect, useState } from 'react';
import './my-matches.css';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function scoreClass(score) {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'good';
  return 'partial';
}

export default function MyMatches({ profileId = 'default', onPrepare }) {
  const [matches, setMatches] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sponsorship, setSponsorship] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (nextPage = page, nextSponsorship = sponsorship) => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/match/jobs', {
        method: 'POST',
        body: JSON.stringify({
          profileId,
          page: nextPage,
          limit: 20,
          sponsorship: nextSponsorship === 'all' ? undefined : nextSponsorship,
          verifiedLiveOnly: true
        })
      });
      setMatches(data.matches || []);
      setPage(data.page || nextPage);
      setPages(data.pages || 1);
      setTotal(Number(data.total) || 0);
    } catch (err) {
      setError(err.message);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1, sponsorship); }, [profileId]);

  const changeSponsorship = value => {
    setSponsorship(value);
    load(1, value);
  };

  return (
    <section className="my-matches">
      <div className="section-head">
        <div>
          <h2>My Matches</h2>
          <p>Verified-live UK technology jobs matched against your candidate profile.</p>
        </div>
        <div className="match-controls">
          <select value={sponsorship} onChange={e => changeSponsorship(e.target.value)}>
            <option value="all">All sponsorship evidence</option>
            <option value="verified">Verified sponsors</option>
            <option value="unknown">Unknown sponsorship</option>
            <option value="not-sponsor">Not sponsor</option>
          </select>
        </div>
      </div>

      {error && <div className="notice">{error}</div>}

      {loading ? (
        <div className="empty-state"><h3>Building your matches…</h3><p>Scoring verified-live jobs against your stored profile.</p></div>
      ) : !matches.length ? (
        <div className="empty-state"><h3>No matching verified-live jobs found</h3><p>Try allowing unknown sponsorship evidence or update your candidate profile.</p></div>
      ) : (
        <>
          <div className="match-summary"><strong>{total.toLocaleString()}</strong> verified-live technology jobs in this result set</div>
          <div className="match-list">
            {matches.map(item => {
              const score = Number(item.candidateScore?.score || 0);
              const job = item.job || {};
              const sponsorshipLabel = item.sponsorship || 'unknown';
              return (
                <article className="match-card" key={job.id}>
                  <div className="match-card-main">
                    <small>{job.companyName} · {job.location || 'UK-wide'}</small>
                    <h3>{job.title}</h3>
                    <div className="match-tags">
                      {(item.candidateScore?.matchedSkills || []).slice(0, 6).map(skill => <span className="tag positive" key={skill}>{skill}</span>)}
                    </div>
                    {item.candidateScore?.missingSkills?.length > 0 && (
                      <p className="muted">Missing: {item.candidateScore.missingSkills.slice(0, 4).join(', ')}</p>
                    )}
                  </div>
                  <div className="match-card-side">
                    <div className={`match-percent ${scoreClass(score)}`}><strong>{score}%</strong><span>match</span></div>
                    <span className={`sponsor ${sponsorshipLabel === 'verified' ? 'verified' : ''}`}>{sponsorshipLabel}</span>
                    <span className="verified-live">✓ Verified live</span>
                    <div className="match-actions">
                      {job.url && <a href={job.url} target="_blank" rel="noreferrer"><button type="button">View job</button></a>}
                      {onPrepare && <button type="button" className="primary" onClick={() => onPrepare({ ...job, sponsorship: sponsorshipLabel, match: item.candidateScore })}>Prepare</button>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="pagination">
            <button disabled={page <= 1 || loading} onClick={() => load(page - 1, sponsorship)}>Previous</button>
            <span>Page {page} of {pages}</span>
            <button disabled={page >= pages || loading} onClick={() => load(page + 1, sponsorship)}>Next</button>
          </div>
        </>
      )}
    </section>
  );
}
