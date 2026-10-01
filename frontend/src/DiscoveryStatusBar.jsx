import React, { useEffect, useState } from 'react';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

export default function DiscoveryStatusBar() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const runId = import.meta.env.VITE_GOLDEN_RUN_ID || 'golden-full-v1000';

  const refresh = async () => {
    try {
      const response = await fetch(`${API}/api/intelligence/dashboard?runId=${encodeURIComponent(runId)}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
      setData(json);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [runId]);

  const d = data?.discovery;
  const isRunning = d?.status === 'running';
  const isStale = d?.status === 'stale' || d?.phase === 'stale';
  const statusLabel = isRunning ? 'RUNNING' : isStale ? 'STALE' : d?.status === 'completed' ? 'COMPLETED' : 'IDLE';

  return (
    <div className={`discovery-bar discovery-${isRunning ? 'running' : isStale ? 'stale' : d?.status || 'idle'}`}>
      <div className="discovery-inner">
        <div className="discovery-title">
          <span className="pulse" /> Discovery pipeline
        </div>
        {d ? (
          <>
            <div className="discovery-status-badge">{statusLabel}</div>
            <div className="discovery-progress" aria-label={`Discovery progress ${d.progressPercent}%`}>
              <div className="discovery-progress-fill" style={{ width: `${Math.min(100, d.progressPercent || 0)}%` }} />
            </div>
            <div className="discovery-metric"><strong>{d.processed.toLocaleString()}</strong> / {d.companyTotal.toLocaleString()} processed</div>
            <div className="discovery-metric"><strong>{d.progressPercent}%</strong></div>
            {isRunning && d.processing > 0 && (
              <div className="discovery-live-metric">
                <strong>{d.processingRemaining.toLocaleString()}</strong> in current batch
              </div>
            )}
            <div className="discovery-metric">{d.resolved.toLocaleString()} resolved</div>
            <div className="discovery-metric">{d.unresolved.toLocaleString()} unresolved</div>
            <button onClick={() => setOpen(v => !v)} className="discovery-details">{open ? 'Hide' : 'Details'}</button>
          </>
        ) : <div className="discovery-metric">{error || 'Connecting…'}</div>}
      </div>
      {open && d && (
        <div className="discovery-detail-panel">
          <div><span>Processed</span><strong>{d.processed.toLocaleString()}</strong></div>
          <div><span>In current batch</span><strong>{isRunning ? d.processingRemaining.toLocaleString() : '—'}</strong></div>
          <div><span>Remaining</span><strong>{d.remaining.toLocaleString()}</strong></div>
          <div><span>Current batch</span><strong>{d.currentBatch ? `${d.currentBatch.start.toLocaleString()}–${d.currentBatch.end.toLocaleString()}` : '—'}</strong></div>
          <div><span>Current company</span><strong>{d.currentCompany?.companyName || d.currentCompany?.companyId || '—'}</strong></div>
          <div><span>Phase</span><strong>{d.phase || '—'}</strong></div>
          <div><span>Jobs added</span><strong>{d.jobsAdded.toLocaleString()}</strong></div>
          <div><span>Jobs updated</span><strong>{d.jobsUpdated.toLocaleString()}</strong></div>
          <div><span>Failed</span><strong>{d.failed.toLocaleString()}</strong></div>
          <div><span>Run</span><strong>{d.runId}</strong></div>
        </div>
      )}
    </div>
  );
}
