export function calculateApplicationReadiness({
  matchScore = 0,
  applicationPriority = null,
  isLive = true,
  applyUrl = '',
  verificationStatus = '',
  sponsorship = 'unknown',
  missingSkills = [],
  seniorityLevel = null,
  closingAt = null
} = {}) {
  const blockers = [];
  const warnings = [];
  const score = Number(matchScore) || 0;
  const priority = applicationPriority || {};

  if (!isLive) blockers.push('Job is not live');
  if (!String(applyUrl || '').trim()) blockers.push('No application URL');
  if (verificationStatus && verificationStatus !== 'live') blockers.push('Job source is not verified as live');

  if (score < 45) warnings.push('Low job match score');
  if (Array.isArray(missingSkills) && missingSkills.length) {
    warnings.push(`${missingSkills.length} technical skill${missingSkills.length === 1 ? '' : 's'} not demonstrated`);
  }
  if (seniorityLevel !== null && Number(seniorityLevel) >= 4) warnings.push('Role seniority may exceed candidate experience');
  if (sponsorship === 'unknown') warnings.push('Sponsorship status is unknown');

  if (closingAt) {
    const closing = new Date(closingAt).getTime();
    if (Number.isFinite(closing)) {
      if (closing < Date.now()) blockers.push('Application deadline has passed');
      else if (closing - Date.now() <= 3 * 86400000) warnings.push('Application closes soon');
    }
  }

  const readiness = blockers.length ? 'blocked' : warnings.length ? 'review' : 'ready';
  const action = readiness === 'ready'
    ? (priority.action === 'apply-now' ? 'apply-now' : 'apply')
    : readiness === 'review' ? 'review-before-applying' : 'do-not-apply';

  return { readiness, action, blockers, warnings };
}
