import { discoverJobs } from '../discovery/sourceRegistry.js';
import { ingestJobs } from './jobIngestion.js';

function canonicalCompanyId(job) {
  return String(job.companyId || job.metadata?.companyId || job.companyName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function toIngestionRecord(job) {
  const sourceUrl = job.applyUrl || '';
  return {
    ...job,
    companyId: canonicalCompanyId(job),
    externalId: job.sourceJobId || job.externalId || job.id || '',
    source: {
      ats: job.source || 'unknown',
      url: sourceUrl
    },
    sourceKind: job.sourceKind || 'generic'
  };
}

/**
 * Discover through the source registry and immediately feed the canonical
 * records through the existing deduplication/identity layer. No persistence
 * occurs here; callers can decide when and where to write the result.
 */
export async function discoverAndIngestJobs({ registry, sources, context = {}, existing = new Map(), now } = {}) {
  const discovered = await discoverJobs({ registry, sources, context });
  const prepared = discovered.map(toIngestionRecord);
  const result = ingestJobs(prepared, { existing, ...(now ? { now } : {}) });

  return {
    ...result,
    discoveredCount: discovered.length,
    sourceCounts: discovered.reduce((counts, job) => {
      const source = job.source || 'unknown';
      counts[source] = (counts[source] || 0) + 1;
      return counts;
    }, {})
  };
}
