const STATUSES = ['saved', 'tailoring', 'ready_to_apply', 'applied', 'interview', 'offer', 'rejected', 'withdrawn'];
const TRANSITIONS = {
  saved: ['tailoring', 'withdrawn'],
  tailoring: ['ready_to_apply', 'saved', 'withdrawn'],
  ready_to_apply: ['applied', 'tailoring', 'withdrawn'],
  applied: ['interview', 'rejected', 'withdrawn'],
  interview: ['offer', 'rejected', 'withdrawn'],
  offer: ['withdrawn'],
  rejected: ['saved'],
  withdrawn: ['saved']
};

export function applicationStatuses() { return [...STATUSES]; }

export function createApplication({ job = {}, match = {}, specialist = 'all-in-one', now = new Date().toISOString() } = {}) {
  if (!job.title || !job.company) throw new Error('Job title and company are required.');
  return {
    id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    job: { id: job.id || null, title: job.title, company: job.company, url: job.url || null },
    match,
    specialist,
    status: 'saved',
    materials: {},
    notes: '',
    createdAt: now,
    updatedAt: now,
    appliedAt: null
  };
}

export function transitionApplication(application, nextStatus, now = new Date().toISOString()) {
  if (!STATUSES.includes(nextStatus)) throw new Error(`Unknown application status: ${nextStatus}`);
  if (!application || !application.status) throw new Error('Application status is required.');
  if (application.status !== nextStatus && !TRANSITIONS[application.status]?.includes(nextStatus)) {
    throw new Error(`Invalid transition from ${application.status} to ${nextStatus}.`);
  }
  return { ...application, status: nextStatus, appliedAt: nextStatus === 'applied' ? (application.appliedAt || now) : application.appliedAt, updatedAt: now };
}

export function attachApplicationMaterials(application, materials, now = new Date().toISOString()) {
  if (!application) throw new Error('Application is required.');
  return { ...application, materials: { ...application.materials, ...materials }, updatedAt: now };
}

export function applicationSummary(applications = []) {
  return applications.reduce((summary, application) => {
    const status = application.status || 'saved';
    summary[status] = (summary[status] || 0) + 1;
    return summary;
  }, Object.fromEntries(STATUSES.map(status => [status, 0])));
}
