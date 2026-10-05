import {
  applicationStatuses as canonicalStatuses,
  createApplication as createCanonicalApplication,
  transitionApplication as transitionCanonicalApplication,
  updateApplicationDocuments,
  summariseApplications
} from './applicationStore.js';

// Backward-compatible facade for existing consumers/tests. All lifecycle rules
// and state transitions now live in applicationStore.js.
export function applicationStatuses() {
  return [...canonicalStatuses];
}

export function createApplication({ job = {}, match = {}, specialist = 'all-in-one', now = new Date().toISOString() } = {}) {
  if (!job.title || !job.company) throw new Error('Job title and company are required.');
  return createCanonicalApplication({
    job: { id: job.id || null, title: job.title, company: job.company, url: job.url || null },
    match,
    specialist,
    now
  });
}

export function transitionApplication(application, nextStatus, now = new Date().toISOString()) {
  return transitionCanonicalApplication(application, nextStatus, now);
}

export function attachApplicationMaterials(application, materials, now = new Date().toISOString()) {
  return updateApplicationDocuments(application, materials, now);
}

export function applicationSummary(applications = []) {
  const summary = summariseApplications(applications);
  return Object.fromEntries(canonicalStatuses.map(status => [status, summary.byStatus[status] || 0]));
}
