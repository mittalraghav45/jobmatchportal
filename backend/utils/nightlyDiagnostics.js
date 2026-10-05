import { isTechJobTitle } from './techJobRole.js';
import { resolveUkJobLocation } from './ukJobLocation.js';

export function classifyNightlyJob(job = {}) {
  const location = job.location;
  const fallbackCountry = job.nation || job.country || job.countryCode || '';
  const locationResolution = resolveUkJobLocation(location, fallbackCountry);
  const uk = locationResolution.status === 'confirmed_uk';
  const live = Boolean(job.status?.isLive);
  const verified = job.verification?.status === 'live';
  const hasApplyUrl = typeof job.applyUrl === 'string' && job.applyUrl.trim() !== '';
  const processingComplete = job.processing?.status === 'complete';
  const technology = isTechJobTitle(job.title || '', job.department || '');

  const reasons = [];
  if (!uk) reasons.push(locationResolution.status === 'non_uk' ? 'non_uk' : 'uk_location_unresolved');
  if (!live) reasons.push('not_live');
  if (!verified) reasons.push('unverified');
  if (!hasApplyUrl) reasons.push('missing_apply_url');
  if (!processingComplete) reasons.push('source_processing_incomplete');
  if (!technology) reasons.push('non_technology_role');

  return {
    uk,
    ukStatus: locationResolution.status,
    ukEvidenceSource: locationResolution.evidenceSource,
    locationEvidence: locationResolution.value,
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
