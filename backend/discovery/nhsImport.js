import { createNhsJobsAdapter } from './nhsJobs.js';

/**
 * Discover a bounded NHS Jobs batch without persisting or bypassing the
 * existing ingestion/verification pipeline. The caller owns persistence.
 */
export async function discoverNhsJobs({ feedUrl, fetchImpl, limit = 100, context = {} } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new RangeError('NHS discovery limit must be between 1 and 500.');
  }

  const adapter = createNhsJobsAdapter({ feedUrl, fetchImpl });
  const jobs = await adapter.discover({ ...context, sourceKind: 'nhs' });
  return jobs.slice(0, limit);
}
