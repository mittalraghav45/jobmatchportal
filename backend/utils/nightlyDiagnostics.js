import { isTechJobTitle } from './techJobRole.js';
import { isUkJobLocation } from './ukJobLocation.js';

export function classifyNightlyJob(job = {}) {
  const locationEvidence = String(job.location || '').trim() || String(job.nation || '').trim();
  const uk = isUkJobLocation(locationEvidence);
  const live = Boolean(job.status?.isLive);
  const verified = job.verification?.status === 'live';
  const hasApplyUrl = typeof job.applyUrl === 'string' && job.applyUrl.trim() !== '';
  const processingComplete = job.processing?.status === 'complete';
  const technology = isTechJobTitle(job.title || '', job.department || '');

  const reasons = [];
  if (!uk) reasons.push('non_uk');
  if (!live) reasons.push('not_live');
  if (!verified) reasons.push('unverified');
  if (!hasApplyUrl) reasons.push('missing_apply_url');
  if (!processingComplete) reasons.push('source_processing_incomplete');
  if (!technology) reasons.push('non_technology_role');

  return {
    uk,
    live,
    verified,
    hasApplyUrl,
    processingComplete,
    technology,
    eligible: uk && live && verified && hasApplyUrl && processingComplete && technology,
    reasons
  };
}

export function incrementReasonCounts(reasonCounts, reasons) {
  for (const reason of reasons) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
}
