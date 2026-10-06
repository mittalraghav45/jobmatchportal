const FOLLOW_UP_DAYS = 7;

export function calculateFollowUp(application, now = new Date()) {
  const status = String(application?.status || 'saved');
  const appliedAt = application?.appliedAt ? new Date(application.appliedAt) : null;
  const explicit = application?.followUpAt ? new Date(application.followUpAt) : null;

  if (explicit && Number.isFinite(explicit.getTime())) {
    const due = explicit.getTime() <= now.getTime();
    return { followUpAt: explicit.toISOString(), due, stale: due && ['applied','interview'].includes(status), reason: 'scheduled' };
  }

  if (!appliedAt || !Number.isFinite(appliedAt.getTime()) || !['applied','interview'].includes(status)) {
    return { followUpAt: null, due: false, stale: false, reason: null };
  }

  const followUp = new Date(appliedAt.getTime() + FOLLOW_UP_DAYS * 86400000);
  const due = followUp.getTime() <= now.getTime();
  return { followUpAt: followUp.toISOString(), due, stale: due, reason: 'default-7-day-follow-up' };
}

export function buildFollowUpQueue(applications = [], now = new Date()) {
  return applications
    .map(application => ({ application, followUp: calculateFollowUp(application, now) }))
    .filter(item => item.followUp.due && ['applied','interview'].includes(String(item.application.status || '')))
    .sort((a, b) => new Date(a.followUp.followUpAt) - new Date(b.followUp.followUpAt))
    .map(item => ({
      applicationId: item.application.applicationId || item.application.id,
      job: item.application.job,
      status: item.application.status,
      followUpAt: item.followUp.followUpAt,
      daysOverdue: Math.max(0, Math.floor((now.getTime() - new Date(item.followUp.followUpAt).getTime()) / 86400000)),
      recruiter: item.application.recruiter || null,
      notes: item.application.notes || ''
    }));
}
