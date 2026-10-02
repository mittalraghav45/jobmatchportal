(() => {
  const ID = 'jobmatch-live-job-counter';
  const POLL_MS = 5000;

  function ensureCounter() {
    let el = document.getElementById(ID);
    if (el) return el;

    el = document.createElement('div');
    el.id = ID;
    el.style.cssText = [
      'position:fixed',
      'right:18px',
      'bottom:18px',
      'z-index:9999',
      'padding:10px 14px',
      'border:1px solid rgba(148,163,184,.25)',
      'border-radius:12px',
      'background:rgba(15,23,42,.94)',
      'color:#e2e8f0',
      'font:600 13px/1.3 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'box-shadow:0 8px 30px rgba(0,0,0,.25)',
      'backdrop-filter:blur(8px)',
      'pointer-events:none'
    ].join(';');
    el.textContent = 'Verified live jobs: loading…';
    document.body.appendChild(el);
    return el;
  }

  async function refresh() {
    const el = ensureCounter();
    try {
      const response = await fetch('/api/jobs?limit=1', {
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const total = Number(data?.pagination?.total);
      if (!Number.isFinite(total)) throw new Error('Invalid jobs count');
      el.textContent = `✓ ${total.toLocaleString()} verified live jobs · updating automatically`;
      el.title = `Last checked ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      el.textContent = '⚠ Verified live jobs: unavailable';
      el.title = error.message || 'Unable to query the jobs API';
    }
  }

  function start() {
    ensureCounter();
    refresh();
    window.setInterval(refresh, POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
