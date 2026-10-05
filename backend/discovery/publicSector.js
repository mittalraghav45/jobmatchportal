import { JobSourceAdapter } from './sourceAdapter.js';

/**
 * Public-sector discovery adapter factory.
 * `name` is the concrete provider; `kind` is the pipeline classification.
 */
export function createPublicSectorAdapter(fetchJobs, { name = 'public_sector', metadata = {} } = {}) {
  if (typeof fetchJobs !== 'function') {
    throw new TypeError('Public-sector adapter requires a fetch function.');
  }
  if (!name) throw new TypeError('Public-sector adapter requires a source name.');

  const adapter = new JobSourceAdapter(
    name,
    async context => fetchJobs({ ...context, sourceKind: 'public_sector' }),
    { kind: 'public_sector' }
  );

  adapter.metadata = { ...metadata };
  return adapter;
}

export const PUBLIC_SECTOR_SOURCE_TYPES = Object.freeze([
  'council',
  'university',
  'nhs',
  'civil_service',
  'other_public_body'
]);
