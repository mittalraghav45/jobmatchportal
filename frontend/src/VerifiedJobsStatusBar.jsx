import React, { useEffect, useState } from 'react';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

export default function VerifiedJobsStatusBar() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = async () => {
    try {
      const response = await fetch(`${API}/api/jobs?live=true&limit=1`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
      setData(json);
      setError('');
      setLastUpdated(new Date());
    } catch (e) {
      setError(e.message || 'API unavailable');
    }
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  const total = data?.pagination?.total;

  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-zinc-800 bg-zinc-950/95 px-4 py-3 text-xs text-zinc-300 shadow-xl backdrop-blur">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${error ? 'bg-red-500' : 'bg-green-500'}`} />
        <span className="font-medium">Verified live jobs</span>
        {total !== undefined && <strong className="text-white">{total.toLocaleString()}</strong>}
      </div>
      <div className="mt-1 text-[10px] text-zinc-500">
        {error ? `API: ${error}` : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Connecting…'}
      </div>
    </div>
  );
}
