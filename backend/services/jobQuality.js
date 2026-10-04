const DAY_MS = 24 * 60 * 60 * 1000;

export const FRESHNESS_THRESHOLDS_DAYS = Object.freeze({
  fresh: 7,
  recent: 30,
  ageing: 60
});

function validDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function calculateJobFreshness(job = {}, now = new Date()) {
  const reference = validDate(now) || new Date();
  const postedAt = validDate(job?.dates?.postedAt);
  const lastSeenAt = validDate(job?.dates?.lastSeenAt) || validDate(job?.dates?.firstSeenAt);
  const closingAt = validDate(job?.dates?.closingAt);

  if (closingAt && closingAt.getTime() <= reference.getTime()) return 'expired';

  const basis = postedAt || lastSeenAt;
  if (!basis) return 'unknown';

  const ageDays = Math.max(0, (reference.getTime() - basis.getTime()) / DAY_MS);
  if (ageDays <= FRESHNESS_THRESHOLDS_DAYS.fresh) return 'fresh';
  if (ageDays <= FRESHNESS_THRESHOLDS_DAYS.recent) return 'recent';
  if (ageDays <= FRESHNESS_THRESHOLDS_DAYS.ageing) return 'ageing';
  return 'stale';
}

function sourceConfidence(job) {
  const verificationStatus = job?.verification?.status;
  const ats = String(job?.source?.ats || '').toLowerCase();
  if (verificationStatus === 'live') return 40;
  if (verificationStatus === 'closed') return 0;
  if (ats && ats !== 'unknown') return 10;
  return 0;
}

export function calculateJobQualityScore(job = {}, now = new Date()) {
  let score = sourceConfidence(job);
  const reasons = [];

  if (job?.verification?.status === 'live') reasons.push('verified_live');
  if (job?.verification?.status === 'closed') reasons.push('verified_closed');

  const freshness = calculateJobFreshness(job, now);
  if (freshness === 'fresh') { score += 25; reasons.push('fresh'); }
  else if (freshness === 'recent') { score += 18; reasons.push('recent'); }
  else if (freshness === 'ageing') { score += 8; reasons.push('ageing'); }
  else if (freshness === 'stale') reasons.push('stale');
  else if (freshness === 'expired') reasons.push('expired');

  if (job?.title?.trim()) { score += 10; reasons.push('title'); }
  if (job?.companyName?.trim() || job?.companyId) { score += 5; reasons.push('company'); }
  if (job?.location?.trim()) { score += 5; reasons.push('location'); }
  if (job?.description && String(job.description).trim().length >= 120) { score += 5; reasons.push('description'); }
  if (job?.applyUrl?.trim()) { score += 5; reasons.push('apply_url'); }
  if (job?.source?.url?.trim()) { score += 5; reasons.push('source_url'); }
  if (job?.verification?.evidenceType) { score += 5; reasons.push('evidence'); }

  if (freshness === 'expired' || job?.verification?.status === 'closed') score = Math.min(score, 20);

  return { score: Math.max(0, Math.min(100, score)), freshness, reasons };
}

export function buildJobQualityFields(job = {}, now = new Date()) {
  const result = calculateJobQualityScore(job, now);
  const sourceConfidenceScore = sourceConfidence(job);
  return {
    qualityScore: result.score,
    freshness: result.freshness,
    sourceConfidence: Math.round((sourceConfidenceScore / 40) * 100) / 100,
    qualityReasons: result.reasons
  };
}
