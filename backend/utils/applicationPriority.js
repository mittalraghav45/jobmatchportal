export function calculateApplicationPriority({
  matchScore = 0,
  sponsorship = 'unknown',
  seniorityLevel = null,
  isLive = true,
  postedAt = null,
  closingAt = null,
  employerType = 'private'
} = {}) {
  const score = Math.max(0, Math.min(100, Number(matchScore) || 0));
  const reasons = [];
  const penalties = [];
  let priorityScore = score;

  if (sponsorship === 'verified' || sponsorship === 'sponsor') {
    priorityScore += 12;
    reasons.push('Verified sponsor');
  } else if (sponsorship === 'not-sponsor') {
    priorityScore -= 25;
    penalties.push('No sponsor licence');
  } else {
    reasons.push('Sponsorship status unknown');
  }

  if (seniorityLevel !== null && Number.isFinite(Number(seniorityLevel))) {
    if (Number(seniorityLevel) >= 4) {
      priorityScore -= 12;
      penalties.push('Senior leadership level');
    } else if (Number(seniorityLevel) === 2) {
      priorityScore += 3;
      reasons.push('Good experience-level fit');
    }
  }

  if (!isLive) {
    priorityScore -= 50;
    penalties.push('Job is not live');
  }

  const now = Date.now();
  const posted = postedAt ? new Date(postedAt).getTime() : NaN;
  if (Number.isFinite(posted)) {
    const ageDays = Math.max(0, (now - posted) / 86400000);
    if (ageDays <= 3) {
      priorityScore += 6;
      reasons.push('Recently posted');
    } else if (ageDays > 30) {
      priorityScore -= 5;
      penalties.push('Older posting');
    }
  }

  const closing = closingAt ? new Date(closingAt).getTime() : NaN;
  if (Number.isFinite(closing)) {
    const daysToClose = (closing - now) / 86400000;
    if (daysToClose < 0) {
      priorityScore -= 50;
      penalties.push('Application closed');
    } else if (daysToClose <= 3) {
      priorityScore += 8;
      reasons.push('Closing soon');
    }
  }

  if (employerType && employerType !== 'private') reasons.push(`Employer: ${employerType}`);

  const finalScore = Math.max(0, Math.min(100, Math.round(priorityScore)));
  const band = finalScore >= 85 ? 'high' : finalScore >= 65 ? 'medium' : finalScore >= 45 ? 'low' : 'very-low';
  const action = finalScore >= 85 ? 'apply-now' : finalScore >= 65 ? 'apply' : finalScore >= 45 ? 'consider' : 'skip';

  return { score: finalScore, band, action, reasons, penalties };
}
