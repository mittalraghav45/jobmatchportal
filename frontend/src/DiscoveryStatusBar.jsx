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
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, []);

  const d = data?.discovery;
  return (
    <div className="discovery-bar">
      <div className="discovery-inner">
        <div className="discovery-title"><span className="pulse" /> Discovery pipeline</div>
        {d ? (
          <>
            <div className="discovery-progress"><div className="discovery-progress-fill" style={{ width: `${Math.min(100, d.progressPercent || 0)}%` }} /></div>
            <div className="discovery-metric"><strong>{d.processed.toLocaleString()}</strong> / {d.companyTotal.toLocaleString()} companies</div>
            <div className="discovery-metric"><strong>{d.progressPercent}%</strong></div>
            <div className="discovery-metric">{d.resolved.toLocaleString()} resolved</div>
            <div className="discovery-metric">{d.unresolved.toLocaleString()} unresolved</div>
            <button onClick={() => setOpen(v => !v)} className="discovery-details">{open ? 'Hide' : 'Details'}</button>
          </>
        ) : <div className="discovery-metric">{error || 'Connecting…'}</div>}
      </div>
      {open && d && (
        <div className="discovery-detail-panel">
          <div><span>Remaining</span><strong>{d.remaining.toLocaleString()}</strong></div>
          <div><span>Jobs added</span><strong>{d.jobsAdded.toLocaleString()}</strong></div>
          <div><span>Jobs updated</span><strong>{d.jobsUpdated.toLocaleString()}</strong></div>
          <div><span>Failed</span><strong>{d.failed.toLocaleString()}</strong></div>
          <div><span>Run</span><strong>{d.runId}</strong></div>
        </div>
      )}
    </div>
  );
}
