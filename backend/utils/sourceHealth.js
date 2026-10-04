export function buildSourceHealthSummary({ total = 0, verification = [], processing = [], ats = [], staleLive = 0, missingApplyUrl = 0 } = {}) {
  const normalise = rows => Object.fromEntries(
    rows
      .filter(row => row && row._id !== undefined && row._id !== null)
      .map(row => [String(row._id), Number(row.count || 0)])
  );

  return {
    total: Number(total || 0),
    staleLive: Number(staleLive || 0),
    missingApplyUrl: Number(missingApplyUrl || 0),
    verification: normalise(verification),
    processing: normalise(processing),
    ats: normalise(ats)
  };
}

export function normaliseStaleHours(value, fallback = 24) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 24 * 30);
}
