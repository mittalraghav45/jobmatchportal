const ALLOWED_STATUSES = ['saved','tailoring','ready_to_apply','applied','interview','offer','rejected','withdrawn'];
const TRANSITIONS = {
  saved: ['tailoring','withdrawn'],
  tailoring: ['ready_to_apply','saved','withdrawn'],
  ready_to_apply: ['applied','tailoring','withdrawn'],
  applied: ['interview','rejected','withdrawn'],
  interview: ['offer','rejected','withdrawn'],
  offer: ['applied','withdrawn'],
  rejected: [],
  withdrawn: []
};

export function createApplication(input = {}) {
  const now = new Date().toISOString();
  return {
    id: input.id || `app_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    job: input.job || {},
    status: input.status || 'saved',
    matchScore: Number.isFinite(input.matchScore) ? input.matchScore : null,
    specialist: input.specialist || null,
    documents: input.documents || {},
    notes: String(input.notes || ''),
    createdAt: input.createdAt || now,
    updatedAt: now,
    appliedAt: input.appliedAt || null
  };
}

export function transitionApplication(application, nextStatus) {
  if (!application || !ALLOWED_STATUSES.includes(nextStatus)) throw new Error('Invalid application status.');
  const current = application.status || 'saved';
  if (current !== nextStatus && !TRANSITIONS[current]?.includes(nextStatus)) {
    throw new Error(`Invalid application transition: ${current} -> ${nextStatus}`);
  }
  const updated = { ...application, status: nextStatus, updatedAt: new Date().toISOString() };
  if (nextStatus === 'applied' && !updated.appliedAt) updated.appliedAt = updated.updatedAt;
  return updated;
}

export function updateApplicationDocuments(application, documents = {}) {
  return { ...application, documents: { ...(application.documents || {}), ...documents }, updatedAt: new Date().toISOString() };
}

export function summariseApplications(applications = []) {
  return applications.reduce((summary, app) => {
    const status = app.status || 'saved';
    summary.total += 1;
    summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
    return summary;
  }, { total: 0, byStatus: {} });
}

export const applicationStatuses = [...ALLOWED_STATUSES];
