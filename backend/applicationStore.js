const ALLOWED_STATUSES = ['saved','tailoring','ready_to_apply','applied','interview','offer','rejected','withdrawn'];

// Canonical application lifecycle. applicationWorkflow.js is a compatibility facade only.
const TRANSITIONS = {
  saved: ['tailoring','withdrawn'],
  tailoring: ['ready_to_apply','saved','withdrawn'],
  ready_to_apply: ['applied','tailoring','withdrawn'],
  applied: ['interview','rejected','withdrawn'],
  interview: ['offer','rejected','withdrawn'],
  offer: ['withdrawn'],
  rejected: ['saved'],
  withdrawn: ['saved']
};

export function createApplication(input = {}) {
  const now = input.now || new Date().toISOString();
  const job = input.job || {};
  return {
    id: input.id || `app_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    job,
    status: input.status || 'saved',
    matchScore: Number.isFinite(input.matchScore) ? input.matchScore : null,
    match: input.match || {},
    specialist: input.specialist || 'all-in-one',
    documents: input.documents || input.materials || {},
    materials: input.materials || input.documents || {},
    notes: String(input.notes || ''),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    appliedAt: input.appliedAt || null
  };
}

export function transitionApplication(application, nextStatus, now = new Date().toISOString()) {
  if (!application || !ALLOWED_STATUSES.includes(nextStatus)) throw new Error('Invalid application status.');
  const current = application.status || 'saved';
  if (current !== nextStatus && !TRANSITIONS[current]?.includes(nextStatus)) {
    // Preserve the legacy error wording expected by applicationWorkflow consumers
    // while retaining the canonical wording for applicationStore consumers.
    throw new Error(`Invalid transition: ${current} -> ${nextStatus} (Invalid application transition)`);
  }
  const updated = { ...application, status: nextStatus, updatedAt: now };
  if (nextStatus === 'applied' && !updated.appliedAt) updated.appliedAt = updated.updatedAt;
  return updated;
}

export function updateApplicationDocuments(application, documents = {}, now = new Date().toISOString()) {
  const merged = { ...(application.documents || {}), ...documents };
  return {
    ...application,
    documents: merged,
    materials: { ...(application.materials || {}), ...documents },
    updatedAt: now
  };
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
