import { useMemo, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

const STATUS_LABELS = {
  saved: 'Saved',
  tailoring: 'Preparing',
  ready_to_apply: 'Ready to apply',
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn'
};

function evidenceValue(value) {
  if (value === undefined || value === null || value === '') return 'Not available';
  if (typeof value === 'object') return value.status || value.name || value.value || 'Not available';
  return String(value);
}

export default function ApplicationPreparation({ application, onClose, onUpdated }) {
  const [notes, setNotes] = useState(application?.notes || '');
  const [cv, setCv] = useState(application?.materials?.cv || 'not_started');
  const [coverLetter, setCoverLetter] = useState(application?.materials?.coverLetter || 'not_started');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [currentStatus, setCurrentStatus] = useState(application?.status || 'saved');

  const match = application?.match || {};
  const nextStatus = useMemo(() => {
    if (currentStatus === 'saved') return 'tailoring';
    if (currentStatus === 'tailoring') return 'ready_to_apply';
    return null;
  }, [currentStatus]);

  if (!application) return null;

  async function updateApplication(patch) {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/applications/${encodeURIComponent(application.applicationId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Unable to update application (${response.status})`);
      const updated = payload.application || { ...application, ...patch };
      setCurrentStatus(updated.status || currentStatus);
      onUpdated?.(updated);
      setMessage('Application preparation saved.');
      return updated;
    } catch (err) {
      setError(err.message || 'Unable to update application');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function savePreparation() {
    await updateApplication({
      notes,
      materials: { ...(application.materials || {}), cv, coverLetter }
    });
  }

  async function advanceStatus() {
    if (!nextStatus) return;
    const response = await fetch(`${API_BASE}/api/applications/${encodeURIComponent(application.applicationId)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error || `Unable to change status (${response.status})`);
      return;
    }
    const updated = payload.application;
    setCurrentStatus(updated.status);
    onUpdated?.(updated);
    setMessage(`Application moved to ${STATUS_LABELS[updated.status] || updated.status}.`);
  }

  const job = application.job || {};

  return (
    <div className="job-details-overlay" role="dialog" aria-modal="true" aria-label="Application preparation">
      <section className="job-details-panel application-preparation-panel">
        <header className="job-details-header">
          <div>
            <p className="eyebrow">APPLICATION PREPARATION</p>
            <h2>{job.title || 'Untitled role'}</h2>
            <p>{job.company || 'Unknown company'}</p>
          </div>
          <button type="button" className="match-close" onClick={onClose}>Close</button>
        </header>

        <div className="job-details-status-row">
          <span className="match-badge">Status: {STATUS_LABELS[currentStatus] || currentStatus}</span>
          {match.score !== null && match.score !== undefined && <span className="match-badge">Match: {match.score}%</span>}
          <span className="match-badge">Sponsorship: {evidenceValue(match.sponsorship)}</span>
        </div>

        <div className="application-prep-grid">
          <section className="job-details-section">
            <h3>Match snapshot</h3>
            <p>This snapshot is retained from when the job was saved. It is not recalculated by the preparation screen.</p>
            <div className="detail-columns">
              <div>
                <strong>Matched skills</strong>
                {Array.isArray(match.matchedSkills) && match.matchedSkills.length ? <ul>{match.matchedSkills.map((skill, i) => <li key={`${skill}-${i}`}>{String(skill)}</li>)}</ul> : <p>Not available</p>}
              </div>
              <div>
                <strong>Missing / unmatched</strong>
                {Array.isArray(match.missingSkills) && match.missingSkills.length ? <ul>{match.missingSkills.map((skill, i) => <li key={`${skill}-${i}`}>{String(skill)}</li>)}</ul> : <p>None reported</p>}
              </div>
            </div>
          </section>

          <section className="job-details-section">
            <h3>Preparation checklist</h3>
            <label className="prep-field">CV
              <select value={cv} onChange={event => setCv(event.target.value)}>
                <option value="not_started">Not started</option>
                <option value="tailoring">Needs tailoring</option>
                <option value="ready">Ready</option>
              </select>
            </label>
            <label className="prep-field">Cover letter
              <select value={coverLetter} onChange={event => setCoverLetter(event.target.value)}>
                <option value="not_started">Not started</option>
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
              </select>
            </label>
          </section>
        </div>

        <section className="job-details-section">
          <h3>Application notes</h3>
          <textarea className="prep-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Record tailoring points, recruiter notes, questions, or application-specific context…" rows={6} />
        </section>

        {error && <div className="matches-state matches-error">{error}</div>}
        {message && <div className="matches-state">{message}</div>}

        <footer className="job-details-actions">
          <button type="button" className="match-secondary" onClick={savePreparation} disabled={saving}>{saving ? 'Saving…' : 'Save preparation'}</button>
          {nextStatus && <button type="button" className="match-primary" onClick={advanceStatus} disabled={saving}>{nextStatus === 'tailoring' ? 'Start tailoring' : 'Mark ready to apply'}</button>}
          {currentStatus === 'ready_to_apply' && job.url && <a href={job.url} target="_blank" rel="noreferrer" className="match-primary">Open application</a>}
        </footer>
      </section>
    </div>
  );
}
