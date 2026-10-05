import { JobSourceAdapter } from './sourceAdapter.js';

/**
 * Public-sector discovery adapter.
 *
 * The adapter intentionally does not scrape an individual public-sector site.
 * It provides the stable contract for official feeds/connectors (for example
 * council, university, NHS or Civil Service sources) so each source can be
 * added without changing the matching pipeline.
 */
export function createPublicSectorAdapter(fetchJobs) {
  if (typeof fetchJobs !== 'function') {
    throw new TypeError('Public-sector adapter requires a fetch function.');
  }

  return new JobSourceAdapter(
    'public_sector',
    async context => fetchJobs({ ...context, sourceKind: 'public_sector' }),
    { kind: 'public_sector' }
  );
}

export const PUBLIC_SECTOR_SOURCE_TYPES = Object.freeze([
  'council',
  'university',
  'nhs',
  'civil_service',
  'other_public_body'
]);
