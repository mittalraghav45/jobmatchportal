import React from 'react';

export default function ApplicationReview({ application, busy, onClose, onGenerate, onStatus }) {
  const pack = application?.materials?.applicationPack || application?.applicationPack || null;
  const validation = pack?.validation;
  const status = application?.status || 'saved';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="application-modal" onClick={event => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="review-head">
          <div>
            <small>{application.companyName || application.job?.companyName || 'Company'}</small>
            <h2>{application.jobTitle || application.job?.title || 'Application review'}</h2>
          </div>
          <span className="sponsor">{status}</span>
        </div>

        <div className="review-actions">
          <button className="primary" disabled={busy} onClick={onGenerate}>
            {busy ? 'Generating…' : pack ? 'Regenerate application pack' : 'Generate application pack'}
          </button>
          <select value={status} disabled={busy} onChange={event => onStatus(event.target.value)}>
            <option value="saved">Saved</option>
            <option value="tailoring">Tailoring</option>
            <option value="ready_to_apply">Ready to apply</option>
            <option value="applied">Applied</option>
            <option value="interview">Interview</option>
            <option value="offer">Offer</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </div>

        {!pack ? (
          <div className="empty-review">
            <h3>No application pack yet</h3>
            <p>Generate the pack to create the tailored CV content, cover letter, supporting statement and evidence review.</p>
          </div>
        ) : (
          <div className="pack">
            <ValidationBox validation={validation} />
            <ReviewBlock title="Professional summary" value={pack.summary || pack.professionalSummary} />
            <ReviewBlock title="Keywords" value={(pack.keywords || []).join(' · ')} />
            <ReviewBlock title="Cover letter" value={pack.coverLetter} />
            <ReviewBlock title="Supporting statement" value={pack.supportingStatement} />
            <ReviewBlock title="Evidence gaps" value={(pack.evidenceGaps || []).map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n')} />
            <ReviewBlock title="Experience bullets" value={(pack.experienceBullets || []).map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n')} />
          </div>
        )}
      </div>
    </div>
  );
}

function ValidationBox({ validation }) {
  if (!validation) return null;
  return (
    <div className={validation.valid ? 'validation valid' : 'validation invalid'}>
      <strong>{validation.valid ? 'Validation passed' : 'Validation requires attention'}</strong>
      {(validation.errors || []).map(error => <div key={error}>Error: {error}</div>)}
      {(validation.warnings || []).map(warning => <div key={warning}>Warning: {warning}</div>)}
    </div>
  );
}

function ReviewBlock({ title, value }) {
  if (!value) return null;
  return <section className="review-block"><h3>{title}</h3><div>{value}</div></section>;
}
